"""P5: insights numbers guard, audit list/verify, AI metrics, retrain (hot-swap, new version), public privacy,
spam handling, rate limiting."""
import sys

from app.pipeline import analytics

from .conftest import token


def test_numbers_guard():
    stats = {"total": 120, "open": 30, "sla_compliance_pct": 81.5}
    assert analytics.numbers_ok(["120 grievances, 30 open, SLA 81.5%"], stats)
    assert not analytics.numbers_ok(["There were 999 grievances"], stats)


def test_insights_template_when_providers_down(client, seeded):
    r = client.get("/api/v1/admin/insights?days=30", headers=token(client, "admin@janavaani.test")).json()
    assert r["generated_by"] == "template" and r["numbers_verified"] is True and len(r["bullets_en"]) >= 3


def test_audit_list_and_verify(client, seeded):
    h = token(client, "admin@janavaani.test")
    lst = client.get("/api/v1/admin/audit?type=escalated&page_size=5", headers=h).json()
    assert {"items", "total", "page", "page_size"} <= set(lst)
    v = client.get("/api/v1/admin/audit/verify", headers=h).json()
    assert v["valid"] is True and v["events_checked"] > 1000
    assert client.get("/api/v1/admin/audit", headers=token(client, "ravi.roads@janavaani.test")).status_code == 403


def test_ai_metrics_shape(client, seeded):
    m = client.get("/api/v1/admin/ai/metrics", headers=token(client, "admin@janavaani.test")).json()
    assert m["model_version"] and 0 < m["accuracy"] <= 1 and m["human_test"]["n"] == 48
    assert set(m["live"]) == {"auto_routed_pct", "needs_review_pct", "agreement_rate", "avg_pipeline_ms", "fallback_rate", "calls_24h"}
    assert len(m["confusion"]["labels"]) == len(m["confusion"]["matrix"])


def test_retrain_hot_swaps_and_adds_version(client, seeded, tmp_path, monkeypatch):
    import train_classifier as tc
    monkeypatch.setattr(tc, "MODELS", tmp_path)                 # never overwrite the committed model in tests
    h = token(client, "admin@janavaani.test")
    before = client.get("/api/v1/admin/ai/metrics", headers=h).json()
    after = client.post("/api/v1/admin/ai/retrain", headers=h).json()
    assert after["model_version"] != before["model_version"] and len(after["history"]) == len(before["history"]) + 1
    assert (tmp_path / "classifier.joblib").exists()
    from app.ml import classifier
    assert classifier.predict("neellu raavadam ledu")["department"] == "water"


def test_public_endpoints_privacy(client, seeded):
    st = client.get("/api/v1/public/stats").json()
    assert st["total"] > 0 and 0 <= st["resolution_rate_pct"] <= 100 and st["by_zone"]
    for r in st["recent_resolved"]:
        assert set(r) <= {"title_en", "category", "zone", "before_url", "after_url", "resolved_at"} and r.get("before_url") is None
    pts = client.get("/api/v1/public/map?days=30").json()
    assert pts and all("id" not in p and set(p) == {"lat", "lng", "category", "priority", "status"} for p in pts)
    near = client.get("/api/v1/public/nearby?lat=17.4968&lng=78.3614&radius_m=1500").json()
    assert all(set(n) == {"title", "category", "status", "distance_m", "support_count", "grievance_id"} for n in near)


def test_spam_is_not_registered(client):
    r = client.post("/api/v1/chat/turn", json={"text": "aaaaaaaaaaaaaaa", "ui_lang": "en"}).json()
    assert r["stage"] == "collecting" and not r.get("draft")


def test_rate_limit_returns_friendly_429(client):
    codes = [client.post("/api/v1/grievances/analyze", json={"text": "streetlight not working in Uppal", "ui_lang": "en"}).status_code
             for _ in range(35)]
    assert 429 in codes
    r = client.post("/api/v1/grievances/analyze", json={"text": "streetlight not working", "ui_lang": "en"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"


def test_me_endpoint(client, seeded):
    me = client.get("/api/v1/me", headers=token(client, "farhan.water@janavaani.test")).json()
    assert set(me) == {"id", "role", "name", "email", "preferred_language", "department_id"}
    assert me["role"] == "officer" and me["department_id"] == "water" and me["email"] == "farhan.water@janavaani.test"
    assert client.get("/api/v1/me").status_code == 401


def test_ward_and_asset_id_scheme(client, seeded):
    ids = {w["name"]: w["id"] for w in client.get("/api/v1/meta/wards").json()}
    assert ids["Kukatpally"] == "W-KKP-01" and ids["Miyapur"] == "W-SLP-04" and ids["Charminar"] == "W-CHR-01"
    import re
    from app.core.db import session_scope
    from app.models import Asset
    from sqlalchemy import select
    with session_scope() as db:
        aids = db.execute(select(Asset.id)).scalars().all()
    assert aids and all(re.fullmatch(r"(SL|DR|WP|BN|RD|TS)-(SLP|KKP|KHB|SEC|CHR|LBN)-\d{4}", a) for a in aids)
