"""Auth: verifies Bearer JWTs (app-issued demo tokens, Supabase HS256, or Supabase JWKS) and loads the role
from `profiles`. Requests without a token are treated as an unauthenticated guest (allowed only on
'any'/'public' endpoints)."""
import time
from dataclasses import dataclass

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .errors import err

ROLE_RANK = {"guest": 0, "citizen": 1, "officer": 2, "supervisor": 3, "admin": 4}
_jwks_client = None


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
    s = get_settings()
    now = int(time.time())
    return jwt.encode({"sub": user_id, "role": role, "iss": "janavaani", "iat": now, "exp": now + hours * 3600},
                      s.app_jwt_secret, algorithm="HS256")


def _decode(token: str) -> dict:
    s = get_settings()
    try:
        return jwt.decode(token, s.app_jwt_secret, algorithms=["HS256"], options={"require": ["sub", "exp"]})
    except jwt.ExpiredSignatureError:
        raise err(401, "token_expired", "Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        pass
    if s.supabase_jwt_secret:
        try:
            return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        except jwt.InvalidTokenError:
            pass
    if s.supabase_url:
        global _jwks_client
        try:
            if _jwks_client is None:
                _jwks_client = jwt.PyJWKClient(f"{s.supabase_url}/auth/v1/.well-known/jwks.json", lifespan=600)
            key = _jwks_client.get_signing_key_from_jwt(token).key
            return jwt.decode(token, key, algorithms=["RS256", "ES256"], audience="authenticated")
        except Exception:
            pass
    raise err(401, "invalid_token", "Invalid authentication token.")


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
