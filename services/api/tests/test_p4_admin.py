"""P4: officer brief/draft/message, resolve verification, appeal decision, bulk merge, scheduler/clock escalations,
spike detection (Charminar water story), admin analytics endpoints."""
import io

from sqlalchemy import select

from app.core.db import session_scope
from app.models import AlertRow, Grievance, Media, Profile

from .conftest import token


def _png(color, seed=1):
    from PIL import Image, ImageDraw
    import random
    r = random.Random(seed)
    im = Image.new("RGB", (640, 480), color)
    d = ImageDraw.Draw(im)
    for _ in range(30):
        x, y = r.randint(0, 600), r.randint(0, 440)
        d.ellipse([x, y, x + r.randint(10, 90), y + r.randint(10, 90)], fill=(r.randint(0, 255), r.randint(0, 255), r.randint(0, 255)))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def _upload(client, h, data, purpose, gid=None, lat=None, lng=None):
    form = {"purpose": purpose}
    if gid:
        form["grievance_id"] = gid
    if lat is not None:
        form.update(lat=str(lat), lng=str(lng))
    r = client.post("/api/v1/uploads", headers=h, files={"file": ("p.png", data, "image/png")}, data=form)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _new_case(client, text="Kukatpally lo road meeda pedda gunta undi"):
    lak = token(client, "lakshmi@janavaani.test")
    r = client.post("/api/v1/chat/turn", headers=lak, json={"text": text, "ui_lang": "te"}).json()
    r = client.post("/api/v1/chat/turn", headers=lak, json={"session_id": r["session_id"], "action": "file_new_anyway", "ui_lang": "te"}).json()
    return r["submitted"][0]["grievance_id"], lak


def test_brief_and_draft_reply_fallback_and_message(client, seeded):
    gid, lak = _new_case(client)
    ravi = token(client, "ravi.roads@janavaani.test")
    b = client.post(f"/api/v1/officer/grievances/{gid}/brief", headers=ravi, json={}).json()
    assert b["generated_by"] == "fallback" and b["situation"] and isinstance(b["similar_resolved"], list)
    d = client.post(f"/api/v1/officer/grievances/{gid}/draft-reply", headers=ravi, json={"intent": "schedule_visit"}).json()
    assert gid in d["draft_en"] and d["draft_citizen"]["en"] == d["draft_en"]
    m = client.post(f"/api/v1/officer/grievances/{gid}/message", headers=ravi, json={"text_en": "We will visit tomorrow."}).json()
    assert m["sender"] == "officer"
    assert any(n["type"] == "message" for n in client.get("/api/v1/notifications", headers=lak).json()["items"])


def test_resolve_with_citizens_own_photo_is_suspicious(client, seeded):
    gid, lak = _new_case(client, "Kukatpally lo footpath tiles anni break ayyayi")
    photo = _png((40, 60, 80), 7)
    _upload(client, lak, photo, "evidence", gid)
    ravi = token(client, "ravi.roads@janavaani.test")
    proof = _upload(client, ravi, photo, "resolution_proof")
    d = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed"}).json()
    v = d["ai_verification"]
    assert d["status"] == "resolved_pending_verification"
    assert v["verdict"] == "suspicious" and v["checks"]["duplicate_photo"] and v["assessment"] == "rejected_evidence"
    with session_scope() as db:
        assert db.execute(select(AlertRow).where(AlertRow.dedupe_key.like(f"susp:{gid}%"))).scalar_one()
    assert any(n["type"] == "verification_request" for n in client.get("/api/v1/notifications", headers=lak).json()["items"])


def test_resolve_far_away_is_suspicious_and_new_photo_needs_human(client, seeded):
    gid, lak = _new_case(client, "Kukatpally lo road antha damage ayyindi")
    ravi = token(client, "ravi.roads@janavaani.test")
    far = _upload(client, ravi, _png((200, 200, 0), 3), "resolution_proof", lat=17.35, lng=78.55)
    v = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [far], "note": "done"}).json()["ai_verification"]
    assert v["verdict"] == "suspicious" and v["checks"]["distance_m"] > 500
    gid2, _ = _new_case(client, "Kukatpally lo speed breaker break ayyindi road meeda")
    ok = _upload(client, ravi, _png((10, 200, 10), 5), "resolution_proof")
    v2 = client.post(f"/api/v1/officer/grievances/{gid2}/resolve", headers=ravi, json={"media_ids": [ok], "note": "done"}).json()["ai_verification"]
    assert v2["verdict"] == "unclear" and v2["assessment"] == "needs_human_review"   # never claims proof without vision


def test_appeal_decision_and_bulk_merge(client, seeded):
    gid, lak = _new_case(client, "Kukatpally lo road meeda gunta undi")
    client.post(f"/api/v1/grievances/{gid}/appeal", headers=lak, json={"reason": "Not handled properly"})
    sup = token(client, "supervisor@janavaani.test")
    d = client.post(f"/api/v1/officer/grievances/{gid}/appeal-decision", headers=sup, json={"decision": "dismissed", "note": "Work is scheduled"}).json()
    assert d["appeal"]["status"] == "dismissed"
    a, _ = _new_case(client, "Kukatpally main road pedda gunta undi")
    b, _ = _new_case(client, "Kukatpally road lo gunta valla accident")
    r = client.post("/api/v1/officer/bulk", headers=sup, json={"ids": [a, b], "action": "merge", "payload": {"parent_id": a}}).json()
    assert r["updated"] == 1
    with session_scope() as db:
        ga, gb = db.get(Grievance, a), db.get(Grievance, b)
        assert gb.status == "merged" and gb.incident_id == ga.incident_id and ga.incident_id


def test_clock_advance_fires_escalations(client, seeded):
    admin = token(client, "admin@janavaani.test")
    before = client.get("/api/v1/admin/demo/clock", headers=admin).json()["offset_minutes"]
    r = client.post("/api/v1/admin/demo/clock", headers=admin, json={"advance_hours": 48}).json()
    assert r["offset_minutes"] == before + 48 * 60
    assert r["escalations"]["escalated_l1"] + r["escalations"]["escalated_l2"] > 0
    sup = token(client, "supervisor@janavaani.test")
    assert any(n["type"] == "escalation" for n in client.get("/api/v1/notifications", headers=sup).json()["items"])
    assert client.post("/api/v1/admin/demo/clock", headers=token(client, "ravi.roads@janavaani.test"), json={"advance_hours": 1}).status_code == 403


def test_spike_detection_finds_charminar_water_story(client, seeded):
    sup = token(client, "supervisor@janavaani.test")
    alerts = client.get("/api/v1/admin/alerts", headers=sup).json()
    spikes = [a for a in alerts if a["kind"] == "spike" and a["category"] == "water"]
    assert spikes and any(set(a["languages"] or []) & {"ur", "hi"} for a in spikes)
    kinds = {a["kind"] for a in alerts}
    assert {"suspicious_closure", "repeated_reopen"} <= kinds


def test_admin_analytics(client, seeded):
    h = token(client, "admin@janavaani.test")
    k = client.get("/api/v1/admin/kpis?days=30", headers=h).json()
    assert k["total"] > 0 and set(k["deltas"]) == {"total", "open", "resolved", "overdue", "sla_compliance_pct", "avg_resolution_hours"}
    perf = client.get("/api/v1/admin/departments/performance?days=180", headers=h).json()
    assert [p["rank"] for p in perf] == list(range(1, len(perf) + 1))
    assert all(0 <= p["score"] <= 100 for p in perf)
    wl = client.get("/api/v1/admin/officers/workload", headers=h).json()
    assert wl and "officer" in wl[0]
    tr = client.get("/api/v1/admin/analytics/trends?days=30&group=week", headers=h).json()
    assert tr and all("created" in t for t in tr)
    bd = client.get("/api/v1/admin/analytics/breakdown?by=zone&days=180", headers=h).json()
    assert {r["key"] for r in bd} <= {"Serilingampally", "Kukatpally", "Khairatabad", "Secunderabad", "Charminar", "LB Nagar", "unknown"}
    mp = client.get("/api/v1/admin/map?days=30", headers=h).json()
    assert mp and all("id" in p for p in mp)
    assert client.get("/api/v1/admin/kpis", headers=token(client, "lakshmi@janavaani.test")).status_code == 403
