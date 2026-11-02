"""Live-mode regressions: schema vs ORM, timestamptz, re-seeding, Supabase seed key, token secrets, .env.example."""
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.dialects import postgresql, sqlite

from app.core import security
from app.core.config import API_DIR, REPO_DIR, Settings, get_settings
from app.core.db import Base, session_scope
from app.core.types import UTCDateTime
from app.models import Grievance, Profile

from .conftest import token

DEFAULT_SECRET = "dev-only-change-me-janavaani-secret-key"


def _migrated_columns() -> str:
    return "\n".join(p.read_text() for p in sorted((REPO_DIR / "supabase" / "migrations").glob("*.sql")))


@pytest.mark.parametrize("table", sorted(Base.metadata.tables))
def test_every_orm_column_exists_in_migrations(table):
    sql = _migrated_columns()
    m = re.search(rf"create table if not exists {table} \((.*?)\n\);", sql, re.S)
    assert m, f"{table} has no migration"
    defined = m.group(1) + " ".join(re.findall(rf"alter table {table} (.*?);", sql, re.S))
    missing = [c.name for c in Base.metadata.tables[table].columns if not re.search(rf"\b{c.name}\b", defined)]
    assert not missing, f"{table} lacks {missing}"


def test_utc_datetime_gives_the_app_naive_utc():
    t = UTCDateTime()
    aware = datetime(2026, 1, 1, 12, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert t.process_result_value(aware, postgresql.dialect()) == datetime(2026, 1, 1, 6, 30)
    assert t.process_bind_param(datetime(2026, 1, 1, 6, 30), postgresql.dialect()).tzinfo == timezone.utc
    assert t.process_bind_param(datetime(2026, 1, 1, 6, 30), sqlite.dialect()).tzinfo is None


def test_reseed_over_existing_data(client, seeded):
    import seed_db
    from app.pipeline import audit
    seed_db.main(quick=True, n_grievances=160)
    with session_scope() as db:
        assert db.execute(select(Grievance).limit(1)).scalar_one_or_none()
        assert audit.verify(db)["valid"]


def test_seed_takes_service_key_from_settings_not_only_process_env(monkeypatch):
    import seed_db
    s = get_settings()
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setattr(s, "supabase_url", "https://x.supabase.test")
    monkeypatch.setattr(s, "supabase_service_role_key", "service-key")
    seen = {}

    class R:
        status_code = 201

        def json(self):
            return {"id": "11111111-1111-1111-1111-111111111111"}

    monkeypatch.setattr("httpx.post", lambda url, headers, **kw: seen.update(url=url, key=headers["apikey"]) or R())
    assert seed_db.supabase_user("a@janavaani.test", "admin") == "11111111-1111-1111-1111-111111111111"
    assert seen == {"url": "https://x.supabase.test/auth/v1/admin/users", "key": "service-key"}


def _admin_id():
    with session_scope() as db:
        return db.execute(select(Profile.id).where(Profile.email == "admin@janavaani.test")).scalar_one()


def _forge(secret, sub):
    return {"Authorization": "Bearer " + jwt.encode({"sub": sub, "iss": "janavaani", "exp": int(time.time()) + 600}, secret, algorithm="HS256")}


@pytest.mark.parametrize("configured", ["", "change-me", DEFAULT_SECRET])
def test_token_forged_with_a_published_secret_is_refused(client, seeded, monkeypatch, configured):
    monkeypatch.setattr(get_settings(), "app_jwt_secret", configured)
    for published in ("change-me", DEFAULT_SECRET):
        assert client.get("/api/v1/admin/kpis", headers=_forge(published, _admin_id())).status_code == 401
    r = client.post("/api/v1/auth/demo-login", json={"email": "admin@janavaani.test"})
    assert client.get("/api/v1/admin/kpis", headers={"Authorization": "Bearer " + r.json()["access_token"]}).status_code == 200


def test_app_tokens_refused_outside_demo_mode(client, seeded, monkeypatch):
    headers = token(client, "admin@janavaani.test")
    assert client.get("/api/v1/admin/kpis", headers=headers).status_code == 200
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    assert client.get("/api/v1/admin/kpis", headers=headers).status_code == 401


def test_demo_login_closed_when_supabase_configured_unless_allowed(client, seeded, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "supabase_url", "https://x.supabase.test")
    r = client.post("/api/v1/auth/demo-login", json={"email": "admin@janavaani.test"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_login_disabled"
    monkeypatch.setattr(s, "allow_demo_login", True)
    assert client.post("/api/v1/auth/demo-login", json={"email": "admin@janavaani.test"}).status_code == 200


def test_guest_pin_hash_does_not_change_with_the_random_token_secret(monkeypatch):
    from app.pipeline import workflow
    monkeypatch.setattr(get_settings(), "app_jwt_secret", "")
    first = workflow.hash_pin("GRV-2026-000001", "123456")
    monkeypatch.setattr(security, "_random_secret", "another-process")
    assert workflow.hash_pin("GRV-2026-000001", "123456") == first


def test_env_example_starts_in_sqlite_mode(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APP_JWT_SECRET", raising=False)
    s = Settings(_env_file=Path(API_DIR) / ".env.example")
    assert s.database_url.startswith("sqlite:///") and s.app_jwt_secret == "" and s.allow_demo_login is False
    create_engine(s.database_url)
