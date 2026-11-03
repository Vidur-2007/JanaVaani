"""Gemini provider (REST generateContent, JSON mime type, multimodal inline images)."""
import httpx

from ...core.config import get_settings
from .errors import ProviderError, raise_for as _raise_for


def call(model: str, prompt: str, images: list[tuple[bytes, str]] | None, timeout: float) -> str:
    import base64
    s = get_settings()
    parts = [{"text": prompt}] + [{"inline_data": {"mime_type": mt, "data": base64.b64encode(b).decode()}} for b, mt in (images or [])]
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                   headers={"x-goog-api-key": s.gemini_api_key}, timeout=timeout,   # never in the URL: URLs get logged
                   json={"contents": [{"role": "user", "parts": parts}],
                         "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}})
    _raise_for(r)
    try:
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        raise ProviderError("empty_response", False)

