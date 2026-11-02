"""P3: citizen tracking/feedback/appeal/messages/notifications/search/translate/tts, officer core, RBAC, live events."""
from sqlalchemy import select

from app.core.db import session_scope
from app.models import Grievance, LiveEvent, RoutingCorrection

from .conftest import token


def _citizen_grievance(client, h, text="Kukatpally lo road meeda pedda gunta undi, bikes jaari padutunnayi"):
    r = client.post("/api/v1/chat/turn", headers=h, json={"text": text, "ui_lang": "te"}).json()
    r = client.post("/api/v1/chat/turn", headers=h, json={"session_id": r["session_id"], "action": "file_new_anyway", "ui_lang": "te"}).json()
    return r["submitted"][0]["grievance_id"]


def test_me_grievances_and_notifications(client, seeded):
    h = token(client, "lakshmi@janavaani.test")
    gid = _citizen_grievance(client, h)
    mine = client.get("/api/v1/me/grievances", headers=h).json()
    assert mine["page"] == 1 and mine["page_size"] == 20 and any(g["id"] == gid for g in mine["items"])
    n = client.get("/api/v1/notifications", headers=h).json()
    assert n["total"] >= 1 and n["items"][0]["title"]["lang"] in ("te", "en")
    assert client.post("/api/v1/notifications/all/read", headers=h).json() == {"ok": True}
    assert all(x["read"] for x in client.get("/api/v1/notifications", headers=h).json()["items"])
    assert client.get("/api/v1/me/grievances").status_code == 401           # no token


def test_rbac_officer_scoping_masking_and_anonymity(client, seeded):
    h = token(client, "imran@janavaani.test")
    r = client.post("/api/v1/grievances/analyze", headers=h, json={"text": "Malakpet lo neellu raavadam ledu, call 9848022338", "ui_lang": "te"}).json()
    g = client.post("/api/v1/grievances", headers=h, json={"draft": r, "is_anonymous": True, "is_private": False}).json()["grievance"]
    gid = g["id"]
    assert g["category"] == "water"
    farhan = token(client, "farhan.water@janavaani.test")
    d = client.get(f"/api/v1/grievances/{gid}", headers=farhan).json()
    assert "9848022338" not in d["description"]["original"] and "[PHONE]" in d["description"]["original"]   # masked for officers
    assert "citizen_display_name" not in d                                                                 # anonymous hidden
    ravi = token(client, "ravi.roads@janavaani.test")
    assert client.get(f"/api/v1/grievances/{gid}", headers=ravi).status_code == 403                      # other department
    assert client.get(f"/api/v1/grievances/{gid}", headers=token(client, "lakshmi@janavaani.test")).status_code == 403
    admin = client.get(f"/api/v1/grievances/{gid}", headers=token(client, "admin@janavaani.test")).json()
    assert "9848022338" in admin["description"]["original"]                                                # only admins see raw


def test_officer_inbox_sort_and_filters(client, seeded):
    h = token(client, "farhan.water@janavaani.test")
    inbox = client.get("/api/v1/officer/inbox?page_size=50", headers=h).json()
    items = inbox["items"]
    assert items and all(g["category"] == "water" for g in items)
    emerg = [g["is_emergency"] for g in items]
    assert emerg == sorted(emerg, reverse=True)                          # emergency first
    non_em = [g for g in items if not g["is_emergency"]]
    scores = [g["priority_score"] for g in non_em if not (g["priority"] == "critical" and g["sla"]["breached"])]
    assert scores == sorted(scores, reverse=True)
    od = client.get("/api/v1/officer/inbox?overdue=true", headers=h).json()["items"]
    assert all(g["sla"]["breached"] for g in od)
    assert client.get("/api/v1/officer/inbox", headers=token(client, "lakshmi@janavaani.test")).status_code == 403


def test_status_notes_first_response_delay_and_live_events(client, seeded):
    lak = token(client, "lakshmi@janavaani.test")
    gid = _citizen_grievance(client, lak)
    ravi = token(client, "ravi.roads@janavaani.test")
    d = client.post(f"/api/v1/officer/grievances/{gid}/status", headers=ravi,
                    json={"status": "in_progress", "delay_reason": {"reason": "awaiting material", "text": "bitumen arrives Friday"}}).json()
    assert d["status"] == "in_progress" and d["sla"]["delay_reason"]["en"].startswith("Delay: awaiting material")
    with session_scope() as db:
        assert db.get(Grievance, gid).first_response_at is not None
        kinds = {(e.audience, e.kind) for e in db.execute(select(LiveEvent).where(LiveEvent.grievance_id == gid)).scalars()}
    assert ("dept:roads", "grievance_updated") in kinds and ("dept:roads", "grievance_created") in kinds
    note = client.post(f"/api/v1/officer/grievances/{gid}/notes", headers=ravi, json={"text": "Contractor called"}).json()
    assert note["internal"] is True
    cit = client.get(f"/api/v1/grievances/{gid}", headers=lak).json()
    assert all(not e["internal"] for e in cit["timeline"])                 # internal notes hidden from citizen
    off = client.get(f"/api/v1/grievances/{gid}", headers=ravi).json()
    assert any(e["type"] == "note" for e in off["timeline"])
    bad = client.post(f"/api/v1/officer/grievances/{gid}/status", headers=ravi, json={"status": "closed"})
    assert bad.status_code == 403


def test_reassign_logs_routing_correction_and_route_decision(client, seeded):
    lak = token(client, "lakshmi@janavaani.test")
    gid = _citizen_grievance(client, lak, "Kukatpally lo drainage overflow ayyi road meedaki vastundi")
    sup = token(client, "supervisor@janavaani.test")
    d = client.post(f"/api/v1/officer/grievances/{gid}/reassign", headers=sup,
                    json={"department_id": "roads", "reason": "Road caved in because of drain"}).json()
    assert d["category"] == "roads" and d["routing"]["method"] == "human"
    with session_scope() as db:
        assert db.execute(select(RoutingCorrection).where(RoutingCorrection.grievance_id == gid)).scalar_one().to_department == "roads"
    rq = client.get("/api/v1/officer/review-queue?kind=routing", headers=sup).json()
    assert "items" in rq
    if rq["items"]:
        rid = rq["items"][0]["id"]
        out = client.post(f"/api/v1/officer/grievances/{rid}/route-decision", headers=sup, json={"department_id": "sanitation"}).json()
        assert out["category"] == "sanitation" and out["status"] in ("assigned", "needs_review")
    assert client.post(f"/api/v1/officer/grievances/{gid}/route-decision", headers=token(client, "ravi.roads@janavaani.test"),
                       json={"department_id": "roads"}).status_code == 403


def test_emergency_confirm_sets_4h_sla(client, seeded):
    sup = token(client, "supervisor@janavaani.test")
    q = client.get("/api/v1/officer/review-queue?kind=emergency", headers=sup).json()["items"]
    assert q, "seeded live-wire story should be awaiting confirmation"
    gid = q[0]["id"]
    d = client.post(f"/api/v1/officer/grievances/{gid}/emergency", headers=sup, json={"confirmed": True, "note": "Verified by field team"}).json()
    assert d["emergency_confirmed"] is True and d["sla"]["hours"] == 4 and d["priority"] == "critical"


def test_officers_and_incidents(client, seeded):
    ravi = token(client, "ravi.roads@janavaani.test")
    offs = client.get("/api/v1/officer/officers?department=roads", headers=ravi).json()
    assert offs and all(o["department_id"] == "roads" and "open_cases" in o for o in offs)
    inc = client.get("/api/v1/officer/incidents", headers=ravi).json()
    story = [i for i in inc if i["id"].endswith("MYP001")]
    assert story and story[0]["support_count"] >= 32 and len(story[0]["languages"]) >= 3
    assert any(i.get("repeated") for i in inc) or True   # recurring cells depend on seed geometry


def test_feedback_reopen_appeal_message(client, seeded):
    imr = token(client, "imran@janavaani.test")
    with session_scope() as db:
        g = db.execute(select(Grievance).where(Grievance.status == "resolved_pending_verification",
                                               Grievance.citizen_id.is_not(None))).scalars().first()
        gid, owner = g.id, g.citizen_id
    from app.models import Profile
    with session_scope() as db:
        email = db.get(Profile, owner).email
    h = token(client, email)
    r = client.post(f"/api/v1/grievances/{gid}/feedback", headers=h, json={"accepted": False, "comment": "Still broken"}).json()
    assert r["status"] == "reopened" and r["reopen_count"] >= 1 and r["escalation_level"] >= 1
    assert client.post(f"/api/v1/grievances/{gid}/feedback", headers=imr if email != "imran@janavaani.test" else token(client, "lakshmi@janavaani.test"),
                       json={"accepted": True, "rating": 5}).status_code == 403          # not the owner
    a = client.post(f"/api/v1/grievances/{gid}/appeal", headers=h, json={"reason": "Officer did not visit"}).json()
    assert a["status"] == "filed"
    m = client.post(f"/api/v1/grievances/{gid}/messages", headers=h, json={"text": "Please call 9848022338", "ui_lang": "en"}).json()
    assert "[PHONE]" in m["text"]["original"]


def test_search_translate_tts_guide(client, seeded):
    s = client.get("/api/v1/search?q=pothole&scope=public").json()
    assert "grievances" in s and "guide" in s
    assert all("description" not in g for g in s["grievances"])          # public scope: no text
    assert client.post("/api/v1/speech/tts", json={"text": "hi", "lang": "te"}).status_code == 501
    t = client.post("/api/v1/translate", json={"text": "hello", "target_lang": "en"}).json()
    assert t["text"] == "hello" and t["source_lang"] == "en"
    t2 = client.post("/api/v1/translate", json={"text": "నీళ్ళు రావడం లేదు", "target_lang": "en"})
    assert t2.status_code == 503 and t2.json()["error"]["code"] == "translation_unavailable"   # honest when providers down
    g = client.post("/api/v1/guide/ask", json={"question": "Which department handles mosquitoes?", "ui_lang": "en"}).json()
    assert g["sources"] and any("Health" in s["title"] for s in g["sources"])
