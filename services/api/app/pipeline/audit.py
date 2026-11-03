"""Hash-chained timeline (Spec B §6.3). Append-only through the application: events are only ever
inserted here; verify() recomputes every hash and detects edits, deletions (seq gaps) and reordering."""
import hashlib
import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core import clock
from ..models import TimelineEvent


def _canon(ev: dict) -> str:
    return json.dumps(ev, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


def compute_hash(prev_hash: str | None, e: TimelineEvent) -> str:
    body = {"grievance_id": e.grievance_id, "seq": e.seq, "type": e.type, "actor_role": e.actor_role,
            "actor_id": e.actor_id, "message_en": e.message_en, "payload": e.payload or {},
            "created_at": clock.iso(e.created_at)}
    return hashlib.sha256(((prev_hash or "") + _canon(body)).encode()).hexdigest()


def add_event(db: Session, grievance_id: str, type_: str, message_en: str, actor_role: str = "system",
              actor_id: str | None = None, actor_name: str | None = None, internal: bool = False,
              payload: dict | None = None, message: dict | None = None, at=None) -> TimelineEvent:
    last = db.execute(select(TimelineEvent).where(TimelineEvent.grievance_id == grievance_id)
                      .order_by(TimelineEvent.seq.desc()).limit(1)).scalar_one_or_none()
    seq = (last.seq + 1) if last else 1
    e = TimelineEvent(grievance_id=grievance_id, seq=seq, type=type_, actor_role=actor_role, actor_id=actor_id,
                      actor_name=actor_name, message_en=message_en, message=message, internal=internal,
                      payload=payload or {}, created_at=(at or clock.now()).replace(microsecond=0),
                      prev_hash=last.hash if last else None)
    e.hash = compute_hash(e.prev_hash, e)
    db.add(e)
    db.flush()
    return e


def verify(db: Session, grievance_id: str | None = None) -> dict:
    q = select(TimelineEvent).order_by(TimelineEvent.grievance_id, TimelineEvent.seq)
    if grievance_id:
        q = q.where(TimelineEvent.grievance_id == grievance_id)
    checked, prev_gid, prev_hash, expected_seq = 0, None, None, 1
    for e in db.execute(q).scalars():
        if e.grievance_id != prev_gid:
            prev_gid, prev_hash, expected_seq = e.grievance_id, None, 1
        checked += 1
        if e.seq != expected_seq or e.prev_hash != prev_hash or compute_hash(prev_hash, e) != e.hash:
            return {"grievance_id": e.grievance_id, "events_checked": checked, "valid": False, "first_broken_event_id": e.id}
        prev_hash, expected_seq = e.hash, expected_seq + 1
    out = {"events_checked": checked, "valid": True}
    if grievance_id:
        out["grievance_id"] = grievance_id
    return out


def count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(TimelineEvent)) or 0
