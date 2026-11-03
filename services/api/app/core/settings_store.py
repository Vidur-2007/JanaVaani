"""Persisted settings (settings table): demo clock offset survives restarts."""
from ..models import Setting
from . import clock
from .db import session_scope


def load_clock():
    try:
        with session_scope() as db:
            s = db.get(Setting, "demo_clock_offset_minutes")
            clock.set_offset(int(s.value.get("v", 0)) if s else 0)
    except Exception:
        clock.set_offset(0)


def save_clock(minutes: int):
    clock.set_offset(minutes)
    with session_scope() as db:
        s = db.get(Setting, "demo_clock_offset_minutes")
        if s:
            s.value = {"v": minutes}
        else:
            db.add(Setting(key="demo_clock_offset_minutes", value={"v": minutes}))
