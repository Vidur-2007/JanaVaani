"""ORM -> contract shapes (master §8). Role-aware: officers see masked text; citizens never see internal events;
anonymous grievances hide citizen identity from government users."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .core import clock
from .models import Appeal, Grievance, Media, Message, Profile, TimelineEvent
from .pipeline import scoring, workflow


def officer_dict(p: Profile, db: Session | None = None) -> dict:
    d = {"id": p.id, "name": p.name, "designation": p.designation or "Officer", "department_id": p.department_id,
         "ward_ids": p.ward_ids or [], "office_name": p.office_name or "", "office_phone": p.office_phone}
    if db is not None:
        _, overdue = workflow.officer_load(db, p.id)
        d["open_cases"], d["overdue_cases"] = workflow.open_count(db, p.id), overdue
    return d


def media_dict(m: Media) -> dict:
    return {"id": m.id, "url": f"/api/v1/uploads/{m.id}", "kind": "image",
            "uploaded_by": "officer" if m.uploaded_by_role in ("officer", "supervisor", "admin") else "citizen",
            "purpose": m.purpose, "quality": m.quality or {"ok": True, "issue": "none"}, "ai": m.ai, "geo": m.geo,
            "created_at": clock.iso(m.created_at)}


def _loc(text, lang):
    return {"original": text or "", "en": text or "", "lang": lang}


def grievance_dict(g: Grievance, db: Session, viewer=None) -> dict:
    gov = bool(viewer and viewer.is_gov)
    is_admin = bool(viewer and viewer.role == "admin")
    desc_orig = g.description_original if (is_admin or not gov) else g.description_masked
    d = {
        "id": g.id, "title": {**(g.title or {}), "lang": g.language} if g.title else _loc("", g.language),
        "summary_en": g.summary_en,
        "description": {"original": desc_orig, "en": g.description_en or "", "lang": g.language},
        "formal_text": {**(g.formal_text or {}), "lang": g.language},
        "language": g.language, "script": g.script, "is_code_mixed": g.is_code_mixed,
        "category": g.category, "routing": {**g.routing, "sub_department": g.sub_department,
                                             "secondary_departments": g.secondary_departments or []},
        "status": g.status, "closure_type": g.closure_type, "priority": g.priority,
        "priority_score": g.priority_score, "priority_factors": g.priority_factors or [],
        "is_emergency": g.is_emergency, "emergency_confirmed": g.emergency_confirmed,
        "hazards": g.hazards or [], "vulnerable": g.vulnerable or [], "sentiment": g.sentiment,
        "distress_score": g.distress_score, "location": g.location or {"lat": g.lat, "lng": g.lng, "source": "text"},
        "asset_id": g.asset_id, "media": [media_dict(m) for m in g.media],
        "escalation_level": g.escalation_level, "incident_id": g.incident_id, "support_count": g.support_count,
        "related_ids": g.related_ids or [], "is_anonymous": g.is_anonymous, "is_private": g.is_private,
        "rating": g.rating, "feedback_comment": g.feedback_comment, "reopen_count": g.reopen_count,
        "ai_verification": g.ai_verification, "created_at": clock.iso(g.created_at),
        "updated_at": clock.iso(g.updated_at), "resolved_at": clock.iso(g.resolved_at), "closed_at": clock.iso(g.closed_at),
    }
    overdue = 0
    if g.assigned_officer_id:
        off = db.get(Profile, g.assigned_officer_id)
        if off:
            d["assigned_officer"] = officer_dict(off)
            overdue = workflow.officer_load(db, off.id)[1]
    d["sla"] = scoring.sla_view(g, overdue)
    if g.citizen_id and not (gov and g.is_anonymous):
        c = db.get(Profile, g.citizen_id)
        if c:
            d["citizen_display_name"] = c.name
    ap = db.execute(select(Appeal).where(Appeal.grievance_id == g.id).order_by(Appeal.created_at.desc())).scalars().first()
    if ap:
        d["appeal"] = appeal_dict(ap)
    return d


def appeal_dict(a: Appeal) -> dict:
    return {"id": a.id, "grievance_id": a.grievance_id, "reason": a.reason, "status": a.status,
            "decision_note": a.decision_note, "created_at": clock.iso(a.created_at), "decided_at": clock.iso(a.decided_at)}


def event_dict(e: TimelineEvent) -> dict:
    return {"id": e.id, "grievance_id": e.grievance_id, "type": e.type, "actor_role": e.actor_role,
            "actor_name": e.actor_name, "message_en": e.message_en, "message": e.message, "internal": e.internal,
            "payload": e.payload, "created_at": clock.iso(e.created_at), "hash": e.hash, "prev_hash": e.prev_hash}


def message_dict(m: Message) -> dict:
    return {"id": m.id, "grievance_id": m.grievance_id, "session_id": m.session_id, "sender": m.sender,
            "sender_name": m.sender_name, "text": m.text, "created_at": clock.iso(m.created_at)}


def detail_dict(g: Grievance, db: Session, viewer=None) -> dict:
    d = grievance_dict(g, db, viewer)
    gov = bool(viewer and viewer.is_gov)
    evs = db.execute(select(TimelineEvent).where(TimelineEvent.grievance_id == g.id).order_by(TimelineEvent.seq)).scalars()
    d["timeline"] = [event_dict(e) for e in evs if gov or not e.internal]
    msgs = db.execute(select(Message).where(Message.grievance_id == g.id).order_by(Message.created_at)).scalars()
    d["messages"] = [message_dict(m) for m in msgs]
    return d


def paged(items, total, page, page_size):
    return {"items": items, "total": total, "page": page, "page_size": page_size}
