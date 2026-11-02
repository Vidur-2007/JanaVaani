"""DEMO_MODE login helper (used when Supabase Auth is not configured): signed token for a seeded demo account."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.db import get_db
from ..core.errors import err
from ..core.security import issue_token, require
from ..models import Profile

router = APIRouter()


def _demo_only():
    if not get_settings().demo_mode:
        raise err(403, "demo_disabled", "Demo controls are only available when DEMO_MODE=true.")


class DemoLoginIn(BaseModel):
    email: str


@router.post("/auth/demo-login")
def demo_login(body: DemoLoginIn, db: Session = Depends(get_db)):
    """DEMO_MODE helper when Supabase Auth is not configured: issues a signed token for a seeded demo account."""
    _demo_only()
    p = db.execute(select(Profile).where(Profile.email == body.email.lower())).scalar_one_or_none()
    if not p or not p.email.endswith("@janavaani.test"):
        raise err(404, "unknown_demo_account", "Not a seeded demo account.")
    return {"access_token": issue_token(p.id, p.role), "token_type": "bearer",
            "profile": {"id": p.id, "role": p.role, "name": p.name, "preferred_language": p.preferred_language,
                        "department_id": p.department_id}}


@router.get("/me")
def me(db: Session = Depends(get_db), user=Depends(require("guest"))):
    """Additive (requested by Laptop A, docs/contract-notes/A.md): the signed-in user's profile.
    `profiles` sits behind RLS, so the frontend reads it through the API."""
    p = db.get(Profile, user.id)
    return {"id": p.id, "role": p.role, "name": p.name, "email": p.email,
            "preferred_language": p.preferred_language, "department_id": p.department_id}
