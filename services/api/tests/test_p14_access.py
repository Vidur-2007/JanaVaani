"""Cross-phase access rules (Spec B §10): officer ward scope on every case endpoint, who may attach photos to a case,
and the /auth/v1/user fallback for legacy HS256 Supabase projects. Supabase is faked; no network."""
import time
import uuid

import httpx
import jwt
import pytest
from sqlalchemy import select

from app.core import security
from app.core.config import get_settings
from app.core.db import session_scope
from app.models import Grievance, Profile

from .conftest import token
from .test_p4_admin import _new_case, _png, _upload

RAVI = "ravi.roads@janavaani.test"     # roads officer for the Kukatpally and Serilingampally zones


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    from app.core.ratelimit import limiter
    limiter.reset()


def _outside_ravis_wards():
    with session_scope() as db:
        ravi = db.execute(select(Profile).where(Profile.email == RAVI)).scalar_one()
        g = db.execute(select(Grievance).where(Grievance.category == "roads", Grievance.ward_id.not_in(ravi.ward_ids),
                                               (Grievance.assigned_officer_id != ravi.id) | Grievance.assigned_officer_id.is_(None),
                                               Grievance.status.in_(["assigned", "in_progress"]))).scalars().first()
        return g.id, g.ward_id, ravi.ward_ids


# ---------- officer ward scope
def test_officer_cannot_open_or_act_on_a_case_outside_their_wards(client, seeded):
    gid, ward, wards = _outside_ravis_wards()
    assert ward not in wards
    ravi = token(client, RAVI)
    assert client.get(f"/api/v1/grievances/{gid}", headers=ravi).status_code == 403
    for path, body in (("notes", {"text": "x"}), ("brief", {}), ("status", {"status": "in_progress"}),
                       ("draft-reply", {"intent": "acknowledge"}), ("message", {"text_en": "hello"})):
        assert client.post(f"/api/v1/officer/grievances/{gid}/{path}", headers=ravi, json=body).status_code == 403, path
    assert client.get(f"/api/v1/grievances/{gid}", headers=token(client, "supervisor@janavaani.test")).status_code == 200


def test_officer_keeps_access_to_cases_assigned_to_them_anywhere(client, seeded):
    gid, _, _ = _outside_ravis_wards()
    with session_scope() as db:
        db.get(Grievance, gid).assigned_officer_id = db.execute(select(Profile.id).where(Profile.email == RAVI)).scalar_one()
    assert client.get(f"/api/v1/grievances/{gid}", headers=token(client, RAVI)).status_code == 200


def test_officer_incident_list_matches_their_wards(client, seeded):
    with session_scope() as db:
        wards = db.execute(select(Profile.ward_ids).where(Profile.email == RAVI)).scalar_one()
    incs = client.get("/api/v1/officer/incidents", headers=token(client, RAVI)).json()
    assert incs and all(i["ward_id"] in wards for i in incs)


# ---------- who may attach photos to a case
def test_only_the_owner_or_an_officer_in_scope_can_attach_photos(client, seeded):
    gid, lak = _new_case(client, "Kukatpally lo road meeda gunta photo access")
    photo = _png((120, 40, 200), 91)

    def attach(headers, purpose="evidence"):
        return client.post("/api/v1/uploads", headers=headers, files={"file": ("p.png", photo, "image/png")},
                           data={"purpose": purpose, "grievance_id": gid}).status_code
    assert attach({}) == 403                                                           # not signed in
    assert attach(token(client, "imran@janavaani.test")) == 403                       # another citizen
    assert attach(token(client, "farhan.water@janavaani.test")) == 403                # an officer of another department
    assert attach(lak) == 200                                                          # the owner
    assert attach(lak, "resolution_proof") == 403                                      # proof is for officers
    assert attach(token(client, RAVI), "resolution_proof") == 200                      # officer handling the case
    unattached = client.post("/api/v1/uploads", files={"file": ("p.png", photo, "image/png")}, data={"purpose": "evidence"})
    assert unattached.status_code == 200                                               # the report form uploads first


# ---------- Supabase /auth/v1/user fallback (legacy HS256 projects without SUPABASE_JWT_SECRET)
PROJECT = "https://abcdefghijklmnopqrst.supabase.co"


@pytest.fixture
def legacy_project(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "supabase_url", PROJECT)
    monkeypatch.setattr(s, "supabase_service_role_key", "sb_secret_TESTONLY_not_real")
    monkeypatch.setattr(s, "supabase_jwt_secret", "")
    monkeypatch.setattr(security, "_user_cache", {})
    calls = []

    def fake_get(url, headers=None, timeout=None, **kw):
        calls.append((url, dict(headers or {})))
        bearer = (headers or {}).get("Authorization", "")
        if bearer.endswith(fake_get.valid):
            return httpx.Response(200, json={"id": fake_get.uid, "email": "legacy.user@example.test"}, request=httpx.Request("GET", url))
        return httpx.Response(401, json={"msg": "invalid JWT"}, request=httpx.Request("GET", url))
    fake_get.uid, fake_get.valid = str(uuid.uuid4()), "-"
    monkeypatch.setattr(httpx, "get", fake_get)
    return fake_get, calls


def _supabase_token(iss=f"{PROJECT}/auth/v1", secret="the-project-secret-we-do-not-have-0123456789"):
    now = int(time.time())
    return jwt.encode({"sub": "ignored", "iss": iss, "aud": "authenticated", "role": "authenticated",
                       "iat": now, "exp": now + 600}, secret, algorithm="HS256")


def test_legacy_hs256_token_is_verified_through_supabase_and_cached(client, legacy_project):
    fake, calls = legacy_project
    tok = _supabase_token()
    fake.valid = tok
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200 and r.json()["id"] == fake.uid and r.json()["role"] == "citizen"
    assert calls == [(f"{PROJECT}/auth/v1/user", {"apikey": "sb_secret_TESTONLY_not_real", "Authorization": f"Bearer {tok}"})]
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    assert len(calls) == 1                                                             # cached


def test_supabase_rejection_is_a_401(client, legacy_project):
    _, calls = legacy_project
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {_supabase_token()}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_token" and len(calls) == 1


@pytest.mark.parametrize("bad", ["not.a.jwt", "garbage",
                                 _supabase_token(iss="janavaani"),                  # forged demo-style token
                                 _supabase_token(iss="https://another-project.supabase.co/auth/v1")])
def test_tokens_from_elsewhere_never_reach_supabase(client, legacy_project, bad):
    _, calls = legacy_project
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401
    assert calls == []
