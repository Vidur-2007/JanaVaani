"""P1: PII masking, emergency keywords (true + false positives), gateway fallback, meta + health endpoints."""
from app.ai import gateway
from app.core.config import get_settings
from app.pipeline import safety


def test_pii_masking():
    t = "Call me on +91 98480 22338 or 9848022338, aadhaar 1234 5678 9012, pan ABCDE1234F, mail a.b@x.com"
    m = safety.mask_pii(t)
    for raw in ("98480", "9848022338", "1234 5678 9012", "ABCDE1234F", "a.b@x.com"):
        assert raw not in m
    for tok in ("[PHONE]", "[AADHAAR]", "[PAN]", "[EMAIL]"):
        assert tok in m


def test_emergency_true_positives():
    for t in ["Live wire fell near the school gate", "కరెంటు తీగ తెగి రోడ్డు మీద పడింది", "गली में आग लगी है",
              "بجلی کا تار گر گیا", "current teega road meeda padindi", "Gas leak in our building"]:
        r = safety.detect_emergency(t)
        assert r["is_emergency"], t


def test_emergency_false_positives():
    for t in ["current bill is too high this month", "there is danger of mosquitoes", "streetlight not working",
              "fire station road has potholes"]:
        assert not safety.detect_emergency(t)["is_emergency"], t


def test_language_identification():
    assert safety.identify_language("మా వీధిలో నీళ్ళు రావడం లేదు")["language"] == "te"
    assert safety.identify_language("पानी नहीं आ रहा")["language"] == "hi"
    assert safety.identify_language("پانی نہیں آ رہا")["language"] == "ur"
    t = safety.identify_language("Miyapur lo road meeda pedda gunta undi")
    assert t["language"] == "te" and t["script"] == "latin" and t["is_code_mixed"]
    assert safety.identify_language("The streetlight is broken")["language"] == "en"


def test_gateway_fallback_force_fail_gemini(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "gemini_api_key", "fake-key")
    monkeypatch.setattr(s, "force_fail_gemini", True)
    monkeypatch.setattr(s, "groq_api_key", "")
    called = []
    monkeypatch.setattr(gateway, "_call_gemini", lambda *a, **k: called.append(1))
    res, meta = gateway.run("analyze_complaint", "x", cache=False)
    assert res is None and meta["fallback_used"] and not called      # Gemini never called when force-failed


def test_gateway_uses_groq_when_gemini_forced_down(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "gemini_api_key", "k")
    monkeypatch.setattr(s, "force_fail_gemini", True)
    monkeypatch.setattr(s, "groq_api_key", "k")
    monkeypatch.setattr(gateway, "_call_groq", lambda model, prompt, timeout: '{"department": "water", "confidence": 0.9}')
    res, meta = gateway.run("analyze_complaint", "neellu raavadam ledu", cache=False)
    assert res["department"] == "water" and meta["provider"] == "groq" and meta["fallback_used"]


def test_gateway_malformed_json_repair_then_fallback(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "gemini_api_key", "k")
    monkeypatch.setattr(s, "force_fail_gemini", False)
    monkeypatch.setattr(s, "groq_api_key", "")
    monkeypatch.setattr(gateway, "_call_gemini", lambda *a, **k: "not json at all")
    res, meta = gateway.run("analyze_complaint", "x", cache=False)
    assert res is None and meta["error"] == "malformed"


def test_health_and_meta(client):
    h = client.get("/api/v1/health").json()
    assert h["status"] in ("ok", "degraded") and set(h["providers"]) >= {"gemini", "groq", "db", "embeddings"}
    deps = client.get("/api/v1/meta/departments").json()
    assert len(deps) == 11 and all(set(d["name"]) == {"en", "te", "hi", "ur"} for d in deps)
    assert all(set(q["question"]) == {"en", "te", "hi", "ur"} for d in deps for q in d["required_fields"])
    assert len(client.get("/api/v1/meta/wards").json()) == 30
    gj = client.get("/api/v1/meta/wards.geojson").json()
    assert gj["type"] == "FeatureCollection" and len(gj["features"]) == 30
    assert {c["number"] for c in client.get("/api/v1/meta/emergency-contacts").json()} == {"112", "108", "101", "1912"}
    e = client.get("/api/v1/meta/assets/NOPE").json()
    assert e["error"]["code"] == "not_found"
