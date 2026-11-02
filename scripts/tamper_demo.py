"""Admin-only debug script for the demo (Spec B §6.3): edit one timeline event so /admin/audit/verify detects the break,
then restore it. Usage: python scripts/tamper_demo.py [GRV-id] [--restore-after 30]
On Postgres the append-only trigger is bypassed only inside this session via `set local janavaani.allow_tamper = on`."""
import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from sqlalchemy import select, text  # noqa: E402

from app.core.db import engine, session_scope  # noqa: E402
from app.models import TimelineEvent  # noqa: E402
from app.pipeline import audit  # noqa: E402


def _edit(db, ev_id, msg):
    if engine.dialect.name == "postgresql":
        db.execute(text("set local janavaani.allow_tamper = on"))
    db.get(TimelineEvent, ev_id).message_en = msg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("grievance_id", nargs="?")
    ap.add_argument("--restore-after", type=int, default=30, help="seconds before restoring (0 = restore immediately)")
    a = ap.parse_args()
    with session_scope() as db:
        q = select(TimelineEvent).order_by(TimelineEvent.created_at.desc())
        if a.grievance_id:
            q = q.where(TimelineEvent.grievance_id == a.grievance_id)
        ev = db.execute(q.limit(1)).scalar_one()
        ev_id, gid, original = ev.id, ev.grievance_id, ev.message_en
        _edit(db, ev_id, original + " [edited]")
    with session_scope() as db:
        print("after tamper:", audit.verify(db, gid))
    print(f"tampered event {ev_id} on {gid}; restoring in {a.restore_after}s (show /admin/audit/verify?grievance_id={gid} now)")
    time.sleep(a.restore_after)
    with session_scope() as db:
        _edit(db, ev_id, original)
    with session_scope() as db:
        print("after restore:", audit.verify(db, gid))


if __name__ == "__main__":
    main()
