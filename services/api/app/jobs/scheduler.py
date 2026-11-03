"""APScheduler on the virtual clock: escalation/auto-close every 2 min, spike scan every 10 min."""
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from ..core.db import session_scope

log = logging.getLogger("janavaani.scheduler")


def run_once() -> dict:
    from ..pipeline.workflow import run_escalations
    with session_scope() as db:
        return run_escalations(db)


def spike_scan() -> int:
    from ..pipeline.analytics import scan_spikes
    with session_scope() as db:
        return scan_spikes(db)


def _safe(fn):
    def w():
        try:
            log.info("job %s: %s", fn.__name__, fn())
        except Exception:
            log.exception("job %s failed", fn.__name__)
    return w


def start() -> BackgroundScheduler:
    s = BackgroundScheduler(timezone="UTC")
    s.add_job(_safe(run_once), "interval", minutes=2, id="escalation", max_instances=1, coalesce=True)
    s.add_job(_safe(spike_scan), "interval", minutes=10, id="spikes", max_instances=1, coalesce=True)
    s.start()
    return s
