"""Groq provider (OpenAI-compatible chat, json_object mode)."""
import httpx

from ...core.config import get_settings
from .errors import ProviderError, raise_for as _raise_for


def call(model: str, prompt: str, timeout: float) -> str:
    s = get_settings()
    r = httpx.post("https://api.groq.com/openai/v1/chat/completions", timeout=timeout,
                   headers={"Authorization": f"Bearer {s.groq_api_key}"},
                   json={"model": model, "temperature": 0.2, "response_format": {"type": "json_object"},
                         "messages": [{"role": "system", "content": "Respond with JSON only."},
                                      {"role": "user", "content": prompt}]})
    _raise_for(r)
    try:
        return r.json()["choices"][0]["message"]["content"]
    except Exception:
        raise ProviderError("empty_response", False)

