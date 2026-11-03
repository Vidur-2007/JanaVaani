"""B/C contract closure: officer chain verification (B2), disputed-resolution decisions (B3), spike alert members,
and the asset list for C's QR sheet."""
import re

import pytest
from sqlalchemy import select

from app.core.db import session_scope
from app.models import Asset, Grievance, Notification, Profile, TimelineEvent

from .conftest import token
from .test_p4_admin import _new_case, _png, _upload
from .test_p14_access import _outside_ravis_wards

RAVI, SUP = "ravi.roads@janavaani.test", "supervisor@janavaani.test"


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    from app.core.ratelimit import limiter
    limiter.reset()


# ---------- B2: officers verify one grievance's chain, in scope only
def test_officer_verifies_the_chain_of_a_case_they_can_act_on(client, seeded):
    gid, _ = _new_case(client, "Kukatpally lo road meeda gunta chain check")
    r = client.get(f"/api/v1/admin/audit/verify?grievance_id={gid}", headers=token(client, RAVI))
    assert r.status_code == 200 and r.json()["valid"] is True


@pytest.mark.parametrize("case,status", [("no_id", 403), ("out_of_scope", 403), ("unknown", 404)])
def test_officer_chain_verification_is_refused_outside_one_case_in_scope(client, seeded, case, status):
    q = {"no_id": "", "out_of_scope": f"?grievance_id={_outside_ravis_wards()[0]}", "unknown": "?grievance_id=GRV-2026-999999"}[case]
    assert client.get(f"/api/v1/admin/audit/verify{q}", headers=token(client, RAVI)).status_code == status


def test_supervisors_keep_global_verification_and_citizens_get_none(client, seeded):
    assert client.get("/api/v1/admin/audit/verify", headers=token(client, SUP)).status_code == 200
    gid, lak = _new_case(client, "Kukatpally lo road meeda gunta citizen chain")
    assert client.get(f"/api/v1/admin/audit/verify?grievance_id={gid}", headers=lak).status_code == 403


# ---------- B3: disputed resolution decisions
def _suspicious_case(client, text, seed):
    gid, lak = _new_case(client, text)
    photo = _png((seed, 40, 90), seed)
    _upload(client, lak, photo, "evidence", gid)
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, photo, "resolution_proof")         # the citizen's own picture again
    d = client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi, json={"media_ids": [proof], "note": "done"}).json()
    assert d["ai_verification"]["verdict"] == "suspicious"
    return gid, lak


def _disputed_ids(client):
    return [g["id"] for g in client.get("/api/v1/officer/review-queue?kind=disputed&page_size=500", headers=token(client, SUP)).json()["items"]]


def test_demand_new_proof_sends_the_case_back_to_the_officer(client, seeded):
    gid, lak = _suspicious_case(client, "Kukatpally lo road meeda gunta dispute proof", 101)
    assert gid in _disputed_ids(client)
    body = {"action": "demand_new_proof", "note": "Photo matches the citizen's; upload a new one"}
    assert client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=token(client, RAVI), json=body).status_code == 403
    d = client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=token(client, SUP), json=body).json()
    assert d["status"] == "in_progress" and d["resolved_at"] is None
    ev = d["timeline"][-1]
    assert ev["type"] == "status_changed" and ev["payload"]["dispute"] == "demand_new_proof"
    with session_scope() as db:
        ravi_id = db.execute(select(Profile.id).where(Profile.email == RAVI)).scalar_one()
        assert db.execute(select(Notification).where(Notification.user_id == ravi_id, Notification.grievance_id == gid,
                                                     Notification.type == "alert")).scalars().first()
        assert db.execute(select(Notification).where(Notification.grievance_id == gid, Notification.type == "status",
                                                     Notification.body["en"].as_string().like("%new proof%"))).scalars().first()
    ravi = token(client, RAVI)
    proof = _upload(client, ravi, _png((1, 200, 1), 102), "resolution_proof")
    assert client.post(f"/api/v1/officer/grievances/{gid}/resolve", headers=ravi,
                       json={"media_ids": [proof], "note": "redone"}).json()["status"] == "resolved_pending_verification"


def test_close_as_disputed_is_final_and_recorded(client, seeded):
    gid, lak = _suspicious_case(client, "Kukatpally lo road meeda gunta dispute close", 103)
    sup = token(client, SUP)
    d = client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=sup,
                    json={"action": "close_disputed", "note": "Site visit: partly fixed, rest is out of scope"}).json()
    assert (d["status"], d["closure_type"]) == ("closed", "disputed") and d["closed_at"]
    assert d["timeline"][-1]["type"] == "closed" and d["timeline"][-1]["payload"]["closure_type"] == "disputed"
    assert gid not in _disputed_ids(client)
    again = client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=sup, json={"action": "close_disputed", "note": "again"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "not_disputed"
    assert client.get(f"/api/v1/grievances/{gid}", headers=lak).json()["closure_type"] == "disputed"


def test_dispute_needs_a_disputed_case_a_known_action_and_a_note(client, seeded):
    gid, _ = _new_case(client, "Kukatpally lo road meeda gunta not disputed")
    sup = token(client, SUP)
    assert client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=sup,
                       json={"action": "close_disputed", "note": "nope"}).status_code == 409
    assert client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=sup,
                       json={"action": "reject", "note": "nope"}).status_code == 422
    assert client.post(f"/api/v1/officer/grievances/{gid}/dispute", headers=sup,
                       json={"action": "close_disputed", "note": ""}).status_code == 422


# ---------- spike alerts: member_count matches the title
def test_spike_alert_members_match_the_title(client, seeded):
    alerts = client.get("/api/v1/admin/alerts", headers=token(client, SUP)).json()
    spikes = [a for a in alerts if a["kind"] == "spike"]
    assert spikes
    for a in spikes:
        n = int(re.match(r"Spike: (\d+) ", a["title_en"]).group(1))
        assert a["member_count"] == n and len(a["grievance_ids"]) <= 3
        assert set(a["grievance_ids"]) <= set(a["member_ids"]) and len(a["member_ids"]) == min(n, 200)
    with session_scope() as db:
        a = spikes[0]
        langs = set(db.execute(select(Grievance.language).where(Grievance.id.in_(a["member_ids"]))).scalars())
    assert set(a["languages"]) == langs


def test_other_alerts_report_their_members_too(client, seeded):
    for a in client.get("/api/v1/admin/alerts", headers=token(client, SUP)).json():
        assert a["member_count"] >= len(a["grievance_ids"]) and len(a["grievance_ids"]) <= 3


# ---------- asset list (C's QR sheet for a ward's streetlights)
def test_asset_list_by_ward_and_type_matches_the_single_asset_shape(client, seeded):
    with session_scope() as db:
        a = db.execute(select(Asset).where(Asset.type == "streetlight")).scalars().first()
        ward, n = a.ward_id, len(db.execute(select(Asset.id).where(Asset.ward_id == a.ward_id, Asset.type == "streetlight")).all())
    rows = client.get(f"/api/v1/meta/assets?ward={ward}&type=streetlight").json()
    assert len(rows) == n and all(r["ward_id"] == ward and r["type"] == "streetlight" for r in rows)
    one = next(r for r in rows if r["id"] == a.id)
    assert one == client.get(f"/api/v1/meta/assets/{a.id}").json()
    assert client.get("/api/v1/meta/assets?ward=W-NONE-99").json() == []
