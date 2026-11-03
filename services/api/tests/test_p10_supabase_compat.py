"""Supabase compatibility: new sb_secret_ vs legacy service_role keys, migration env loading, URL normalisation, seeding errors.
Every Supabase call is mocked; no network."""
import io
import json

import httpx
import pytest
from PIL import Image

from app.core import storage
from app.core.config import Settings, get_settings

NEW_KEY = "sb_secret_TESTONLY_not_a_real_key"
LEGACY_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.TESTONLY"


class Recorder:
    """Stands in for httpx.get/post/put and records the headers of every call."""
    def __init__(self, monkeypatch, responses=None):
        self.calls, self.responses = [], responses or {}
        for verb in ("get", "post", "put"):
            monkeypatch.setattr(httpx, verb, self._handler(verb.upper()))

    def _handler(self, verb):
        def call(url, headers=None, **kw):
            self.calls.append((verb, url, dict(headers or {})))
            status, body = self.responses.get((verb, url.split("?")[0].rsplit("/v1/", 1)[-1]), (200, {}))
            if "/object/sign/" in url and status == 200 and not body:
                body = {"signedURL": "/object/sign/x?token=t"}
            raw = body if isinstance(body, bytes) else json.dumps(body).encode()
            return httpx.Response(status, content=raw, request=httpx.Request(verb, url))
        return call


@pytest.fixture
def supabase(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "supabase_url", "https://abcdefghijklmnopqrst.supabase.co")
    monkeypatch.setattr(storage, "_signed", {})

    def use(key):
        monkeypatch.setattr(s, "supabase_service_role_key", key)
    return use


# ---------- F1: headers per key format
@pytest.mark.parametrize("key,bearer", [(NEW_KEY, False), (LEGACY_KEY, True)])
def test_service_key_headers(key, bearer):
    h = Settings(supabase_service_role_key=key).service_key_headers()
    assert h["apikey"] == key
    assert ("Authorization" in h) is bearer
    if bearer:
        assert h["Authorization"] == f"Bearer {key}"


@pytest.mark.parametrize("key,bearer", [(NEW_KEY, False), (LEGACY_KEY, True)])
def test_every_storage_request_uses_the_key_format_rules(supabase, monkeypatch, key, bearer):
    supabase(key)
    rec = Recorder(monkeypatch)
    b = io.BytesIO()
    Image.new("RGB", (10, 10)).save(b, "WEBP")
    path = storage.save("2026/11/x.webp", b.getvalue())
    storage.read(path)
    storage.signed_url(path)
    assert [c[0] for c in rec.calls] == ["POST", "GET", "POST"]          # upload, read, sign
    for _, url, headers in rec.calls:
        assert url.startswith("https://abcdefghijklmnopqrst.supabase.co/storage/v1/")
        assert headers["apikey"] == key and ("Authorization" in headers) is bearer


@pytest.mark.parametrize("key,bearer", [(NEW_KEY, False), (LEGACY_KEY, True)])
def test_every_auth_admin_request_uses_the_key_format_rules(supabase, monkeypatch, key, bearer):
    import seed_db
    supabase(key)
    rec = Recorder(monkeypatch, {("POST", "admin/users"): (422, {"code": 422, "error_code": "email_exists", "msg": "already registered"}),
                                 ("GET", "admin/users"): (200, {"users": [{"id": "u-1", "email": "a@janavaani.test"}]})})
    assert seed_db.supabase_user("a@janavaani.test", "admin") == "u-1"
    assert [c[0] for c in rec.calls] == ["POST", "GET", "PUT"]           # create, find existing, update metadata
    for _, url, headers in rec.calls:
        assert url.startswith("https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/users")
        assert headers["apikey"] == key and ("Authorization" in headers) is bearer


# ---------- F2: migrations read DATABASE_URL like the API does
def test_migrations_read_the_url_through_settings_without_inline_comments(tmp_path, monkeypatch):
    import apply_migrations
    env = tmp_path / ".env"
    env.write_text("DATABASE_URL=postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres   # Session pooler URI\n")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(apply_migrations, "Settings", lambda: Settings(_env_file=env))
    seen = {}

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, sql):
            seen.setdefault("files", 0)
            seen["files"] += 1
    import psycopg
    monkeypatch.setattr(psycopg, "connect", lambda url, autocommit: seen.update(url=url) or Conn())
    apply_migrations.main()
    assert seen["url"] == "postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
    assert seen["files"] >= 3


@pytest.mark.parametrize("given,expected", [
    ("postgresql://u:p@h:5432/postgres", "postgresql://u:p@h:5432/postgres"),
    ("postgres://u:p@h:5432/postgres", "postgres://u:p@h:5432/postgres"),
    ("postgresql+psycopg://u:p@h:5432/postgres?sslmode=require", "postgresql://u:p@h:5432/postgres?sslmode=require"),
])
def test_migrations_give_psycopg_a_plain_url(given, expected):
    import apply_migrations
    assert apply_migrations.libpq_url(given) == expected


def test_migrations_refuse_sqlite(tmp_path, monkeypatch):
    import apply_migrations
    monkeypatch.setattr(apply_migrations, "Settings", lambda: Settings(_env_file=None, database_url=""))
    with pytest.raises(SystemExit):
        apply_migrations.main()


# ---------- N2: SUPABASE_URL normalisation
@pytest.mark.parametrize("given,expected", [
    ("https://abcdefghijklmnopqrst.supabase.co", "https://abcdefghijklmnopqrst.supabase.co"),
    ("https://abcdefghijklmnopqrst.supabase.co/", "https://abcdefghijklmnopqrst.supabase.co"),
    ("https://abcdefghijklmnopqrst.supabase.co//", "https://abcdefghijklmnopqrst.supabase.co"),
    (" https://abcdefghijklmnopqrst.supabase.co/ ", "https://abcdefghijklmnopqrst.supabase.co"),
    ("http://127.0.0.1:54321", "http://127.0.0.1:54321"),
    ("", ""),
])
def test_supabase_url_loses_only_trailing_slashes(given, expected):
    assert Settings(_env_file=None, supabase_url=given).supabase_url == expected


def test_supabase_url_from_env_file_is_normalised(tmp_path):
    env = tmp_path / ".env"
    env.write_text("SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co/   # project URL\n")
    assert Settings(_env_file=env).supabase_url == "https://abcdefghijklmnopqrst.supabase.co"


# ---------- N9: clear seeding errors, no secrets in them
@pytest.mark.parametrize("status,body,hint", [
    (401, {"msg": "Invalid API key"}, "SUPABASE_SERVICE_ROLE_KEY"),
    (403, {"message": "User not allowed"}, "publishable / anon"),
    (404, {}, "SUPABASE_URL"),
    (500, b"<html>gateway error</html>", ""),
])
def test_auth_admin_failures_raise_a_clear_error_without_the_key(supabase, monkeypatch, status, body, hint):
    import seed_db
    supabase(NEW_KEY)
    Recorder(monkeypatch, {("POST", "admin/users"): (status, body)})
    with pytest.raises(seed_db.SupabaseSeedError) as e:
        seed_db.supabase_user("a@janavaani.test", "admin")
    text = str(e.value)
    assert f"HTTP {status}" in text and "creating demo user a@janavaani.test" in text and hint in text
    assert NEW_KEY not in text and "sb_secret_TESTONLY" not in text


def test_existing_user_missing_from_the_list_is_explained(supabase, monkeypatch):
    import seed_db
    supabase(LEGACY_KEY)
    Recorder(monkeypatch, {("POST", "admin/users"): (422, {"msg": "already registered"}),
                           ("GET", "admin/users"): (200, {"users": []})})
    with pytest.raises(seed_db.SupabaseSeedError, match="already exists but it is not in the first 1000"):
        seed_db.supabase_user("a@janavaani.test", "admin")


@pytest.mark.parametrize("failing", [("GET", "admin/users"), ("PUT", "admin/users/u-1")])
def test_list_and_update_failures_are_reported(supabase, monkeypatch, failing):
    import seed_db
    supabase(NEW_KEY)
    responses = {("POST", "admin/users"): (422, {"error_code": "email_exists"}),
                 ("GET", "admin/users"): (200, {"users": [{"id": "u-1", "email": "a@janavaani.test"}]}),
                 failing: (401, {"msg": "Invalid API key"})}
    Recorder(monkeypatch, responses)
    with pytest.raises(seed_db.SupabaseSeedError, match="HTTP 401"):
        seed_db.supabase_user("a@janavaani.test", "admin")


def test_created_user_returns_its_id(supabase, monkeypatch):
    import seed_db
    supabase(NEW_KEY)
    rec = Recorder(monkeypatch, {("POST", "admin/users"): (200, {"id": "new-id", "email": "a@janavaani.test"})})
    assert seed_db.supabase_user("a@janavaani.test", "admin") == "new-id" and len(rec.calls) == 1
