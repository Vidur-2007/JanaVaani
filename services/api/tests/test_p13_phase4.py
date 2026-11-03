"""Phase 4 requirement checks (Spec B §8 officer AI, resolution, escalation; §9 analytics), one behaviour per test.
Providers are faked per task where an AI answer is needed; scenarios are set up in the DB without moving the demo clock."""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.ai import gateway
from app.core import clock
from app.core.db import session_scope
from app.models import AlertRow, Asset, Grievance, Incident, Media, Message, Notification, Profile, TimelineEvent
from app.pipeline import workflow

from .conftest import token
from .test_p4_admin import _new_case, _png, _upload

RAVI, SUP, ADMIN = "ravi.roads@janavaani.test", "supervisor@janavaani.test", "admin@janavaani.test"


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    from app.core.ratelimit import limiter
    limiter.reset()     # every case is filed through two chat turns


def _uid(email):
    with session_scope() as db:
        return db.execute(select(Profile.id).where(Profile.email == email)).scalar_one()


def _notes(user_email, gid=None, type_=None):
    uid = _uid(user_email)
    with session_scope() as db:
        q = select(Notification).where(Notification.user_id == uid)
        if gid:
            q = q.where(Notification.grievance_id == gid)
        if type_:
            q = q.where(Notification.type == type_)
        return [(n.type, n.title["en"], n.body["en"]) for n in db.execute(q).scalars()]


def _fake_ai(monkeypatch, answers: dict):
    """gateway.run answers per task from `answers` (a dict or a callable(prompt)); other tasks behave as providers down."""
    calls = []

    def run(task, prompt, schema=None, images=None, cache=None, cache_extra=""):
        calls.append({"task": task, "prompt": prompt, "cache": cache, "cache_extra": cache_extra, "images": images})
        a = answers.get(task)
        if a is None:
            return None, {"provider": "none", "fallback_used": True}
        return (a(prompt) if callable(a) else a), {"provider": "gemini", "fallback_used": False}
    monkeypatch.setattr(gateway, "run", run)
    return calls


# ---------- §8 officer brief
def test_brief_uses_the_last_10_events_similar_resolved_cases_and_is_cached_per_update(client, seeded, monkeypatch):
    gid, _ = _new_case(client, "Kukatpally lo road meeda gunta valla bike padindi")
    ravi = token(client, RAVI)
    for i in range(12):
        client.post(f"/api/v1/officer/grievances/{gid}/notes", headers=ravi, json={"text": f"brief-note-{i:02d}"})
    calls = _fake_ai(monkeypatch, {"officer_brief": {"situation": "Pothole caused a fall", "evidence": ["1 report"],
                                                     "risks": ["injury"], "suggested_next_steps": ["patch"], "missing_info": []}})
    b = client.post(f"/api/v1/officer/grievances/{gid}/brief", headers=ravi, json={}).json()
    prompt = calls[-1]["prompt"]
    assert all(f"brief-note-{i:02d}" in prompt for i in range(2, 12))          # the last 10 timeline events
    assert "brief-note-00" not in prompt and "brief-note-01" not in prompt
    assert b["generated_by"] == "gemini" and b["situation"] == "Pothole caused a fall"
    assert 0 < len(b["similar_resolved"]) <= 3 and all(s["resolution_note"] for s in b["similar_resolved"])
    with session_scope() as db:
        assert all(db.get(Grievance, s["grievance_id"]).resolved_at and db.get(Grievance, s["grievance_id"]).category == "roads"
                   for s in b["similar_resolved"])
        stamp = clock.iso(db.get(Grievance, gid).updated_at)
    assert calls[-1]["cache_extra"] == stamp and calls[-1]["cache"] is True      # cached by (id, updated_at)
    client.post(f"/api/v1/officer/grievances/{gid}/brief", headers=ravi, json={"refresh": True})
    assert calls[-1]["cache"] is False


# ---------- §8 draft reply and message
def test_draft_reply_is_capped_at_80_words_in_whole_sentences(client, seeded, monkeypatch):
    gid, _ = _new_case(client, "Kukatpally lo road meeda chala gunta lu unnayi")
    ravi = token(client, RAVI)
    long_reply = " ".join(["We have received your complaint and our road team will inspect the site this week."] * 8)
    _fake_ai(monkeypatch, {"draft_reply": {"draft_en": long_reply}})
    d = client.post(f"/api/v1/officer/grievances/{gid}/draft-reply", headers=ravi, json={"intent": "schedule_visit"}).json()
    assert len(d["draft_en"].split()) <= 80 and d["draft_en"].endswith(".") and d["draft_en"] in long_reply
    _fake_ai(monkeypatch, {"draft_reply": {"draft_en": " ".join(["word"] * 120)}})          # one run-on sentence
    d = client.post(f"/api/v1/officer/grievances/{gid}/draft-reply", headers=ravi, json={"intent": "schedule_visit"}).json()
    assert gid in d["draft_en"] and len(d["draft_en"].split()) <= 80                         # template instead
    assert d["draft_citizen"]["en"] == d["draft_en"]


def test_officer_message_stores_both_languages_notifies_and_sets_first_response(client, seeded):
    gid, _ = _new_case(client, "Kukatpally lo footpath meeda gunta undi")
    with session_scope() as db:
        db.get(Grievance, gid).first_response_at = None
    m = client.post(f"/api/v1/officer/grievances/{gid}/message", headers=token(client, RAVI),
                    json={"text_en": "Our team visits tomorrow."}).json()
    assert m["text"]["en"] == "Our team visits tomorrow." and "original" in m["text"]
    with session_scope() as db:
        assert db.get(Grievance, gid).first_response_at is not None
        assert db.execute(select(Message).where(Message.grievance_id == gid)).scalars().first()
    assert ("message", "New message from the officer", "Our team visits tomorrow.") in _notes("lakshmi@janavaani.test", gid)


# ---------- §8 resolve
def test_citizen_evidence_cannot_be_submitted_as_proof(client, seeded):
    gid, lak = _new_case(client, "Kukatpally lo road side gunta pedda ga undi")
    evidence = _upload(client, lak, _png((90, 30, 30), 11), "evidence", gid)
    r = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=token(client, RAVI),
                    json={"media_ids": [evidence], "note": "fixed"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_proof"
    with session_scope() as db:
        assert db.get(Media, evidence).purpose == "evidence" and db.get(Grievance, gid).status != "resolved_pending_verification"


def test_suspicious_resolution_alerts_and_notifies_the_supervisor(client, seeded):
    gid, lak = _new_case(client, "Kukatpally lo divider break ayyindi road meeda")
    photo = _png((20, 120, 160), 21)
    _upload(client, lak, photo, "evidence", gid)
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, photo, "resolution_proof")                     # same picture re-uploaded
    v = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "done"}).json()["ai_verification"]
    assert v["verdict"] == "suspicious"
    assert any(t == "alert" and title == "Suspicious resolution" for t, title, _ in _notes(SUP, gid))


def test_vision_verdict_is_used_when_the_rule_checks_pass(client, seeded, monkeypatch):
    gid, lak = _new_case(client, "Kukatpally lo road meeda gunta undi bus stop daggara")
    _upload(client, lak, _png((50, 50, 50), 31), "evidence", gid)
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, _png((30, 160, 60), 32), "resolution_proof")
    calls = _fake_ai(monkeypatch, {"verify_resolution": {"verdict": "verified", "confidence": 0.86, "reasons_en": ["Pothole filled"],
                                                         "same_location": True, "issue_resolved_visible": True}})
    d = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "patched"}).json()
    v = d["ai_verification"]
    assert v["verdict"] == "verified" and v["assessment"] == "likely_resolved" and v["checks"]["issue_resolved_visible"] is True
    assert len(next(c for c in calls if c["task"] == "verify_resolution")["images"]) == 2      # citizen photo + proof
    types = [e["type"] for e in d["timeline"]]
    assert types[-2:] == ["resolution_submitted", "ai_verification"] and d["status"] == "resolved_pending_verification"
    assert any(t == "verification_request" for t, _, _ in _notes("lakshmi@janavaani.test", gid))


def test_vision_suspicious_without_reasons_still_alerts(client, seeded, monkeypatch):
    gid, lak = _new_case(client, "Kukatpally lo manhole daggara road damage")
    _upload(client, lak, _png((70, 70, 20), 41), "evidence", gid)
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, _png((200, 30, 200), 42), "resolution_proof")
    _fake_ai(monkeypatch, {"verify_resolution": {"verdict": "suspicious", "confidence": 0.7, "reasons_en": []}})
    r = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "done"})
    assert r.status_code == 200 and r.json()["ai_verification"]["assessment"] == "rejected_evidence"
    assert any(title == "Suspicious resolution" for _, title, _ in _notes(SUP, gid))


# ---------- §6.1 / §8 incidents: one proof for every member, status follows members, fan-out once
def test_one_proof_resolves_every_open_member_and_each_keeps_its_photo(client, seeded):
    a, _ = _new_case(client, "Kukatpally lo main road meeda pedda gunta undi incident one")
    b, _ = _new_case(client, "Kukatpally lo main road meeda gunta valla traffic incident two")
    with session_scope() as db:
        ga, gb = db.get(Grievance, a), db.get(Grievance, b)
        inc = Incident(id="INC-TEST-OPEN2", title_en="Two open reports", category="roads", ward_id=ga.ward_id,
                       lat=ga.lat or 0, lng=ga.lng or 0, status=ga.status)
        db.add(inc)
        db.flush()
        ga.incident_id = gb.incident_id = inc.id
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, _png((10, 90, 200), 51), "resolution_proof")
    client.post(f"/api/v1/officer/grievances/{a}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed"})
    with session_scope() as db:
        assert db.get(Incident, "INC-TEST-OPEN2").status not in workflow.RESOLVED       # b is still open
    assert not [n for n in _notes("lakshmi@janavaani.test", b) if n[1] == "The issue you reported is fixed"]
    client.post(f"/api/v1/officer/grievances/{b}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed"})
    for gid in (a, b):
        d = client.get(f"/api/v1/grievances/{gid}", headers=ravi).json()
        assert d["status"] == "resolved_pending_verification"
        assert [m for m in d["media"] if m["purpose"] == "resolution_proof"]                 # nobody lost the photo
    with session_scope() as db:
        assert db.get(Incident, "INC-TEST-OPEN2").status == "resolved_pending_verification"
    incs = client.get("/api/v1/officer/incidents", headers=ravi).json()
    assert next(i for i in incs if i["id"] == "INC-TEST-OPEN2")["status"] == "resolved_pending_verification"


def test_resolving_a_merged_incident_notifies_each_merged_citizen_once(client, seeded):
    ids = [_new_case(client, f"Kukatpally lo road meeda gunta merged report {i}")[0] for i in range(3)]
    sup = token(client, SUP)
    assert client.post("/api/v1/officer/bulk", headers=sup, json={"ids": ids, "action": "merge", "payload": {"parent_id": ids[0]}}).json()["updated"] == 2
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, _png((240, 120, 10), 61), "resolution_proof")
    assert client.post(f"/api/v1/officer/grievances/{ids[0]}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed"}).status_code == 200
    for gid in ids[1:]:
        fixed = [n for n in _notes("lakshmi@janavaani.test", gid, "community_update") if n[1] == "The issue you reported is fixed"]
        assert len(fixed) == 1
    with session_scope() as db:
        assert db.get(Incident, db.get(Grievance, ids[0]).incident_id).status == "resolved_pending_verification"


# ---------- §8 citizen feedback and appeals
def test_feedback_accept_closes_and_two_rejections_alert_and_queue_as_disputed(client, seeded):
    ravi, sup = token(client, RAVI), token(client, SUP)

    def resolved_case(text, seed):
        gid, lak = _new_case(client, text)
        proof = _upload(client, ravi, _png((seed, 100, 100), seed), "resolution_proof")
        client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed"})
        return gid, lak
    gid, lak = resolved_case("Kukatpally lo road meeda gunta accept case", 71)
    d = client.post(f"/api/v1/grievances/{gid}/feedback", headers=lak, json={"accepted": True, "rating": 5}).json()
    assert (d["status"], d["closure_type"], d["rating"]) == ("closed", "citizen_verified", 5)
    assert d["ai_verification"]["assessment"] == "verified"

    gid, lak = resolved_case("Kukatpally lo road meeda gunta reject case", 72)
    level0 = client.get(f"/api/v1/grievances/{gid}", headers=lak).json()["escalation_level"]
    d = client.post(f"/api/v1/grievances/{gid}/feedback", headers=lak, json={"accepted": False, "comment": "still broken"}).json()
    assert (d["status"], d["reopen_count"], d["escalation_level"]) == ("reopened", 1, min(3, level0 + 1))
    proof = _upload(client, ravi, _png((73, 10, 10), 73), "resolution_proof")
    client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed again"})
    d = client.post(f"/api/v1/grievances/{gid}/feedback", headers=lak, json={"accepted": False, "comment": "still broken"}).json()
    assert d["reopen_count"] == 2
    with session_scope() as db:
        assert db.execute(select(AlertRow).where(AlertRow.dedupe_key == f"reopen:{gid}:2")).scalar_one().kind == "repeated_reopen"
    disputed = client.get("/api/v1/officer/review-queue?kind=disputed&page_size=200", headers=sup).json()["items"]
    assert gid in [g["id"] for g in disputed]


def test_appeal_upheld_reopens_and_only_supervisors_decide(client, seeded):
    ravi, sup = token(client, RAVI), token(client, SUP)
    gid, lak = _new_case(client, "Kukatpally lo road meeda gunta appeal case")
    proof = _upload(client, ravi, _png((80, 80, 160), 81), "resolution_proof")
    client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "fixed"})
    client.post(f"/api/v1/grievances/{gid}/feedback", headers=lak, json={"accepted": True, "rating": 2})
    assert client.post(f"/api/v1/grievances/{gid}/appeal", headers=lak, json={"reason": "Only half the road was fixed"}).status_code == 200
    assert client.post(f"/api/v1/officer/grievances/{gid}/appeal-decision", headers=ravi,
                       json={"decision": "upheld", "note": "x"}).status_code == 403
    assert gid in [g["id"] for g in client.get("/api/v1/officer/review-queue?kind=appeal&page_size=200", headers=sup).json()["items"]]
    d = client.post(f"/api/v1/officer/grievances/{gid}/appeal-decision", headers=sup, json={"decision": "upheld", "note": "Redo"}).json()
    assert d["appeal"]["status"] == "upheld" and d["status"] == "reopened"


# ---------- §8 scheduler rules (run directly; the demo clock is not moved)
def test_escalation_rules(client, seeded):
    ids = [_new_case(client, f"Kukatpally lo road meeda gunta escalation {k}")[0] for k in "abcde"]
    now = clock.now()
    with session_scope() as db:
        a, b, c, d, e = (db.get(Grievance, i) for i in ids)
        a.sla_hours, a.sla_due_at, a.escalation_level = 96, now - timedelta(hours=1), 0           # just breached
        b.priority, b.sla_hours, b.sla_due_at, b.escalation_level = "critical", 4, now - timedelta(hours=3), 2  # already L2
        c.sla_hours, c.sla_due_at, c.escalation_level = 48, now - timedelta(hours=25), 0         # breach + 50 %
        d.is_emergency, d.emergency_confirmed, d.created_at = True, None, now - timedelta(minutes=31)
        d.sla_due_at = now + timedelta(hours=10)
        e.status, e.resolved_at, e.sla_due_at = "resolved_pending_verification", now - timedelta(days=8), now + timedelta(days=1)
    with session_scope() as db:
        workflow.run_escalations(db)
    with session_scope() as db:
        a, b, c, d, e = (db.get(Grievance, i) for i in ids)
        assert a.escalation_level == 1 and c.escalation_level == 2
        ev = {g: [x.type for x in db.execute(select(TimelineEvent).where(TimelineEvent.grievance_id == g)).scalars()] for g in (ids[0], ids[2])}
        assert "escalated" in ev[ids[0]] and ev[ids[2]].count("escalated") >= 1
        keys = set(db.execute(select(AlertRow.dedupe_key)).scalars())
        assert f"crit:{ids[1]}" in keys                         # overdue_critical even though it was already level 2
        assert f"emunc:{ids[3]}" in keys
        assert (e.status, e.closure_type) == ("closed", "auto_closed_unverified")
    assert any(t == "escalation" for t, _, _ in _notes(SUP, ids[0]))
    assert any(t == "escalation" for t, _, _ in _notes(ADMIN, ids[2]))


def test_scheduler_runs_escalation_every_2_minutes_and_spikes_every_10(monkeypatch):
    from apscheduler.schedulers.background import BackgroundScheduler

    from app.jobs import scheduler
    monkeypatch.setattr(BackgroundScheduler, "start", lambda self, *a, **k: None)
    jobs = {j.id: j.trigger.interval for j in scheduler.start().get_jobs()}
    assert jobs == {"escalation": timedelta(minutes=2), "spikes": timedelta(minutes=10)}


def test_demo_controls_need_demo_mode(monkeypatch):
    from app.core.config import get_settings
    from app.core.errors import ApiException
    from app.routers import admin
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    with pytest.raises(ApiException) as e:
        admin._demo_only()
    assert (e.value.status, e.value.code) == (403, "demo_disabled")


# ---------- §9 analytics
def test_kpis_count_a_new_overdue_critical_case(client, seeded):
    h = token(client, ADMIN)
    before = client.get("/api/v1/admin/kpis?days=30", headers=h).json()
    gid, _ = _new_case(client, "Kukatpally lo road meeda gunta kpi case")
    with session_scope() as db:
        g = db.get(Grievance, gid)
        g.priority, g.sla_due_at = "critical", clock.now() - timedelta(hours=1)
    after = client.get("/api/v1/admin/kpis?days=30", headers=h).json()
    assert after["total"] == before["total"] + 1
    assert after["overdue"] == before["overdue"] + 1 and after["critical_open"] == before["critical_open"] + 1


def test_department_score_follows_the_published_formula(client, seeded):
    for p in client.get("/api/v1/admin/departments/performance?days=180", headers=token(client, ADMIN)).json():
        known = 0.4 * p["sla_compliance_pct"] + 0.3 * (p["satisfaction_avg"] / 5 * 100) + 0.2 * (100 - p["reopen_rate"])
        assert 0 <= round(p["score"] - known, 1) <= 10.05          # the rest is 0.1·speed_index, speed_index ∈ [0, 100]


def test_recurring_problem_on_one_asset_is_flagged(client, seeded):
    ids = [_new_case(client, f"Kukatpally lo road meeda gunta recurring {i}")[0] for i in range(3)]
    with session_scope() as db:
        asset = db.execute(select(Asset.id).where(Asset.type == "road_segment").order_by(Asset.id.desc())).scalars().first()
        for i in ids:
            g = db.get(Grievance, i)
            g.asset_id, g.incident_id = asset, None
    incs = client.get("/api/v1/officer/incidents?category=roads", headers=token(client, SUP)).json()
    rec = next(i for i in incs if i["id"] == f"REC-roads-{asset}")
    assert rec["repeated"] is True and set(ids) <= set(rec["grievance_ids"])


def test_spike_alerts_carry_languages_and_at_most_3_examples(client, seeded):
    spikes = [a for a in client.get("/api/v1/admin/alerts", headers=token(client, SUP)).json() if a["kind"] == "spike"]
    assert spikes and all(1 <= len(a["grievance_ids"]) <= 3 and a["languages"] for a in spikes)


def test_insights_keep_llm_bullets_only_when_every_number_is_real(client, seeded, monkeypatch):
    h = token(client, ADMIN)
    calls = _fake_ai(monkeypatch, {"insights_summary": {"bullets_en": ["Complaints rose by 999 this month."]}})
    r = client.get("/api/v1/admin/insights?days=30", headers=h).json()
    assert r["generated_by"] == "template" and r["numbers_verified"] is True
    assert [c["task"] for c in calls].count("insights_summary") == 2                  # one retry before the template
    total = client.get("/api/v1/admin/kpis?days=30", headers=h).json()["total"]
    _fake_ai(monkeypatch, {"insights_summary": {"bullets_en": [f"{total} grievances were filed."]}})
    r = client.get("/api/v1/admin/insights?days=30", headers=h).json()
    assert r["generated_by"] == "gemini" and r["numbers_verified"] is True and r["bullets_en"] == [f"{total} grievances were filed."]
