"""Officer / supervisor endpoints #28–#42."""
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from ..ai import gateway, prompts
from ..ai.localize import localize
from ..core import clock
from ..core.db import get_db
from ..core.errors import err
from ..core.security import User, require
from ..ml import embeddings
from ..models import Appeal, Grievance, Incident, Message, Profile, RoutingCorrection, TimelineEvent
from ..pipeline import audit, workflow
from ..refdata import DEPARTMENT_IDS, department, haversine_m
from ..serialize import appeal_dict, detail_dict, event_dict, grievance_dict, message_dict, officer_dict, paged

router = APIRouter(prefix="/officer")
OPEN = workflow.OPEN


def scoped(db: Session, gid: str, user: User) -> Grievance:
    g = db.get(Grievance, gid)
    if not g:
        raise err(404, "not_found", "Grievance not found.")
    if user.role == "officer" and g.category != user.department_id and g.assigned_officer_id != user.id:
        raise err(403, "forbidden", "This grievance belongs to another department.")
    return g


def _scope_query(q, user: User):
    if user.role == "officer":
        q = q.where(or_(Grievance.category == user.department_id, Grievance.assigned_officer_id == user.id))
        if user.ward_ids:
            q = q.where(or_(Grievance.ward_id.in_(user.ward_ids), Grievance.assigned_officer_id == user.id))
    return q


@router.get("/inbox")
def inbox(status: str | None = None, priority: str | None = None, category: str | None = None, ward: str | None = None,
          q: str | None = None, sort: str = "default", overdue: bool = False, page: int = 1, page_size: int = 20,
          db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    now = clock.now()
    qq = _scope_query(select(Grievance), user)
    qq = qq.where(Grievance.status == status) if status else qq.where(Grievance.status.in_(OPEN + ("resolved_pending_verification",)))
    for col, val in ((Grievance.priority, priority), (Grievance.category, category), (Grievance.ward_id, ward)):
        if val:
            qq = qq.where(col == val)
    if overdue:
        qq = qq.where(Grievance.sla_due_at < now)
    if q:
        qq = qq.where(or_(Grievance.id.ilike(f"%{q}%"), Grievance.summary_en.ilike(f"%{q}%")))
    crit_over = case(((Grievance.priority == "critical") & (Grievance.sla_due_at < now), 1), else_=0)
    order = {"sla": [Grievance.sla_due_at.asc()], "newest": [Grievance.created_at.desc()],
             "score": [Grievance.priority_score.desc()]}.get(
        sort, [Grievance.is_emergency.desc(), crit_over.desc(), Grievance.priority_score.desc(), Grievance.sla_due_at.asc()])
    total = db.scalar(select(func.count()).select_from(qq.subquery()))
    rows = db.execute(qq.order_by(*order).offset((page - 1) * page_size).limit(page_size)).scalars()
    return paged([grievance_dict(g, db, user) for g in rows], total, page, page_size)


@router.get("/review-queue")
def review_queue(kind: str = "routing", page: int = 1, page_size: int = 20, db: Session = Depends(get_db),
                 user: User = Depends(require("supervisor"))):
    q = select(Grievance)
    if kind == "routing":
        q = q.where(Grievance.status == "needs_review")
    elif kind == "emergency":
        q = q.where(Grievance.is_emergency.is_(True), Grievance.emergency_confirmed.is_(None))
    elif kind == "disputed":
        q = q.where(or_(Grievance.status == "reopened", Grievance.reopen_count > 0,
                        Grievance.ai_verification["verdict"].as_string() == "suspicious"),
                    Grievance.status.not_in(["closed", "rejected", "merged"]))
    elif kind == "appeal":
        ids = select(Appeal.grievance_id).where(Appeal.status.in_(["filed", "under_review"]))
        q = q.where(Grievance.id.in_(ids))
    else:
        raise err(422, "bad_kind", "kind must be routing, emergency, disputed or appeal.")
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(Grievance.created_at.asc()).offset((page - 1) * page_size).limit(page_size)).scalars()
    return paged([grievance_dict(g, db, user) for g in rows], total, page, page_size)


class StatusIn(BaseModel):
    status: str
    note: str | None = None
    delay_reason: dict | None = None


@router.post("/grievances/{gid}/status")
def set_status(gid: str, body: StatusIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    g = scoped(db, gid, user)
    if body.status == "resolved_pending_verification":
        raise err(422, "use_resolve", "Use /resolve with proof photos to resolve a grievance.")
    if body.status in ("rejected", "closed") and not user.at_least("supervisor"):
        raise err(403, "forbidden", "Only supervisors can reject or close grievances directly.")
    workflow.change_status(db, g, body.status, user, body.note, body.delay_reason)
    db.commit()
    return detail_dict(g, db, user)


class NoteIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.post("/grievances/{gid}/notes")
def add_note(gid: str, body: NoteIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    g = scoped(db, gid, user)
    e = audit.add_event(db, g.id, "note", body.text, actor_role=user.role, actor_id=user.id, actor_name=user.name, internal=True)
    db.commit()
    return event_dict(e)


class ReassignIn(BaseModel):
    department_id: str | None = None
    officer_id: str | None = None
    reason: str = Field(..., min_length=3)


@router.post("/grievances/{gid}/reassign")
def reassign(gid: str, body: ReassignIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    g = scoped(db, gid, user)
    if body.department_id and body.department_id not in DEPARTMENT_IDS:
        raise err(422, "bad_department", "Unknown department.")
    if body.department_id and body.department_id != g.category:
        _correct_route(db, g, body.department_id, user, body.reason)
    workflow.assign(db, g, user, body.officer_id, reason=body.reason)
    db.commit()
    return detail_dict(g, db, user)


def _correct_route(db, g, new_dep, user, reason):
    db.add(RoutingCorrection(grievance_id=g.id, from_department=g.category, to_department=new_dep,
                             text_original=g.description_masked, by_user=user.id))
    old = g.category
    g.category = new_dep
    g.routing = {**g.routing, "department": new_dep, "method": "human", "needs_review": False,
                 "votes": g.routing.get("votes", []) + [{"source": "human", "department": new_dep}],
                 "explanation_en": f"Human correction: {old} → {new_dep}. {reason}"}
    g.assigned_officer_id = None
    audit.add_event(db, g.id, "reassigned", f"Department changed {old} → {new_dep}: {reason}", actor_role=user.role,
                    actor_id=user.id, actor_name=user.name, payload={"from": old, "to": new_dep})


class RouteIn(BaseModel):
    department_id: str
    sub_department: str | None = None


@router.post("/grievances/{gid}/route-decision")
def route_decision(gid: str, body: RouteIn, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    g = scoped(db, gid, user)
    if body.department_id not in DEPARTMENT_IDS or body.department_id == "other":
        raise err(422, "bad_department", "Choose a concrete department.")
    if body.department_id != g.category:
        _correct_route(db, g, body.department_id, user, "Supervisor routing decision")
    else:
        g.routing = {**g.routing, "method": "human", "needs_review": False}
    if body.sub_department:
        g.sub_department = body.sub_department
    if g.status == "needs_review":
        g.status = "registered"
    workflow.assign(db, g, user)
    db.commit()
    return detail_dict(g, db, user)


class EmergencyIn(BaseModel):
    confirmed: bool
    note: str | None = None


@router.post("/grievances/{gid}/emergency")
def emergency(gid: str, body: EmergencyIn, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    g = scoped(db, gid, user)
    g.emergency_confirmed = body.confirmed
    if body.confirmed:
        g.sla_hours = 4
        g.sla_due_at = g.created_at + timedelta(hours=4)
        workflow.recompute_priority(g)
        workflow.alert(db, "emergency_unconfirmed", "info", f"Emergency confirmed on {g.id}", body.note or "Confirmed by supervisor",
                       [g.id], f"emconf:{g.id}", g.ward_id, g.category)
    else:
        g.is_emergency = False
        g.priority_base = {**(g.priority_base or {}), "rule": False}
        workflow.recompute_priority(g)
        from ..pipeline.scoring import sla_hours
        g.sla_hours = sla_hours(g.priority, False)
        g.sla_due_at = g.created_at + timedelta(hours=g.sla_hours)
    audit.add_event(db, g.id, "emergency_confirmed", f"Emergency {'confirmed' if body.confirmed else 'denied'} by supervisor"
                    + (f": {body.note}" if body.note else ""), actor_role=user.role, actor_id=user.id, actor_name=user.name,
                    payload={"confirmed": body.confirmed, "sla_hours": g.sla_hours})
    workflow.live(db, f"dept:{g.category}", "grievance_updated", g.id)
    db.commit()
    return detail_dict(g, db, user)


class BriefIn(BaseModel):
    refresh: bool = False


def _similar_resolved(db, g, k=3):
    rows = db.execute(select(Grievance).where(Grievance.category == g.category, Grievance.resolved_at.is_not(None),
                                              Grievance.id != g.id).limit(400)).scalars().all()
    scored = sorted(rows, key=lambda x: -embeddings.cosine(g.embedding, x.embedding))[:k]
    out = []
    for x in scored:
        note = db.execute(select(TimelineEvent.message_en).where(TimelineEvent.grievance_id == x.id,
                                                                 TimelineEvent.type == "resolution_submitted")).scalar()
        out.append({"grievance_id": x.id, "title_en": (x.title or {}).get("en", x.summary_en[:80]),
                    "resolution_note": (note or "Resolved").replace("Resolution submitted: ", "")})
    return out


@router.post("/grievances/{gid}/brief")
def brief(gid: str, body: BriefIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    from pydantic import BaseModel as BM

    class B(BM):
        situation: str
        evidence: list[str] = []
        risks: list[str] = []
        suggested_next_steps: list[str] = []
        missing_info: list[str] = []
    g = scoped(db, gid, user)
    similar = _similar_resolved(db, g)
    evs = db.execute(select(TimelineEvent).where(TimelineEvent.grievance_id == g.id).order_by(TimelineEvent.seq.desc()).limit(10)).scalars()
    facts = {"summary": g.summary_en, "category": g.category, "priority": g.priority, "hazards": g.hazards,
             "location": (g.location or {}).get("ward_name"), "status": g.status, "support_count": g.support_count,
             "images": [m.ai.get("description_en") for m in g.media if m.ai], "recent_events": [e.message_en for e in evs],
             "similar_resolved": similar}
    import json
    r, meta = gateway.run("officer_brief", prompts.BRIEF.format(facts=json.dumps(facts, ensure_ascii=False)), B,
                          cache=not body.refresh, cache_extra=clock.iso(g.updated_at))
    if r:
        return {**r, "similar_resolved": similar, "generated_by": meta["provider"] if meta["provider"] in ("groq", "gemini") else "groq",
                "created_at": clock.iso(clock.now())}
    dep = department(g.category)
    missing = [f["label_en"] for f in dep["required_fields"] if f["key"] not in ("location_detail",)][:2]
    return {"situation": f"{dep['name']['en']} complaint, priority {g.priority} ({g.priority_score}), status {g.status}. {g.summary_en[:200]}",
            "evidence": [f"{len(g.media)} photo(s) attached", f"{g.support_count} citizen report(s)"],
            "risks": [f"Hazard: {h}" for h in g.hazards] or ["No hazards flagged by safety rules"],
            "suggested_next_steps": ["Acknowledge the citizen", "Schedule a site visit", "Upload a geotagged proof photo on resolution"],
            "missing_info": missing, "similar_resolved": similar, "generated_by": "fallback", "created_at": clock.iso(clock.now())}


class DraftIn(BaseModel):
    intent: str
    extra_en: str | None = None


TEMPLATES = {"acknowledge": "We have received your complaint {id} and our team is reviewing it.",
             "request_info": "To act on complaint {id}, please share more details or a photo of the exact spot.",
             "schedule_visit": "Our team will visit the site for complaint {id} before {due}.",
             "work_started": "Work has started on complaint {id}.",
             "resolved": "The issue in complaint {id} has been resolved. Please confirm in the app.",
             "delay_update": "Work on complaint {id} is delayed. We will update you before {due}.",
             "transfer": "Complaint {id} has been transferred to the correct department."}


@router.post("/grievances/{gid}/draft-reply")
def draft_reply(gid: str, body: DraftIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    from pydantic import BaseModel as BM

    class D(BM):
        draft_en: str
    if body.intent not in TEMPLATES:
        raise err(422, "bad_intent", "Unknown reply intent.")
    g = scoped(db, gid, user)
    due = clock.iso(g.sla_due_at)
    r, _ = gateway.run("draft_reply", prompts.DRAFT_REPLY.format(intent=body.intent, due=due, facts=g.summary_en,
                                                                 extra=body.extra_en or ""), D, cache=False)
    en = r["draft_en"] if r else TEMPLATES[body.intent].format(id=g.id, due=g.sla_due_at.strftime("%d %b %Y")) + (f" {body.extra_en}" if body.extra_en else "")
    return {"intent": body.intent, "draft_en": en, "draft_citizen": localize(en, g.language)}


class OfficerMsgIn(BaseModel):
    text_en: str = Field(..., min_length=1, max_length=2000)


@router.post("/grievances/{gid}/message")
def officer_message(gid: str, body: OfficerMsgIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    g = scoped(db, gid, user)
    m = Message(grievance_id=g.id, sender="officer", sender_name=user.name, text=localize(body.text_en, g.language))
    db.add(m)
    if not g.first_response_at:
        g.first_response_at = clock.now()
    audit.add_event(db, g.id, "message", "Officer sent a message to the citizen", actor_role=user.role, actor_id=user.id, actor_name=user.name)
    workflow.notify(db, g.citizen_id, g.id, "message", "New message from the officer", body.text_en, g.language)
    db.commit()
    return message_dict(m)


class ResolveIn(BaseModel):
    media_ids: list[str]
    note: str = Field(..., min_length=2)
    lat: float | None = None
    lng: float | None = None


@router.post("/grievances/{gid}/resolve")
def resolve(gid: str, body: ResolveIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    g = scoped(db, gid, user)
    workflow.resolve(db, g, user, body.media_ids, body.note, body.lat, body.lng)
    if g.incident_id:   # incident fan-out: merged members follow the parent, community_update in each language
        for m in db.execute(select(Grievance).where(Grievance.incident_id == g.incident_id, Grievance.id != g.id)).scalars():
            if m.status == "merged" or m.status in OPEN:
                if m.citizen_id:
                    workflow.notify(db, m.citizen_id, m.id, "community_update", "The issue you reported is fixed",
                                    f"The issue linked to incident {g.incident_id} was marked resolved.", m.language)
    db.commit()
    return detail_dict(g, db, user)


class AppealDecisionIn(BaseModel):
    decision: str
    note: str


@router.post("/grievances/{gid}/appeal-decision")
def appeal_decision(gid: str, body: AppealDecisionIn, db: Session = Depends(get_db), user: User = Depends(require("supervisor"))):
    if body.decision not in ("upheld", "dismissed"):
        raise err(422, "bad_decision", "decision must be upheld or dismissed.")
    g = scoped(db, gid, user)
    a = db.execute(select(Appeal).where(Appeal.grievance_id == g.id, Appeal.status.in_(["filed", "under_review"]))
                   .order_by(Appeal.created_at.desc())).scalars().first()
    if not a:
        raise err(404, "no_appeal", "No open appeal on this grievance.")
    a.status, a.decision_note, a.decided_by, a.decided_at = body.decision, localize(body.note, g.language), user.id, clock.now()
    audit.add_event(db, g.id, "appeal_decided", f"Appeal {body.decision}: {body.note}", actor_role=user.role, actor_id=user.id, actor_name=user.name)
    if body.decision == "upheld" and g.status in ("closed", "resolved_pending_verification"):
        workflow.reopen(db, g, user, "Appeal upheld by supervisor")
    workflow.notify(db, g.citizen_id, g.id, "status", "Appeal decided", f"Your appeal on {g.id} was {body.decision}.", g.language)
    db.commit()
    return detail_dict(g, db, user)


class BulkIn(BaseModel):
    ids: list[str]
    action: str
    payload: dict = {}


@router.post("/bulk")
def bulk(body: BulkIn, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    gs = [scoped(db, i, user) for i in body.ids]
    n = 0
    if body.action == "status":
        for g in gs:
            workflow.change_status(db, g, body.payload.get("status"), user, body.payload.get("note"))
            n += 1
    elif body.action == "assign":
        for g in gs:
            workflow.assign(db, g, user, body.payload.get("officer_id"), reason="bulk assignment")
            n += 1
    elif body.action == "merge":
        parent_id = body.payload.get("parent_id") or max(gs, key=lambda x: x.support_count).id
        parent = next(g for g in gs if g.id == parent_id)
        if not parent.incident_id:
            workflow._maybe_incident(db, parent) if parent.support_count >= 3 else None
            if not parent.incident_id:
                import secrets
                inc = Incident(id=f"INC-{clock.now().year}-{secrets.token_hex(3).upper()}", title_en=(parent.title or {}).get("en") or parent.summary_en[:120],
                               category=parent.category, ward_id=parent.ward_id, lat=parent.lat or 0, lng=parent.lng or 0, status=parent.status)
                db.add(inc)
                db.flush()
                parent.incident_id = inc.id
        for g in gs:
            if g.id == parent.id:
                continue
            g.incident_id, g.status = parent.incident_id, "merged"
            parent.support_count += g.support_count
            audit.add_event(db, g.id, "merged", f"Merged into {parent.id} (incident {parent.incident_id})", actor_role=user.role, actor_id=user.id)
            workflow.notify(db, g.citizen_id, g.id, "community_update", "Your complaint was combined",
                            f"Your complaint was combined with {parent.id}; you will be notified when it is fixed.", g.language)
            n += 1
        workflow.recompute_priority(parent)
    else:
        raise err(422, "bad_action", "action must be status, assign or merge.")
    db.commit()
    return {"updated": n}


@router.get("/officers")
def officers(department: str | None = None, db: Session = Depends(get_db), user: User = Depends(require("officer"))):
    q = select(Profile).where(Profile.role == "officer", Profile.is_active.is_(True))
    if department:
        q = q.where(Profile.department_id == department)
    return [officer_dict(p, db) for p in db.execute(q.order_by(Profile.name)).scalars()]


@router.get("/incidents")
def incidents(ward: str | None = None, category: str | None = None, db: Session = Depends(get_db),
              user: User = Depends(require("officer"))):
    q = select(Incident)
    if ward:
        q = q.where(Incident.ward_id == ward)
    if category or user.role == "officer":
        q = q.where(Incident.category == (category or user.department_id))
    out = []
    for inc in db.execute(q.order_by(Incident.created_at.desc())).scalars():
        members = db.execute(select(Grievance).where(Grievance.incident_id == inc.id)).scalars().all()
        out.append({"id": inc.id, "title_en": inc.title_en, "category": inc.category, "ward_id": inc.ward_id or "",
                    "centroid": {"lat": inc.lat, "lng": inc.lng}, "grievance_ids": [m.id for m in members],
                    "support_count": sum(m.support_count for m in members if m.status != "merged") or len(members),
                    "languages": sorted({m.language for m in members}), "status": inc.status,
                    "created_at": clock.iso(inc.created_at), "repeated": False})
    out += recurring(db, category or (user.department_id if user.role == "officer" else None), ward)
    return out


def recurring(db, category=None, ward=None):
    """Recurring problems (feature 99): assets or ~100 m grid cells with >=3 grievances in 90 days, same category."""
    since = clock.now() - timedelta(days=90)
    q = select(Grievance).where(Grievance.created_at >= since, Grievance.lat.is_not(None), Grievance.incident_id.is_(None))
    if category:
        q = q.where(Grievance.category == category)
    if ward:
        q = q.where(Grievance.ward_id == ward)
    cells = defaultdict(list)
    for g in db.execute(q).scalars():
        key = (g.category, g.asset_id) if g.asset_id else (g.category, round(g.lat / 0.0009), round(g.lng / 0.0009))
        cells[key].append(g)
    out = []
    for key, gs in cells.items():
        if len(gs) >= 3:
            out.append({"id": "REC-" + "-".join(str(k) for k in key), "title_en": f"Recurring {key[0]} problem ({len(gs)} reports in 90 days)",
                        "category": key[0], "ward_id": gs[0].ward_id or "", "centroid": {"lat": sum(g.lat for g in gs) / len(gs), "lng": sum(g.lng for g in gs) / len(gs)},
                        "grievance_ids": [g.id for g in gs], "support_count": sum(g.support_count for g in gs),
                        "languages": sorted({g.language for g in gs}), "status": gs[-1].status,
                        "created_at": clock.iso(min(g.created_at for g in gs)), "repeated": True})
    return out
