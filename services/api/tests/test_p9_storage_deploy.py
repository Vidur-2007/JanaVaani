"""Photo storage (Supabase + local), expiring media links, and what the Space image contains."""
import io
import sys
from pathlib import Path

import httpx
import pytest
from PIL import Image

from app.core import storage
from app.core.config import REPO_DIR, get_settings

from .conftest import token

sys.path.insert(0, str(REPO_DIR / "scripts"))


def jpeg(seed=1):
    b = io.BytesIO()
    Image.effect_noise((500, 400), 60 + seed).convert("RGB").save(b, "JPEG")
    return b.getvalue()


def upload(client, headers=None, seed=1):
    r = client.post("/api/v1/uploads", files={"file": ("p.jpg", jpeg(seed), "image/jpeg")}, data={"purpose": "evidence"}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


class FakeSupabase:
    """In-memory Storage API behind httpx.post/get."""
    def __init__(self, monkeypatch, fail=False):
        self.objects, self.calls, self.fail = {}, [], fail
        monkeypatch.setattr(get_settings(), "supabase_url", "https://x.supabase.test")
        monkeypatch.setattr(get_settings(), "supabase_service_role_key", "service-key")
        monkeypatch.setattr(httpx, "post", self.post)
        monkeypatch.setattr(httpx, "get", self.get)
        monkeypatch.setattr(storage, "_signed", {})

    def _response(self, url, status=200, **kw):
        return httpx.Response(status, request=httpx.Request("POST", url), **kw)

    def post(self, url, headers=None, content=None, json=None, timeout=None):
        self.calls.append(url)
        assert headers["apikey"] == "service-key" and headers["Authorization"] == "Bearer service-key"
        if self.fail:
            return self._response(url, 500)
        name = url.split("/object/", 1)[1]
        if name.startswith("sign/"):
            return self._response(url, json={"signedURL": f"/object/{name}?token=abc"})
        self.objects[name] = content
        return self._response(url, json={"Key": name})

    def get(self, url, headers=None, timeout=None):
        return self._response(url, content=self.objects[url.split("/object/", 1)[1]])


def test_media_url_is_absolute_and_signed_for_any_frontend_host(client, monkeypatch):
    media = upload(client)
    assert media["url"].startswith(f"http://testserver/api/v1/uploads/{media['id']}?exp=")
    assert client.get(media["url"]).headers["content-type"] == "image/webp"
    monkeypatch.setenv("SPACE_HOST", "team-janavaani.hf.space")
    assert storage.media_url("m").startswith("https://team-janavaani.hf.space/api/v1/uploads/m?")
    monkeypatch.setattr(get_settings(), "public_api_url", "https://api.example.test/")
    assert storage.media_url("m").startswith("https://api.example.test/api/v1/uploads/m?")


def test_media_links_are_refused_without_a_valid_signature_or_after_expiry(client):
    media = upload(client, seed=2)
    path = f"/api/v1/uploads/{media['id']}"
    assert client.get(path).status_code == 403
    assert client.get(media["url"].replace("sig=", "sig=0")).json()["error"]["code"] == "link_invalid"
    other = upload(client, seed=3)
    assert client.get(f"{path}?{other['url'].split('?')[1]}").status_code == 403       # a signature is for one photo only
    past = 1000
    r = client.get(path, params={"exp": past, "sig": storage._signature(media["id"], past)})
    assert r.status_code == 403 and r.json()["error"]["code"] == "link_expired"


def test_upload_goes_to_supabase_and_the_link_redirects_to_a_signed_url(client, monkeypatch):
    fake = FakeSupabase(monkeypatch)
    media = upload(client, seed=4)
    name = next(iter(fake.objects))
    assert name.startswith("evidence/") and name.endswith(f"{media['id']}.webp")
    assert Image.open(io.BytesIO(fake.objects[name])).format == "WEBP"
    r = client.get(media["url"], follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == f"https://x.supabase.test/storage/v1/object/sign/{name}?token=abc"
    signs = len([c for c in fake.calls if "/sign/" in c])
    client.get(media["url"], follow_redirects=False)
    assert len([c for c in fake.calls if "/sign/" in c]) == signs     # reused until shortly before it expires
    from app.core.db import session_scope
    from app.models import Media
    with session_scope() as db:
        assert storage.read(db.get(Media, media["id"]).storage_path) == fake.objects[name]


def test_supabase_failure_keeps_the_citizens_photo_on_disk(client, monkeypatch):
    FakeSupabase(monkeypatch, fail=True)
    media = upload(client, seed=5)
    assert client.get(media["url"]).headers["content-type"] == "image/webp"


def test_upload_reports_503_when_nowhere_is_writable(client, monkeypatch, tmp_path):
    blocker = tmp_path / "file"
    blocker.write_text("x")
    monkeypatch.setattr(get_settings(), "upload_dir", str(blocker))
    r = client.post("/api/v1/uploads", files={"file": ("p.jpg", jpeg(6), "image/jpeg")}, data={"purpose": "evidence"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "upload_unavailable"


def test_same_photo_check_uses_the_saved_hash_without_fetching(client, seeded, monkeypatch):
    from app.models import Media
    from app.pipeline import workflow
    from imagehash import phash
    im = Image.effect_noise((300, 300), 70).convert("RGB")
    monkeypatch.setattr(storage, "read", lambda p: pytest.fail("must not fetch the photo"))
    assert workflow._phash(Media(storage_path="supabase://x", phash=str(phash(im)))) == phash(im)


def test_health_reports_storage_mode():
    assert storage.mode() == "local"


def test_stage_holds_what_the_image_needs_and_no_secrets(tmp_path):
    import deploy_space
    stage = deploy_space.stage(tmp_path / "s")
    files = {str(p.relative_to(stage)) for p in stage.rglob("*") if p.is_file()}
    for needed in ("Dockerfile", "README.md", "services/api/requirements.txt", "services/api/app/main.py", "ml/seed_db.py", "ml/train_classifier.py",
                   "ml/models/classifier.joblib", "ml/models/classifier_tfidf.joblib", "data/departments.json", "data/seed/complaints.jsonl"):
        assert needed in files, needed
    assert not [f for f in files if ".env" in f or "__pycache__" in f or "/tests/" in f or f.startswith(("apps/", "packages/", "docs/"))]
    readme = (stage / "README.md").read_text()
    assert "sdk: docker" in readme and "app_port: 7860" in readme


def test_dockerfile_runs_as_the_space_user_with_writable_runtime_paths():
    text = (Path(REPO_DIR) / "services" / "api" / "Dockerfile").read_text()
    assert "useradd -m -u 1000 user" in text and "USER user" in text and "--proxy-headers" in text
    for setting in ("DATABASE_URL=sqlite:////app/runtime", "UPLOAD_DIR=/app/runtime", "AI_CACHE_DIR=/app/runtime"):
        assert setting in text


def test_secrets_file_only_passes_known_keys(tmp_path):
    import deploy_space
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=abc\nUNRELATED=x\nGROQ_API_KEY=\n")
    assert deploy_space.read_secrets(env) == {"GEMINI_API_KEY": "abc"}


def test_auto_seed_only_touches_an_empty_sqlite_database(client, seeded, monkeypatch):
    import app.main as m
    calls = []
    monkeypatch.setitem(sys.modules, "seed_db", type("S", (), {"main": staticmethod(lambda quick=False: calls.append(quick))}))
    monkeypatch.setattr(get_settings(), "auto_seed", True)
    m._auto_seed()              # profiles exist
    assert calls == []


# ---------- Postgres schema comes only from supabase/migrations
def test_postgres_startup_never_creates_tables_and_reports_missing_ones(monkeypatch, caplog):
    import sqlalchemy

    from app.core import db
    monkeypatch.setattr(db.engine.dialect, "name", "postgresql")
    monkeypatch.setattr(db.Base.metadata, "create_all", lambda *a, **k: pytest.fail("create_all must not run on Postgres"))
    monkeypatch.setattr(sqlalchemy, "inspect", lambda eng: type("I", (), {"get_table_names": lambda self: ["grievances"]})())
    db.create_all()
    assert "run ml/apply_migrations.py" in caplog.text and "'profiles'" in caplog.text


def test_migrations_include_the_realtime_grant():
    sql = (REPO_DIR / "supabase" / "migrations" / "0006_live_events_grants.sql").read_text()
    assert "grant select on public.live_events to anon, authenticated" in sql
