"""Gemini key handling: header only, never in URLs, logs or exceptions. Requests go through a real httpx client with a
MockTransport, so URLs, headers and httpx's own request logging behave as in production; no network."""
import json
import logging

import httpx
import pytest

from app.ai import gateway
from app.ai.providers import gemini
from app.ai.providers.errors import ProviderError
from app.core.config import get_settings

KEY = "TESTONLY-not-a-real-gemini-key-0123456789"     # deliberately not AIza-shaped, so secret scanners stay quiet


class Transport:
    """Routes httpx.post through a real client. Gemini answers from `gemini` (list, one entry per call; the last
    one repeats); Groq answers `groq_json`. Records every request as httpx built it."""
    def __init__(self, monkeypatch, gemini=("ok",), gemini_json=None, groq_json=None):
        self.gemini, self.gemini_json, self.groq_json = list(gemini), gemini_json, groq_json
        self.requests: list[httpx.Request] = []
        client = httpx.Client(transport=httpx.MockTransport(self.handle))
        monkeypatch.setattr(httpx, "post", client.post)

    def handle(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(req)
        if req.url.host == "generativelanguage.googleapis.com":
            outcome = self.gemini.pop(0) if len(self.gemini) > 1 else self.gemini[0]
            if outcome == "timeout":
                raise httpx.ReadTimeout("read timed out", request=req)
            if outcome != "ok":
                return httpx.Response(int(outcome), json={"error": {"message": "failed"}})
            text = json.dumps(self.gemini_json or {"department": "water", "confidence": 0.8})
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(self.groq_json)}}]})

    def gemini_requests(self):
        return [r for r in self.requests if r.url.host == "generativelanguage.googleapis.com"]

    def hosts(self):
        return ["gemini" if r.url.host.startswith("generativelanguage") else "groq" for r in self.requests]


@pytest.fixture
def keys(monkeypatch):
    s = get_settings()
    for k, v in (("gemini_api_key", KEY), ("groq_api_key", "test-groq"),
                 ("force_fail_gemini", False), ("force_fail_groq", False)):
        monkeypatch.setattr(s, k, v)
    monkeypatch.setattr(gateway.time, "sleep", lambda s: None)
    return s


@pytest.fixture
def logs(caplog):
    import app.main  # noqa: F401  (applies the app's logging configuration)
    caplog.set_level(logging.DEBUG)
    return caplog


# ---------- 1-2: header only, never in the URL
def test_gemini_sends_the_key_in_the_header_only(keys, monkeypatch):
    t = Transport(monkeypatch)
    gemini.call("gemini-test-model", "hello", None, 12)
    (req,) = t.gemini_requests()
    assert req.headers["x-goog-api-key"] == KEY
    assert KEY not in str(req.url) and not req.url.query
    assert str(req.url) == "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent"


def test_gemini_request_body_is_unchanged(keys, monkeypatch):
    t = Transport(monkeypatch)
    gemini.call("gemini-test-model", "hello", [(b"img", "image/webp")], 12)
    body = json.loads(t.gemini_requests()[0].content)
    assert body["contents"] == [{"role": "user", "parts": [{"text": "hello"},
                                                           {"inline_data": {"mime_type": "image/webp", "data": "aW1n"}}]}]
    assert body["generationConfig"] == {"responseMimeType": "application/json", "temperature": 0.2}
    assert KEY not in t.gemini_requests()[0].content.decode()


# ---------- 3: never in logs or exceptions
def test_httpx_request_lines_are_not_logged_at_info():
    import app.main  # noqa: F401
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


@pytest.mark.parametrize("outcome", ["ok", "401", "429", "500", "timeout"])
def test_the_key_never_reaches_logs_or_exceptions(keys, monkeypatch, logs, outcome):
    Transport(monkeypatch, gemini=[outcome], groq_json={"department": "roads", "confidence": 0.6})
    try:
        gemini.call("gemini-test-model", "hello", None, 12)
    except (ProviderError, httpx.HTTPError) as e:
        assert KEY not in str(e) and KEY not in repr(e) and KEY not in str(getattr(e, "request", ""))
    gateway.run("analyze_complaint", f"log probe {outcome}", cache=False)     # gateway warnings on failure too
    assert KEY not in logs.text
    assert not [r for r in logs.records if r.name.startswith("httpx") and r.levelno < logging.WARNING]


# ---------- 4: parsing unchanged
def test_gemini_answer_is_parsed_and_validated(keys, monkeypatch):
    Transport(monkeypatch, gemini_json={"text": "నీళ్ళు రావడం లేదు", "source_lang": "en"})

    class T(gateway.BaseModel):
        text: str
        source_lang: str = "other"
    res, meta = gateway.run("translate", "parse probe", T, cache=False)
    assert res == {"text": "నీళ్ళు రావడం లేదు", "source_lang": "en"}
    assert meta["provider"] == "gemini" and meta["fallback_used"] is False


def test_empty_gemini_answer_is_a_provider_error(keys, monkeypatch):
    monkeypatch.setattr(httpx, "post", httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"candidates": []}))).post)
    with pytest.raises(ProviderError, match="empty_response"):
        gemini.call("gemini-test-model", "hello", None, 12)


# ---------- 5: retry and Groq fallback unchanged
@pytest.mark.parametrize("failures,expected_hosts", [
    (["timeout"], ["gemini", "gemini", "groq"]),           # retryable: one retry, then Groq
    (["503"], ["gemini", "gemini", "groq"]),
    (["429"], ["gemini", "gemini", "groq"]),
    (["400"], ["gemini", "groq"]),                         # not retryable: straight to Groq
    (["401"], ["gemini", "groq"]),
    (["503", "ok"], ["gemini", "gemini"]),                 # the retry succeeds: Groq is not needed
])
def test_retry_and_groq_fallback(keys, monkeypatch, failures, expected_hosts):
    t = Transport(monkeypatch, gemini=failures, groq_json={"department": "roads", "confidence": 0.6})
    res, meta = gateway.run("analyze_complaint", f"fallback probe {failures}", cache=False)
    assert t.hosts() == expected_hosts
    assert meta["provider"] == expected_hosts[-1] and meta["fallback_used"] is (expected_hosts[-1] == "groq")
    assert res["department"] == ("roads" if expected_hosts[-1] == "groq" else "water")
    assert all(r.headers["x-goog-api-key"] == KEY and KEY not in str(r.url) for r in t.gemini_requests())


# ---------- access log: guest PINs and photo-link signatures are not written out
def test_access_log_redacts_ticket_pins_and_photo_signatures(caplog):
    import app.main  # noqa: F401  (installs the filter)
    caplog.set_level(logging.INFO, logger="uvicorn.access")
    access = logging.getLogger("uvicorn.access")
    access.info('%s - "%s %s HTTP/%s" %d', "10.0.0.1:5555", "GET", "/api/v1/grievances/GRV-2026-000001?pin=482913&lang=te", "1.1", 200)
    access.info('%s - "%s %s HTTP/%s" %d', "10.0.0.1:5555", "GET", "/api/v1/uploads/abc?exp=1790000000&sig=0123456789abcdef", "1.1", 307)
    assert "482913" not in caplog.text and "0123456789abcdef" not in caplog.text
    assert "pin=***&lang=te" in caplog.text and "exp=1790000000&sig=***" in caplog.text
