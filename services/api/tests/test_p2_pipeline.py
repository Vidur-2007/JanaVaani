"""P2: routing vote, priority formula, duplicate scoring, hash chain, chat turn → confirm → grievance,
fallback with FORCE_FAIL_GEMINI and both providers failing, uploads (EXIF strip, WebP, quality)."""
import io

from app.ml import classifier, embeddings
from app.pipeline import audit, scoring

from .conftest import token


def cls(dep, p):
    return {"department": dep, "confidence": p, "proba": {dep: p}}


def test_routing_vote_rules():
    r = scoring.route(cls("water", 0.91), "water", "water")
    assert r["department"] == "water" and r["method"] == "auto" and r["confidence"] >= 0.75
    assert "all agree" in r["explanation_en"]
    r = scoring.route(cls("roads", 0.4), "drainage", "drainage")          # majority of LLMs wins
    assert r["department"] == "drainage"
    r = scoring.route(cls("roads", 0.7), "drainage", "traffic")            # all differ, classifier p>=0.6
    assert r["department"] == "roads"
    r = scoring.route(cls("roads", 0.3), "drainage", "traffic")            # all differ, classifier weak -> gemini
    assert r["department"] == "drainage" and r["needs_review"]
    r = scoring.route(cls("other", 0.9), None, None)                       # 'other' always needs review
    assert r["needs_review"]
    r = scoring.route(cls("power", 0.95), None, None)                      # both LLMs down: classifier only
    assert r["department"] == "power" and r["confidence"] == 0.95


def test_priority_formula_and_floor():
    p = scoring.priority("high", ["live_wire", "near_school", "fire"], False, 0.5, ["children"], 1)
    assert p["score"] == 50 + 20 + 5 + 8 and p["level"] == "critical"        # hazards capped at +20; 83 >= 80
    p = scoring.priority("low", [], True, 0, [], 1)                          # emergency rule floor
    assert p["score"] == 80 and p["level"] == "critical" and any(f["key"] == "emergency_rule" for f in p["factors"])
    p = scoring.priority("medium", [], False, 0, [], 32)                     # community: min(15, round(5*log2(1+31)))
    assert next(f["points"] for f in p["factors"] if f["key"] == "community") == 15
    assert scoring.sla_hours("critical", True) == 4 and scoring.sla_hours("low", False) == 168


def test_hash_chain_detects_tamper(client, seeded):
    from app.core.db import session_scope
    from app.models import TimelineEvent
    from sqlalchemy import select
    with session_scope() as db:
        assert audit.verify(db)["valid"]
        e = db.execute(select(TimelineEvent).order_by(TimelineEvent.seq.desc()).limit(1)).scalar_one()
        gid, old = e.grievance_id, e.message_en
        e.message_en = "tampered"
        db.flush()
        v = audit.verify(db, gid)
        assert not v["valid"] and v["first_broken_event_id"] == e.id
        e.message_en = old
        db.flush()
        assert audit.verify(db, gid)["valid"]


def test_classifier_loads_and_predicts():
    assert classifier.available()
    p = classifier.predict("neellu raavadam ledu moodu rojula nunchi")
    assert p["department"] == "water" and 0 < p["confidence"] <= 1


def test_chat_flow_both_providers_down_creates_grievance(client, seeded):
    """No Gemini/Groq keys == both providers failing: classifier + rules still produce a routed grievance."""
    h = token(client, "lakshmi@janavaani.test")
    r = client.post("/api/v1/chat/turn", headers=h, json={"text": "Kukatpally lo street light work avvadam ledu ma galli lo, chala dark ga undi",
                                                          "ui_lang": "te", "input_mode": "text"}).json()
    assert r["stage"] == "confirming", r
    assert r["detected_language"] == "te" and r["is_code_mixed"] is True
    d = r["draft"]
    assert d["category"] == "streetlights" and d["location"]["ward_id"] == "W-KKP-01"
    assert d["routing_preview"]["votes"][0]["source"] == "classifier" and d["priority_preview"]["sla_hours"] > 0
    r2 = client.post("/api/v1/chat/turn", headers=h, json={"session_id": r["session_id"], "action": "file_new_anyway", "ui_lang": "te"}).json()
    assert r2["stage"] == "submitted", r2
    gid = r2["submitted"][0]["grievance_id"]
    det = client.get(f"/api/v1/grievances/{gid}", headers=h).json()
    types = [e["type"] for e in det["timeline"]]
    assert types[:3] == ["registered", "classified", "assigned"] and det["status"] == "assigned"
    assert det["assigned_officer"]["department_id"] == "streetlights"
    assert det["description"]["original"].startswith("Kukatpally lo")          # original preserved


def test_chat_emergency_then_continue(client, seeded):
    r = client.post("/api/v1/chat/turn", json={"text": "మా బడి దగ్గర కరెంటు తీగ తెగి పడింది, Kukatpally", "ui_lang": "te"}).json()
    assert r["stage"] == "emergency" and {c["number"] for c in r["emergency"]["contacts"]} >= {"112", "1912"}
    assert r["reply"]["lang"] == "te"
    r2 = client.post("/api/v1/chat/turn", json={"session_id": r["session_id"], "text": "school daggara", "ui_lang": "te",
                                                "action": "continue_after_emergency"}).json()
    assert r2["stage"] == "confirming" and r2["draft"]["priority_preview"]["score"] >= 80
    r3 = client.post("/api/v1/chat/turn", json={"session_id": r["session_id"], "action": "file_new_anyway", "ui_lang": "te"}).json()
    assert r3["submitted"][0].get("guest_pin") and len(r3["submitted"][0]["guest_pin"]) == 6   # guest gets a PIN
    gid, pin = r3["submitted"][0]["grievance_id"], r3["submitted"][0]["guest_pin"]
    assert client.get(f"/api/v1/grievances/{gid}").status_code == 403
    g = client.get(f"/api/v1/grievances/{gid}?pin={pin}").json()
    assert g["is_emergency"] and g["priority"] == "critical"


def test_duplicate_detection_and_support(client, seeded):
    lat, lng = 17.4968 + 0.0012, 78.3614 + 0.0008      # Miyapur X Roads story cluster
    d = client.post("/api/v1/grievances/check-duplicates", json={"text": "Huge pothole on the main road at Miyapur X roads",
                                                                 "location": {"lat": lat, "lng": lng, "source": "gps"}, "category": "roads"}).json()
    assert d and d[0]["distance_m"] < 500 and "signals" in d[0]
    far = client.post("/api/v1/grievances/check-duplicates", json={"text": "Huge pothole on the main road",
                                                                   "location": {"lat": 17.3457, "lng": 78.5522, "source": "gps"}, "category": "roads"}).json()
    assert all(x["distance_m"] <= 500 for x in far)                    # nothing from Miyapur, 20 km away
    gid = d[0]["grievance_id"]
    h = token(client, "imran@janavaani.test")
    before = client.get(f"/api/v1/officer/inbox?q={gid}", headers=token(client, "ravi.roads@janavaani.test")).json()
    s = client.post(f"/api/v1/grievances/{gid}/support", headers=h).json()
    assert s["support_count"] >= 2
    again = client.post(f"/api/v1/grievances/{gid}/support", headers=h).json()
    assert again["support_count"] == s["support_count"]               # unique per user


def test_quick_analyze_and_create(client, seeded):
    a = client.post("/api/v1/grievances/analyze", json={"text": "मुख्य सड़क पर बड़ा गड्ढा है, LB Nagar", "ui_lang": "hi"}).json()
    assert a["category"] == "roads" and a["location"]["ward_name"] == "LB Nagar"
    c = client.post("/api/v1/grievances", json={"draft": a, "media_ids": [], "is_anonymous": True, "is_private": False}).json()
    assert c["grievance"]["id"].startswith("GRV-") and c.get("guest_pin")


def test_upload_strips_exif_and_reencodes(client):
    from PIL import Image
    im = Image.new("RGB", (800, 600), (120, 130, 140))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"
    buf = io.BytesIO()
    im.save(buf, "JPEG", exif=exif.tobytes())
    r = client.post("/api/v1/uploads", files={"file": ("p.jpg", buf.getvalue(), "image/jpeg")}, data={"purpose": "evidence"}).json()
    assert r["kind"] == "image" and r["quality"]["issue"] in ("blurry", "none")
    from app.core.db import session_scope
    from app.models import Media
    with session_scope() as db:
        m = db.get(Media, r["id"])
        saved = Image.open(m.storage_path)
        assert saved.format == "WEBP" and not dict(saved.getexif())
    bad = client.post("/api/v1/uploads", files={"file": ("x.txt", b"hello", "text/plain")}, data={"purpose": "evidence"})
    assert bad.status_code == 415 and bad.json()["error"]["code"] == "unsupported_type"
