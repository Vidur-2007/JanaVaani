"""Test harness: isolated SQLite DB (or TEST_DATABASE_URL for Postgres), no scheduler, no real AI keys.
All AI-provider tests use FORCE_FAIL flags / missing keys — they never call live services."""
import os
import sys
import tempfile
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="jv-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{TMP}/test.db")
os.environ.update(ENABLE_SCHEDULER="false", USE_EMBEDDINGS="false", AI_CACHE_DIR=f"{TMP}/aicache",
                  UPLOAD_DIR=f"{TMP}/uploads", GEMINI_API_KEY="", GROQ_API_KEY="", DEMO_MODE="true",
                  APP_JWT_SECRET="test-secret-test-secret-test-secret-123")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "ml"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def seeded(client):
    import seed_db
    seed_db.main(quick=True, n_grievances=160)
    return True


def token(client, email):
    r = client.post("/api/v1/auth/demo-login", json={"email": email})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
