"""Virtual clock: real UTC now + demo offset (stored in settings table)."""
from datetime import datetime, timedelta, timezone

_offset_minutes = 0


def set_offset(minutes: int):
    global _offset_minutes
    _offset_minutes = int(minutes)


def offset() -> int:
    return _offset_minutes


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=_offset_minutes)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
