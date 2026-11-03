"""Admin endpoints #43–#56 + demo login helper (DEMO_MODE only)."""
import threading
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..ai import gateway, prompts
from ..core import clock, settings_store
from ..core.config import get_settings
from ..core.db import get_db
from ..core.errors import err
from ..core.security import User, require
from ..ml import classifier
from ..models import AICall, AlertRow, Grievance, ModelVersion, Profile, RoutingCorrection, TimelineEvent
from ..pipeline import analytics, audit, workflow
from ..serialize import event_dict, officer_dict, paged

router = APIRouter()


@router.get("/admin/kpis")
def kpis(days: int = 30, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    return analytics.kpis(db, days)


@router.get("/admin/departments/performance")
def performance(days: int = 30, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    return analytics.department_performance(db, days)


@router.get("/admin/officers/workload")
def workload(department: str | None = None, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    q = select(Profile).where(Profile.role == "officer")
    if department:
        q = q.where(Profile.department_id == department)
    now = clock.now()
    out = []
    for p in db.execute(q).scalars():
        gs = db.execute(select(Grievance).where(Grievance.assigned_officer_id == p.id)).scalars().all()
        op = [g for g in gs if g.status in workflow.OPEN]
        out.append({"officer": officer_dict(p), "open": len(op), "critical": sum(g.priority == "critical" for g in op),
                    "overdue": sum(g.sla_due_at < now for g in op),
                    "resolved_7d": sum(1 for g in gs if g.resolved_at and g.resolved_at >= now - timedelta(days=7))})
    return sorted(out, key=lambda x: -x["open"])


@router.get("/admin/analytics/trends")
def trends(days: int = 30, group: str = "day", db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    return analytics.trends(db, days, group)


@router.get("/admin/analytics/breakdown")
def breakdown(by: str = "ward", days: int = 30, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    if by not in ("ward", "zone", "category", "priority"):
        raise err(422, "bad_by", "by must be ward, zone, category or priority.")
    return analytics.breakdown(db, by, days)


@router.get("/admin/map")
def admin_map(category: str | None = None, status: str | None = None, priority: str | None = None, days: int = 30,
              db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    return analytics.map_points(db, days, category, status, priority)


@router.get("/admin/alerts")
def alerts(db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    backlog = db.scalar(select(func.count()).select_from(Grievance).where(Grievance.status == "needs_review")) or 0
    if backlog >= 10:
        workflow.alert(db, "routing_review_backlog", "warning", f"{backlog} grievances waiting for routing review",
                       "Low-confidence routing decisions need a supervisor.", [], f"backlog:{clock.now().date()}")
        db.commit()
    out = []
    for a in db.execute(select(AlertRow).order_by(AlertRow.created_at.desc()).limit(200)).scalars():
        langs = sorted({g.language for g in (db.get(Grievance, i) for i in a.grievance_ids) if g}) if a.grievance_ids else None
        out.append({"id": a.id, "kind": a.kind, "severity": a.severity, "title_en": a.title_en, "detail_en": a.detail_en,
                    "ward_id": a.ward_id, "category": a.category, "grievance_ids": a.grievance_ids, "languages": langs,
                    "created_at": clock.iso(a.created_at)})
    return out


@router.get("/admin/insights")
def insights(days: int = 30, refresh: bool = False, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    from pydantic import BaseModel as BM

    class I(BM):
        bullets_en: list[str]
    stats = analytics.insight_stats(db, days)
    import json
    for attempt in range(2):
        r, meta = gateway.run("insights_summary", prompts.INSIGHTS.format(stats=json.dumps(stats)), I,
                              cache=not refresh and attempt == 0)
        if r and analytics.numbers_ok(r["bullets_en"], stats):
            return {"bullets_en": r["bullets_en"], "generated_by": meta["provider"] if meta["provider"] in ("groq", "gemini") else "groq",
                    "numbers_verified": True, "created_at": clock.iso(clock.now())}
        if not r:
            break
    bullets = analytics.template_insights(stats)
    return {"bullets_en": bullets, "generated_by": "template", "numbers_verified": analytics.numbers_ok(bullets, stats),
            "created_at": clock.iso(clock.now())}


@router.get("/admin/audit")
def audit_list(grievance_id: str | None = None, type: str | None = None, page: int = 1, page_size: int = 50,
               db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    q = select(TimelineEvent)
    if grievance_id:
        q = q.where(TimelineEvent.grievance_id == grievance_id)
    if type:
        q = q.where(TimelineEvent.type == type)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(TimelineEvent.created_at.desc(), TimelineEvent.seq.desc()).offset((page - 1) * page_size).limit(page_size)).scalars()
    return paged([event_dict(e) for e in rows], total, page, page_size)


@router.get("/admin/audit/verify")
def audit_verify(grievance_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    return audit.verify(db, grievance_id)


def _live_metrics(db: Session) -> dict:
    since = clock.now() - timedelta(hours=24)
    calls = db.execute(select(AICall).where(AICall.created_at >= since)).scalars().all()
    real = [c for c in calls if c.provider != "fallback"]
    gs = db.execute(select(Grievance.routing, Grievance.pipeline_ms).where(Grievance.pipeline_ms.is_not(None))).all()
    n = len(gs) or 1
    auto = sum(1 for r, _ in gs if (r or {}).get("method") == "auto")
    review = sum(1 for r, _ in gs if (r or {}).get("needs_review"))
    agree_n = agree = 0
    for r, _ in gs:
        votes = (r or {}).get("votes", [])
        cls = next((v["department"] for v in votes if v["source"] == "classifier"), None)
        llm = [v["department"] for v in votes if v["source"] in ("gemini", "groq")]
        if cls and llm:
            agree_n += 1
            agree += all(x == cls for x in llm)
    return {"auto_routed_pct": round(100 * auto / n, 1), "needs_review_pct": round(100 * review / n, 1),
            "agreement_rate": round(agree / agree_n, 3) if agree_n else 0.0,
            "avg_pipeline_ms": round(sum(ms for _, ms in gs) / n, 1) if gs else 0.0,
            "fallback_rate": round(sum(c.fallback_used for c in calls) / len(calls), 3) if calls else 0.0,
            "calls_24h": len(real)}


def _metrics(db: Session) -> dict:
    m = dict(classifier.metrics())
    hist = [{"model_version": v.version, "accuracy": v.metrics.get("accuracy", 0), "macro_f1": v.metrics.get("macro_f1", 0),
             "trained_at": clock.iso(v.trained_at), "corrections_used": v.corrections_used}
            for v in db.execute(select(ModelVersion).order_by(ModelVersion.trained_at)).scalars()]
    return {"model_version": m.get("model_version", "none"), "trained_at": m.get("trained_at", ""),
            "embedding_model": m.get("embedding_model", ""), "n_train": m.get("n_train", 0), "n_test": m.get("n_test", 0),
            "accuracy": m.get("accuracy", 0), "macro_f1": m.get("macro_f1", 0), "per_language": m.get("per_language", {}),
            "human_test": {k: v for k, v in (m.get("human_test") or {}).items() if k in ("accuracy", "n", "per_language")} or None,
            "confusion": m.get("confusion", {"labels": [], "matrix": []}), "live": _live_metrics(db), "history": hist}


@router.get("/admin/ai/metrics")
def ai_metrics(db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    return _metrics(db)


_retrain_lock = threading.Lock()


@router.post("/admin/ai/retrain")
def retrain(db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    if not _retrain_lock.acquire(blocking=False):
        raise err(409, "retrain_running", "A retrain is already running.")
    try:
        import sys
        from ..core.config import REPO_DIR
        sys.path.insert(0, str(REPO_DIR / "ml"))
        import train_classifier as tc
        corr = [{"text": c.text_original, "category": c.to_department}
                for c in db.execute(select(RoutingCorrection)).scalars()]
        result = {}

        def work():   # worker thread so the event loop/threadpool is not starved; join with a timeout
            result["model"], result["metrics"] = tc.train("tfidf", corr)
        t = threading.Thread(target=work)
        t.start()
        t.join(timeout=300)
        if "model" not in result:
            raise err(500, "retrain_failed", "Retraining did not finish.")
        tc.save(result["model"], result["metrics"])
        classifier.swap(result["model"], result["metrics"])
        for v in db.execute(select(ModelVersion)).scalars():
            v.is_active = False
        db.add(ModelVersion(version=result["metrics"]["model_version"], metrics={k: result["metrics"][k] for k in ("accuracy", "macro_f1", "n_train", "n_test")},
                            corrections_used=len(corr), is_active=True))
        db.commit()
        return _metrics(db)
    finally:
        _retrain_lock.release()


class ClockIn(BaseModel):
    advance_hours: float


def _demo_only():
    if not get_settings().demo_mode:
        raise err(403, "demo_disabled", "Demo controls are only available when DEMO_MODE=true.")


@router.get("/admin/demo/clock")
def get_clock(user: User = Depends(require("admin"))):
    _demo_only()
    return {"now": clock.iso(clock.now()), "offset_minutes": clock.offset()}


@router.post("/admin/demo/clock")
def advance_clock(body: ClockIn, db: Session = Depends(get_db), user: User = Depends(require("admin"))):
    _demo_only()
    if not 0 < body.advance_hours <= 24 * 30:
        raise err(422, "bad_hours", "advance_hours must be between 0 and 720.")
    settings_store.save_clock(clock.offset() + int(body.advance_hours * 60))
    stats = workflow.run_escalations(db)       # run immediately after a clock advance
    db.commit()
    return {"now": clock.iso(clock.now()), "offset_minutes": clock.offset(), "escalations": stats}


@router.post("/admin/demo/reset")
def reset(user: User = Depends(require("admin"))):
    _demo_only()
    import sys
    from ..core.config import REPO_DIR
    sys.path.insert(0, str(REPO_DIR / "ml"))
    import seed_db
    settings_store.save_clock(0)
    seed_db.main(quick=True)
    return {"ok": True}
