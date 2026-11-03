"""Auth: verifies Bearer JWTs (app-issued demo tokens, Supabase HS256, or Supabase JWKS) and loads the role
from `profiles`. Requests without a token are treated as an unauthenticated guest (allowed only on
'any'/'public' endpoints)."""
import hashlib
import logging
import secrets
import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .errors import err

ROLE_RANK = {"guest": 0, "citizen": 1, "officer": 2, "supervisor": 3, "admin": 4}
_jwks_client = None
_user_cache: dict[str, tuple[dict, float]] = {}
log = logging.getLogger("janavaani")
_PLACEHOLDER_SECRETS = {"", "change-me", "dev-only-change-me-janavaani-secret-key"}
_random_secret = secrets.token_urlsafe(48)
_warned = False


def _app_secret() -> str:
    """Secret for DEMO_MODE tokens. A value published in the repo must never sign tokens, so an unset or placeholder
    APP_JWT_SECRET falls back to a random per-process secret (demo tokens then stop working after a restart)."""
    global _warned
    s = get_settings().app_jwt_secret
    if s not in _PLACEHOLDER_SECRETS:
        return s
    if not _warned:
        _warned = True
        log.warning("APP_JWT_SECRET is not set: demo tokens use a random secret and end when the process restarts")
    return _random_secret


@dataclass
class User:
    id: str | None
    role: str
    name: str = ""
    department_id: str | None = None
    ward_ids: list | None = None
    zone: str | None = None
    authenticated: bool = False

    @property
    def is_gov(self):
        return self.role in ("officer", "supervisor", "admin")

    def at_least(self, role: str) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[role]


def issue_token(user_id: str, role: str, hours: int = 24) -> str:
    now = int(time.time())
    return jwt.encode({"sub": user_id, "role": role, "iss": "janavaani", "iat": now, "exp": now + hours * 3600},
                      _app_secret(), algorithm="HS256")


def _decode(token: str) -> dict:
    s = get_settings()
    if s.demo_mode:    # app-issued tokens exist only for demo logins
        try:
            return jwt.decode(token, _app_secret(), algorithms=["HS256"], issuer="janavaani",
                              options={"require": ["sub", "exp", "iss"]})
        except jwt.ExpiredSignatureError:
            raise err(401, "token_expired", "Session expired. Please sign in again.")
        except jwt.InvalidTokenError:
            pass
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.InvalidTokenError:
        raise err(401, "invalid_token", "Invalid authentication token.")
    if s.supabase_jwt_secret and alg == "HS256":
        try:
            return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        except jwt.InvalidTokenError:
            pass
    if s.supabase_url and alg in ("RS256", "ES256"):    # JWKS only publishes asymmetric keys
        global _jwks_client
        try:
            if _jwks_client is None:
                _jwks_client = jwt.PyJWKClient(f"{s.supabase_url}/auth/v1/.well-known/jwks.json", lifespan=600)
            key = _jwks_client.get_signing_key_from_jwt(token).key
            return jwt.decode(token, key, algorithms=["RS256", "ES256"], audience="authenticated")
        except Exception:
            pass
    if alg == "HS256" and (claims := _supabase_user(token)):
        return claims
    raise err(401, "invalid_token", "Invalid authentication token.")


def _supabase_user(token: str) -> dict | None:
    """Spec B §10 fallback for legacy HS256 projects without SUPABASE_JWT_SECRET: Supabase Auth says whose token it is.
    Only tokens whose issuer is this project are sent, so garbage never causes a network call. Cached 60 s per token."""
    s = get_settings()
    if not (s.supabase_url and s.supabase_service_role_key):
        return None
    try:
        if jwt.decode(token, options={"verify_signature": False}).get("iss") != f"{s.supabase_url}/auth/v1":
            return None
    except jwt.InvalidTokenError:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _user_cache.get(key)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        r = httpx.get(f"{s.supabase_url}/auth/v1/user", timeout=5,
                      headers={"apikey": s.supabase_service_role_key, "Authorization": f"Bearer {token}"})
        u = r.json() if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        log.warning("supabase /auth/v1/user unreachable or unreadable")
        return None
    if not isinstance(u, dict) or not u.get("id"):
        return None
    claims = {"sub": u["id"], "email": u.get("email"), "is_anonymous": bool(u.get("is_anonymous"))}
    if len(_user_cache) > 1000:
        _user_cache.clear()
    _user_cache[key] = (claims, time.time() + 60)
    return claims


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    from ..models import Profile  # avoid cycle
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return User(id=None, role="guest")
    claims = _decode(auth.split(" ", 1)[1].strip())
    uid = str(claims["sub"])
    prof = db.get(Profile, uid)
    if prof is None:
        # First request from a Supabase-authenticated user: create a citizen/guest profile.
        role = "guest" if claims.get("is_anonymous") else "citizen"
        prof = Profile(id=uid, role=role, name=claims.get("email", "Citizen").split("@")[0], email=claims.get("email"))
        db.add(prof)
        db.commit()
    if not prof.is_active:
        raise err(403, "inactive", "Account disabled.")
    return User(id=prof.id, role=prof.role, name=prof.name, department_id=prof.department_id,
                ward_ids=prof.ward_ids or [], zone=prof.zone, authenticated=True)


def require(role: str):
    def dep(user: User = Depends(current_user)) -> User:
        if not user.authenticated:
            raise err(401, "unauthorized", "Sign in required.")
        if not user.at_least(role):
            raise err(403, "forbidden", f"Requires role {role} or higher.")
        return user
    return dep
