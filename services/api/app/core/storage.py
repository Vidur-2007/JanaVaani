"""Evidence photos: Supabase Storage (private bucket) when configured, local disk otherwise.
Media.url points at the API with an expiring signature; GET /uploads/{id} serves the file or redirects to a Supabase signed URL.
Signing at Supabase while serializing would cost one network call per photo on every inbox page."""
import hashlib
import hmac
import logging
import os
import time
from contextvars import ContextVar
from datetime import datetime
from pathlib import Path

import httpx

from .config import get_settings
from .security import _app_secret

log = logging.getLogger("janavaani.storage")
BUCKET = "evidence"
SUPABASE_PREFIX = "supabase://"
URL_TTL_S = 24 * 3600
TIMEOUT_S = 20
request_base: ContextVar[str] = ContextVar("request_base", default="")
_signed: dict[str, tuple[str, float]] = {}


def enabled() -> bool:
    s = get_settings()
    return bool(s.supabase_url and s.supabase_service_role_key)


def mode() -> str:
    return "supabase" if enabled() else "local"


def _headers() -> dict:
    return get_settings().service_key_headers()


def _object_url(path: str) -> str:
    return f"{get_settings().supabase_url}/storage/v1/object/{BUCKET}/{path}"


def _save_local(name: str, data: bytes) -> str:
    path = Path(get_settings().upload_dir) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return str(path)


def save(name: str, data: bytes) -> str:
    """Store WebP bytes under `name` (yyyy/mm/uuid.webp); returns the value for Media.storage_path.
    A Supabase failure falls back to local disk so a citizen's report still goes through."""
    if enabled():
        try:
            r = httpx.post(_object_url(name), content=data, timeout=TIMEOUT_S,
                           headers={**_headers(), "Content-Type": "image/webp", "x-upsert": "true"})
            r.raise_for_status()
            return SUPABASE_PREFIX + name
        except httpx.HTTPError as e:
            log.warning("supabase upload failed (%s); keeping the photo on local disk", type(e).__name__)
    return _save_local(name, data)


def read(storage_path: str) -> bytes | None:
    try:
        if storage_path.startswith(SUPABASE_PREFIX):
            r = httpx.get(_object_url(storage_path[len(SUPABASE_PREFIX):]), headers=_headers(), timeout=TIMEOUT_S)
            r.raise_for_status()
            return r.content
        return Path(storage_path).read_bytes()
    except (httpx.HTTPError, OSError) as e:
        log.warning("could not read a stored photo (%s)", type(e).__name__)
        return None


def signed_url(storage_path: str) -> str | None:
    """Supabase signed URL for a stored photo, reused until shortly before it expires."""
    cached = _signed.get(storage_path)
    if cached and cached[1] > time.time():
        return cached[0]
    name = storage_path[len(SUPABASE_PREFIX):]
    s = get_settings()
    try:
        r = httpx.post(f"{s.supabase_url}/storage/v1/object/sign/{BUCKET}/{name}", json={"expiresIn": URL_TTL_S},
                       headers=_headers(), timeout=TIMEOUT_S)
        r.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("could not sign a stored photo (%s)", type(e).__name__)
        return None
    url = f"{s.supabase_url}/storage/v1{r.json()['signedURL']}"
    _signed[storage_path] = (url, time.time() + URL_TTL_S - 3600)
    return url


def _public_base() -> str:
    s = get_settings()
    if s.public_api_url:
        return s.public_api_url.rstrip("/")
    space = os.environ.get("SPACE_HOST")     # set by Hugging Face Spaces
    return f"https://{space}" if space else request_base.get()


def _signature(media_id: str, exp: int) -> str:
    return hmac.new(_app_secret().encode(), f"{media_id}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def media_url(media_id: str) -> str:
    # Expiry rounded to the hour: the URL stays stable between refetches, so browsers can cache the image.
    exp = (int(time.time()) // 3600 + 1) * 3600 + URL_TTL_S
    return f"{_public_base()}/api/v1/uploads/{media_id}?exp={exp}&sig={_signature(media_id, exp)}"


def check_signature(media_id: str, exp: int, sig: str) -> str | None:
    """None when valid, otherwise why not: 'invalid' or 'expired'."""
    if not hmac.compare_digest(_signature(media_id, exp), sig):
        return "invalid"
    return "expired" if exp < time.time() else None


def object_name(media_id: str, now: datetime) -> str:
    return f"{now:%Y}/{now:%m}/{media_id}.webp"
