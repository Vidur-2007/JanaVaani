"""AI stabilization: Groq gpt-oss defaults, the real provider request/parse path, Gemini failure -> Groq fallback,
and translation source_lang. httpx is stubbed underneath the providers; no network."""
import json

import httpx
import pytest
from pydantic import BaseModel

from app.ai import gateway
from app.core.config import API_DIR, Settings, get_settings

GROQ_MAIN, GROQ_SMALL = "openai/gpt-oss-120b", "openai/gpt-oss-20b"


class FakeHTTP:
    """Stands in for httpx.post: Gemini either answers or fails as configured, Groq answers with `groq_json`."""
    def __init__(self, monkeypatch, gemini="timeout", gemini_json=None, groq_json=None):
        self.gemini, self.gemini_json, self.groq_json = gemini, gemini_json, groq_json
        self.calls = []
        monkeypatch.setattr(httpx, "post", self.post)

    def post(self, url, json=None, headers=None, params=None, timeout=None, **kw):
        req = httpx.Request("POST", url)
        if "generativelanguage.googleapis.com" in url:
            self.calls.append(("gemini", url.split("/models/")[1].split(":")[0], json))
            if self.gemini == "timeout":
                raise httpx.ReadTimeout("read timed out", request=req)
            if self.gemini == "not_found":
                return httpx.Response(404, json={"error": {"status": "NOT_FOUND"}}, request=req)
            text = _dumps(self.gemini_json)
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]}, request=req)
        self.calls.append(("groq", json["model"], json))
        return httpx.Response(200, json={"choices": [{"message": {"content": _dumps(self.groq_json)}}]}, request=req)

    def providers(self):
        return [(p, m) for p, m, _ in self.calls]


def _dumps(v):
    return v if isinstance(v, str) else json.dumps(v)


@pytest.fixture
def keys(monkeypatch):
    s = get_settings()
    for k, v in (("gemini_api_key", "test-gemini"), ("groq_api_key", "test-groq"),
                 ("force_fail_gemini", False), ("force_fail_groq", False)):
        monkeypatch.setattr(s, k, v)
    monkeypatch.setattr(gateway.time, "sleep", lambda s: None)     # skip the retry backoff
    return s


# ---------- Groq defaults
def test_groq_defaults_are_the_gpt_oss_models(monkeypatch):
    monkeypatch.delenv("GROQ_MODEL_MAIN", raising=False)
    monkeypatch.delenv("GROQ_MODEL_SMALL", raising=False)
    s = Settings(_env_file=None)
    assert (s.groq_model_main, s.groq_model_small) == (GROQ_MAIN, GROQ_SMALL)


def test_env_example_matches_the_groq_defaults():
    env = {}
    for line in (API_DIR / ".env.example").read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.split("#", 1)[0].strip()
    assert (env["GROQ_MODEL_MAIN"], env["GROQ_MODEL_SMALL"]) == (GROQ_MAIN, GROQ_SMALL)
    assert "llama" not in (API_DIR / ".env.example").read_text()


# ---------- both Groq models through the real provider and gateway
class Spam(BaseModel):
    spam_likelihood: float
    reason: str = ""


class Route(BaseModel):
    department: str
    confidence: float


@pytest.mark.parametrize("task,model,schema,answer", [
    ("route_second_opinion", GROQ_MAIN, Route, {"department": "water", "confidence": 0.9}),
    ("spam_check", GROQ_SMALL, Spam, {"spam_likelihood": 0.1, "reason": "genuine civic complaint"}),
])
def test_groq_models_get_json_mode_and_their_answers_are_parsed(keys, monkeypatch, task, model, schema, answer):
    monkeypatch.setattr(keys, "gemini_api_key", "")       # spam_check starts on Gemini lite; leave Groq to answer
    http = FakeHTTP(monkeypatch, groq_json=answer)
    res, meta = gateway.run(task, f"probe for {task}", schema, cache=False)
    assert res == answer
    assert meta["provider"] == "groq" and meta["model"] == model
    _, sent_model, body = http.calls[-1]
    assert sent_model == model
    assert body["response_format"] == {"type": "json_object"}
    assert body["messages"][0] == {"role": "system", "content": "Respond with JSON only."}


def test_groq_answer_wrapped_in_a_code_fence_is_still_parsed(keys, monkeypatch):
    FakeHTTP(monkeypatch, gemini="not_found", groq_json='```json\n{"department": "roads", "confidence": 0.7}\n```')
    res, meta = gateway.run("route_second_opinion", "fenced probe", Route, cache=False)
    assert res == {"department": "roads", "confidence": 0.7} and meta["model"] == GROQ_MAIN


# ---------- Gemini failure -> Groq fallback
def test_gemini_timeout_is_retried_once_then_groq_main_answers(keys, monkeypatch):
    http = FakeHTTP(monkeypatch, gemini="timeout", groq_json={"department": "water", "confidence": 0.8})
    res, meta = gateway.run("analyze_complaint", "timeout probe", Route, cache=False)
    assert http.providers() == [("gemini", keys.gemini_model_main), ("gemini", keys.gemini_model_main), ("groq", GROQ_MAIN)]
    assert res == {"department": "water", "confidence": 0.8}
    assert meta["provider"] == "groq" and meta["fallback_used"] is True and meta["error"] is None


def test_gemini_model_not_found_is_not_retried(keys, monkeypatch):
    http = FakeHTTP(monkeypatch, gemini="not_found", groq_json={"department": "water", "confidence": 0.8})
    res, meta = gateway.run("analyze_complaint", "not found probe", Route, cache=False)
    assert http.providers() == [("gemini", keys.gemini_model_main), ("groq", GROQ_MAIN)]
    assert meta["provider"] == "groq" and res["department"] == "water"


def test_both_providers_down_returns_none_for_the_deterministic_fallback(keys, monkeypatch):
    http = FakeHTTP(monkeypatch, gemini="timeout", groq_json="not json at all")
    res, meta = gateway.run("analyze_complaint", "all down probe", Route, cache=False)
    assert res is None and meta["fallback_used"] is True
    assert [p for p, _ in http.providers()] == ["gemini", "gemini", "groq", "groq"]   # Groq: answer + one repair


def test_translate_endpoint_falls_back_to_groq_when_gemini_times_out(client, keys, monkeypatch):
    http = FakeHTTP(monkeypatch, gemini="timeout", groq_json={"text": "డ్రెయిన్ పొంగుతోంది", "source_lang": "te"})
    r = client.post("/api/v1/translate", json={"text": "Fallback probe: the drain is overflowing.", "target_lang": "te"})
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "డ్రెయిన్ పొంగుతోంది", "source_lang": "en"}
    assert [p for p, _ in http.providers()] == ["gemini", "gemini", "groq"]


# ---------- translation source_lang
@pytest.mark.parametrize("text,target,llm_lang,expected", [
    ("Source probe: the streetlight near the bus stop is off.", "te", "te", "en"),   # LLM echoed the target
    ("Source probe: the streetlight near the bus stop is off.", "hi", "en", "en"),
    ("నీళ్ళు రావడం లేదు, మూడు రోజులు అయింది", "en", "en", "te"),
    ("पानी तीन दिन से नहीं आ रहा है", "en", "en", "hi"),
    ("تین دن سے پانی نہیں آ رہا", "en", "en", "ur"),
    ("neellu raavadam ledu chala rojulu", "en", "en", "te"),                         # romanised Telugu
    ("teen din se paani nahi aa raha hai", "en", "en", "hi"),                       # romanised Hindi
    ("Bonjour, la lampe de la rue est cassée", "te", "other", "other"),            # Latin but not English: keep the LLM
])
def test_translate_source_lang(client, keys, monkeypatch, text, target, llm_lang, expected):
    FakeHTTP(monkeypatch, gemini="ok", gemini_json={"text": "translated", "source_lang": llm_lang})
    r = client.post("/api/v1/translate", json={"text": text, "target_lang": target})
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "translated", "source_lang": expected}


def test_translate_into_the_same_language_skips_the_llm(client, keys, monkeypatch):
    http = FakeHTTP(monkeypatch, gemini="ok", gemini_json={"text": "unused", "source_lang": "en"})
    r = client.post("/api/v1/translate", json={"text": "నీళ్ళు రావడం లేదు", "target_lang": "te"})
    assert r.json() == {"text": "నీళ్ళు రావడం లేదు", "source_lang": "te"} and http.calls == []
