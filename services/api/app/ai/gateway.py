"""AI gateway: one entry point for every LLM task.

- Provider registry per task (primary -> fallback), Gemini and Groq via REST (httpx).
- 12 s timeout, one retry with jittered backoff on 429/5xx/timeout, then fallback provider.
- JSON responses are validated with a Pydantic model; one repair attempt, else fallback.
- Cache (ai_cache table, 24 h) keyed by sha256(task+model+inputs); DEMO_MODE replays cache hits.
- Every call is logged to ai_calls (latency, ok, fallback_used, error_code) — never prompts or keys.
- FORCE_FAIL_GEMINI / FORCE_FAIL_GROQ simulate outages. No key configured == provider unavailable.
- Callers MUST pass masked text only (see pipeline/safety.mask_pii).
Returns (result_dict | None, meta). None means "use your deterministic fallback".
"""
import hashlib
import json
import logging
import random
import re
import time
from datetime import timedelta

import httpx
from pydantic import BaseModel, ValidationError

from ..core import clock
from ..core.config import get_settings
from ..core.db import session_scope
from .providers import gemini as _gemini, groq as _groq
from .providers.errors import ProviderError


def _call_gemini(model, prompt, images, timeout):
    return _gemini.call(model, prompt, images, timeout)


def _call_groq(model, prompt, timeout):
    return _groq.call(model, prompt, timeout)

log = logging.getLogger("janavaani.ai")

TASKS = {
    "analyze_complaint": [("gemini", "main"), ("groq", "main")],
    "route_second_opinion": [("groq", "main"), ("gemini", "lite")],
    "translate": [("gemini", "main"), ("groq", "main")],
    "localize_reply": [("gemini", "main"), ("groq", "main")],
    "officer_brief": [("groq", "main"), ("gemini", "lite")],
    "draft_reply": [("groq", "main"), ("gemini", "lite")],
    "verify_resolution": [("gemini", "main")],
    "insights_summary": [("groq", "main"), ("gemini", "lite")],
    "guide_answer": [("gemini", "lite"), ("groq", "main")],
}
CACHE_ALWAYS = {"translate", "guide_answer", "officer_brief", "localize_reply"}




def _model_name(provider: str, tier: str) -> str:
    s = get_settings()
    if provider == "gemini":
        return s.gemini_model_main if tier == "main" else s.gemini_model_lite
    return s.groq_model_main if tier == "main" else s.groq_model_small


def provider_available(provider: str) -> bool:
    s = get_settings()
    if provider == "gemini":
        return bool(s.gemini_api_key) and not s.force_fail_gemini
    return bool(s.groq_api_key) and not s.force_fail_groq





def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no json object")
    return json.loads(m.group(0))


def _log_call(task, provider, model, ms, ok, fallback, code):
    try:
        from ..models import AICall
        with session_scope() as db:
            db.add(AICall(task=task, provider=provider, model=model, latency_ms=int(ms), ok=ok,
                          fallback_used=fallback, error_code=code))
    except Exception:
        log.warning("could not log ai call")


_dc = None


def _disk():
    """diskcache (Spec B §5), TTL 24 h. DEMO_MODE replays any hit."""
    global _dc
    if _dc is None:
        import diskcache
        _dc = diskcache.Cache(get_settings().ai_cache_dir)
    return _dc


def _cache_get(key: str):
    try:
        return _disk().get(key)
    except Exception:
        return None


def _cache_put(key: str, value: dict):
    try:
        _disk().set(key, value, expire=None if get_settings().demo_mode else 24 * 3600)
    except Exception:
        pass


def run(task: str, prompt: str, schema: type[BaseModel] | None = None,
        images: list[tuple[bytes, str]] | None = None, cache: bool | None = None,
        cache_extra: str = "") -> tuple[dict | None, dict]:
    s = get_settings()
    chain = TASKS[task]
    use_cache = (task in CACHE_ALWAYS) if cache is None else cache
    img_hash = "".join(hashlib.sha256(b).hexdigest()[:16] for b, _ in (images or []))
    key = hashlib.sha256(f"{task}|{prompt}|{img_hash}|{cache_extra}".encode()).hexdigest()
    meta = {"provider": "none", "model": None, "latency_ms": 0, "cached": False, "fallback_used": False, "error": None}
    if use_cache or s.demo_mode:
        hit = _cache_get(key)
        if hit is not None:
            meta.update(provider=hit.get("_provider", "cache"), cached=True)
            return {k: v for k, v in hit.items() if k != "_provider"}, meta

    for idx, (provider, tier) in enumerate(chain):
        if not provider_available(provider):
            meta["error"] = meta["error"] or f"{provider}_unavailable"
            continue
        if provider == "groq" and images:
            continue  # Groq path is text-only
        model = _model_name(provider, tier)
        timeout = 20.0 if images else s.ai_timeout_s
        for attempt in range(2):
            t0 = time.perf_counter()
            try:
                raw = _call_gemini(model, prompt, images, timeout) if provider == "gemini" else _call_groq(model, prompt, timeout)
                try:
                    data = _parse_json(raw)
                    if schema:
                        data = schema.model_validate(data).model_dump()
                except (ValueError, ValidationError) as ve:
                    fix = (f"Fix this JSON so it matches the schema {json.dumps(schema.model_json_schema()) if schema else ''}. "
                           f"Error: {str(ve)[:300]}. JSON: {raw[:3000]}. Respond with JSON only.")
                    raw2 = _call_gemini(model, fix, None, timeout) if provider == "gemini" else _call_groq(model, fix, timeout)
                    data = _parse_json(raw2)
                    if schema:
                        data = schema.model_validate(data).model_dump()
                ms = (time.perf_counter() - t0) * 1000
                _log_call(task, provider, model, ms, True, idx > 0, None)
                meta.update(provider=provider, model=model, latency_ms=int(ms), fallback_used=idx > 0, error=None)
                if use_cache or s.demo_mode:
                    _cache_put(key, {**data, "_provider": provider})
                return data, meta
            except (ProviderError, httpx.TimeoutException, httpx.TransportError, ValueError, ValidationError) as e:
                ms = (time.perf_counter() - t0) * 1000
                code = e.code if isinstance(e, ProviderError) else ("timeout" if isinstance(e, httpx.TimeoutException)
                                                                  else "network" if isinstance(e, httpx.TransportError) else "malformed")
                retryable = e.retryable if isinstance(e, ProviderError) else code in ("timeout", "network")
                _log_call(task, provider, model, ms, False, idx > 0, code)
                meta["error"] = code
                log.warning("ai task=%s provider=%s failed code=%s attempt=%d", task, provider, code, attempt)
                if retryable and attempt == 0:
                    time.sleep(0.8 + random.random() * 0.4)
                    continue
                break
    meta["fallback_used"] = True
    _log_call(task, "fallback", "deterministic", 0, True, True, meta["error"])
    return None, meta


def status() -> dict:
    return {"gemini": "configured" if provider_available("gemini") else "unavailable",
            "groq": "configured" if provider_available("groq") else "unavailable"}
