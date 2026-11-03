"""Grievance lifecycle: create, assign, support, status, resolve+verify, feedback, escalation, notifications."""
import hashlib
import io
import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core import clock, storage
from ..core.config import get_settings
from ..core.errors import err
from ..models import (AlertRow, Grievance, Incident, LiveEvent, Media, Notification, Profile, Supporter)
from ..refdata import department, haversine_m, ward
from . import audit, scoring

OPEN = ("registered", "needs_review", "assigned", "in_progress", "reopened")
TRANSITIONS = {
    "registered": {"needs_review", "assigned", "rejected", "merged"},
    "needs_review": {"assigned", "rejected", "merged"},
    "assigned": {"in_progress", "rejected", "merged", "needs_review"},
    "in_progress": {"resolved_pending_verification", "assigned", "merged"},
    "resolved_pending_verification": {"closed", "reopened"},
    "reopened": {"in_progress", "assigned", "resolved_pending_verification"},
    "closed": {"reopened"}, "rejected": set(), "merged": set(),
}
WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}


# ---------- notifications + live events ----------
def live(db: Session, audience: str, kind: str, gid: str | None = None):
    db.add(LiveEvent(audience=audience, kind=kind, grievance_id=gid))


def notify(db: Session, user_id: str | None, gid: str | None, type_: str, title_en: str, body_en: str, lang: str = "en"):
    if not user_id:
        return
    from ..ai.localize import localize
    db.add(Notification(user_id=user_id, grievance_id=gid, type=type_, title=localize(title_en, lang),
                        body=localize(body_en, lang)))
    live(db, f"user:{user_id}", "notification", gid)


def alert(db: Session, kind: str, severity: str, title: str, detail: str, gids: list[str], dedupe: str,
          ward_id=None, category=None) -> bool:
    """True when a new alert was created (False: one with this dedupe key exists)."""
    if db.execute(select(AlertRow).where(AlertRow.dedupe_key == dedupe)).scalar_one_or_none():
        return False
    db.add(AlertRow(kind=kind, severity=severity, title_en=title, detail_en=detail, grievance_ids=gids,
                    dedupe_key=dedupe, ward_id=ward_id, category=category))
    live(db, "role:admin", "alert", gids[0] if gids else None)
    return True


# ---------- access ----------
def in_scope(user, g: Grievance) -> bool:
    """Spec B §10: officers act on their department's grievances in their wards, or on ones assigned to them;
    supervisors and admins see every department. Same rule as the officer inbox query."""
    if user.role != "officer" or g.assigned_officer_id == user.id:
        return True
    return g.category == user.department_id and (not user.ward_ids or g.ward_id in user.ward_ids)


# ---------- ids, assignment ----------
def next_id(db: Session) -> str:
    year = clock.now().year
    prefix = f"GRV-{year}-"
    last = db.execute(select(Grievance.id).where(Grievance.id.like(prefix + "%")).order_by(Grievance.id.desc()).limit(1)).scalar()
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{n:06d}"


def officer_load(db: Session, officer_id: str) -> tuple[int, int]:
    rows = db.execute(select(Grievance.priority, Grievance.sla_due_at).where(
        Grievance.assigned_officer_id == officer_id, Grievance.status.in_(OPEN))).all()
    now = clock.now()
    return sum(WEIGHT.get(p, 1) for p, _ in rows), sum(1 for _, d in rows if d < now)


def pick_officer(db: Session, dep: str, ward_id: str | None, zone: str | None) -> Profile | None:
    officers = db.execute(select(Profile).where(Profile.role == "officer", Profile.department_id == dep,
                                                Profile.is_active.is_(True))).scalars().all()
    eligible = [o for o in officers if ward_id and ward_id in (o.ward_ids or [])]
    if not eligible:
        eligible = [o for o in officers if zone and o.zone == zone]          # zone-level fallback
    if not eligible:
        return None
    return min(eligible, key=lambda o: (*officer_load(db, o.id), o.name))


# ---------- create ----------
def create_from_analysis(db: Session, res: dict, user, *, media_ids=None, asset_id=None, is_anonymous=False,
                         is_private=False, location_override=None, category_override=None, issue_text=None) -> tuple[Grievance, str | None]:
    a, routing, prio = res["analysis"], dict(res["routing"]), res["priority"]
    if category_override:
        routing["department"] = category_override
    loc = location_override or res["location"] or {}
    now = clock.now()
    gid = next_id(db)
    is_em = bool(a.get("is_emergency"))
    sla_h = prio["sla_hours"]
    g = Grievance(
        id=gid, citizen_id=user.id if user and user.authenticated else None, language=a["language"],
        script=a["script"], is_code_mixed=a["is_code_mixed"], description_original=res["text"],
        description_masked=res["masked"], description_en=a.get("text_en") or "", title=a["title"],
        formal_text=a["formal_text"], fields={k: str(v)[:200] for k, v in (a.get("fields") or {}).items() if str(v).strip()},
        summary_en=issue_text or a.get("summary_en", ""), category=routing["department"],
        sub_department=routing.get("sub_department"), secondary_departments=routing.get("secondary_departments", []),
        routing=routing, status="registered", priority=prio["level"], priority_score=prio["score"],
        priority_factors=prio["factors"],
        priority_base={"urgency": a["urgency"], "hazards": a.get("hazards", []), "rule": res["emergency"]["is_emergency"],
                       "distress": a.get("distress_score", 0), "vulnerable": a.get("vulnerable", [])},
        is_emergency=is_em, emergency_confirmed=None, hazards=a.get("hazards", []), vulnerable=a.get("vulnerable", []),
        sentiment=a.get("sentiment", "concerned"), distress_score=a.get("distress_score", 0.0),
        lat=loc.get("lat"), lng=loc.get("lng"), location=loc, ward_id=loc.get("ward_id"), zone=loc.get("zone"),
        asset_id=asset_id, sla_hours=sla_h, sla_due_at=now + timedelta(hours=sla_h),
        eta_at=scoring.eta(db, routing["department"], loc.get("ward_id"), now),
        is_anonymous=is_anonymous, is_private=is_private, embedding=res["embedding"],
        embedding_kind=res["embedding_kind"], pipeline_ms=res.get("pipeline_ms"), created_at=now, updated_at=now)
    pin = None
    if not (user and user.authenticated):
        pin = f"{secrets.randbelow(10**6):06d}"
        g.guest_pin_hash = hash_pin(gid, pin)
    db.add(g)
    db.flush()
    for mid in media_ids or []:
        m = db.get(Media, mid)
        if m and m.grievance_id is None:
            m.grievance_id = gid
    audit.add_event(db, gid, "registered", "Grievance registered", actor_role=user.role if user else "guest",
                    actor_id=user.id if user else None)
    audit.add_event(db, gid, "classified", routing["explanation_en"], actor_role="ai",
                    payload={"department": routing["department"], "confidence": routing["confidence"],
                             "votes": routing["votes"], "priority": prio["level"], "score": prio["score"],
                             "analysis_source": a.get("analysis_source")})
    if is_em:
        audit.add_event(db, gid, "emergency_flagged", "Emergency keywords detected: " + ", ".join(res["emergency"]["matched_terms"] or a.get("hazards", [])),
                        actor_role="system", payload={"matched_terms": res["emergency"]["matched_terms"]})
    if routing["needs_review"] or not g.ward_id:
        g.status = "needs_review"
        reason = "low routing confidence" if routing["needs_review"] else "location could not be resolved to a ward"
        audit.add_event(db, gid, "routing_review", f"Sent to human review: {reason}", actor_role="system")
        live(db, "role:admin", "grievance_created", gid)
    else:
        assign(db, g, None)
    live(db, f"dept:{g.category}", "grievance_created", gid)
    live(db, "public", "grievance_created", gid)
    if g.citizen_id:
        notify(db, g.citizen_id, gid, "status", "Complaint registered",
               f"Your complaint {gid} was registered and routed to {department(g.category)['name']['en']}.", g.language)
    return g, pin


def assign(db: Session, g: Grievance, actor, officer_id: str | None = None, reason: str = "least-loaded eligible officer"):
    off = db.get(Profile, officer_id) if officer_id else pick_officer(db, g.category, g.ward_id, g.zone)
    if off is None:
        g.status = "needs_review"
        audit.add_event(db, g.id, "routing_review", "No eligible officer for this department/ward — sent to review",
                        actor_role="system")
        return None
    first = g.assigned_officer_id is None
    g.assigned_officer_id = off.id
    if g.status in ("registered", "needs_review"):
        g.status = "assigned"
    audit.add_event(db, g.id, "assigned" if first else "reassigned", f"Assigned to {off.name} ({off.designation or 'Officer'})",
                    actor_role=actor.role if actor else "system", actor_id=actor.id if actor else None,
                    payload={"officer_id": off.id, "reason": reason})
    live(db, f"dept:{g.category}", "grievance_updated", g.id)
    return off


def hash_pin(gid: str, pin: str) -> str:
    return hashlib.sha256(f"{gid}:{pin}:{get_settings().app_jwt_secret}".encode()).hexdigest()


# ---------- support / incidents ----------
def recompute_priority(g: Grievance):
    b = g.priority_base or {}
    p = scoring.priority(b.get("urgency", "medium"), b.get("hazards", g.hazards), b.get("rule", False),
                         b.get("distress", 0), b.get("vulnerable", []), g.support_count)
    if g.emergency_confirmed and p["score"] < 80:
        p["score"], p["level"] = 80, "critical"
    g.priority_score, g.priority, g.priority_factors = p["score"], p["level"], p["factors"]


def add_support(db: Session, g: Grievance, user_key: str, actor) -> dict:
    if g.status in ("rejected", "merged"):
        raise err(409, "not_supportable", "This grievance can no longer be supported.")
    if db.execute(select(Supporter).where(Supporter.grievance_id == g.id, Supporter.user_key == user_key)).scalar_one_or_none():
        return {"support_count": g.support_count, "incident_id": g.incident_id, "already_supported": True}
    db.add(Supporter(grievance_id=g.id, user_key=user_key))
    g.support_count += 1
    old = g.priority
    recompute_priority(g)
    audit.add_event(db, g.id, "support_added", f"Another citizen reported the same issue ({g.support_count} total)",
                    actor_role=actor.role if actor else "guest", payload={"support_count": g.support_count})
    if old != g.priority:
        audit.add_event(db, g.id, "priority_changed", f"Priority {old} → {g.priority} (community reports)", actor_role="system")
    if g.citizen_id:
        notify(db, g.citizen_id, g.id, "community_update", "More citizens reported this",
               f"{g.support_count} citizens have now reported this issue.", g.language)
    live(db, f"dept:{g.category}", "grievance_updated", g.id)
    _maybe_incident(db, g)
    return {"support_count": g.support_count, "incident_id": g.incident_id}


def _maybe_incident(db: Session, g: Grievance):
    if g.incident_id or g.support_count < 3:
        return
    inc = Incident(id=f"INC-{clock.now().year}-{secrets.token_hex(3).upper()}", title_en=(g.title or {}).get("en") or g.summary_en[:120],
                   category=g.category, ward_id=g.ward_id, lat=g.lat or 0, lng=g.lng or 0, status=g.status)
    db.add(inc)
    db.flush()
    g.incident_id = inc.id


INCIDENT_OPEN_ORDER = ("reopened", "in_progress", "assigned", "needs_review", "registered")
RESOLVED = ("resolved_pending_verification", "closed")


def sync_incident(db: Session, incident_id: str | None):
    """Incident status follows its members (merged and rejected ones excluded). When the whole incident becomes
    resolved, each merged member's citizen gets one community_update in their language (Spec B §6.1 fan-out).
    Open members are resolved one by one through /resolve and get their own verification request."""
    inc = db.get(Incident, incident_id) if incident_id else None
    if not inc:
        return
    members = db.execute(select(Grievance).where(Grievance.incident_id == incident_id)).scalars().all()
    active = [m.status for m in members if m.status not in ("merged", "rejected")]
    if not active:
        return
    if all(s == "closed" for s in active):
        new = "closed"
    elif all(s in RESOLVED for s in active):
        new = "resolved_pending_verification"
    else:
        new = next(s for s in INCIDENT_OPEN_ORDER if s in active)
    newly_resolved = new in RESOLVED and inc.status not in RESOLVED
    inc.status = new
    if newly_resolved:
        for m in members:
            if m.status == "merged":
                notify(db, m.citizen_id, m.id, "community_update", "The issue you reported is fixed",
                       f"The issue linked to incident {inc.id} was marked resolved.", m.language)


# ---------- status ----------
def change_status(db: Session, g: Grievance, new: str, actor, note: str | None = None, delay_reason: dict | None = None):
    if new not in TRANSITIONS.get(g.status, set()) and new != g.status:
        raise err(409, "invalid_transition", f"Cannot move from {g.status} to {new}.")
    old = g.status
    g.status = new
    now = clock.now()
    if new == "in_progress" and not g.first_response_at:
        g.first_response_at = now
    if delay_reason:
        from ..ai.localize import localize
        txt = delay_reason.get("text") or delay_reason.get("reason", "")
        g.delay_reason = localize(f"Delay: {delay_reason.get('reason', 'other')}. {txt}".strip(), g.language)
    if new == "closed":
        g.closed_at = now
    audit.add_event(db, g.id, "status_changed", f"Status {old} → {new}" + (f": {note}" if note else ""),
                    actor_role=actor.role if actor else "system", actor_id=actor.id if actor else None,
                    actor_name=actor.name if actor else None, payload={"from": old, "to": new})
    if g.citizen_id:
        notify(db, g.citizen_id, g.id, "status", "Status updated", f"Your complaint {g.id} is now: {new.replace('_', ' ')}.", g.language)
    live(db, f"dept:{g.category}", "grievance_updated", g.id)
    sync_incident(db, g.incident_id)


# ---------- resolution verification ----------
def _proof_media(db: Session, g: Grievance, media_ids: list[str]) -> list[Media]:
    """Proofs must be resolution_proof uploads; citizen evidence can never be relabelled as proof. One proof can be
    reused across an incident's members (the gov portal does this): a photo already attached to another grievance is
    copied, sharing the stored file, so every grievance keeps its own proof."""
    out = []
    for mid in media_ids:
        m = db.get(Media, mid)
        if not m:
            continue
        if m.purpose != "resolution_proof":
            raise err(422, "bad_proof", "Proof photos must be uploaded with purpose resolution_proof.")
        if m.grievance_id not in (None, g.id):
            m = Media(grievance_id=g.id, storage_path=m.storage_path, uploaded_by_role=m.uploaded_by_role,
                      uploaded_by=m.uploaded_by, purpose="resolution_proof", quality=m.quality, ai=m.ai, geo=m.geo,
                      phash=m.phash)
            db.add(m)
            db.flush()
        out.append(m)
    return out


def resolve(db: Session, g: Grievance, actor, media_ids: list[str], note: str, lat=None, lng=None) -> dict:
    if g.status not in ("in_progress", "assigned", "reopened"):
        raise err(409, "invalid_transition", f"Cannot resolve a grievance in status {g.status}.")
    proofs = _proof_media(db, g, media_ids)
    if not proofs:
        raise err(422, "proof_required", "At least one resolution proof photo is required.")
    citizen_photos = [m for m in g.media if m.purpose == "evidence"]
    v = verify_resolution(g, proofs, citizen_photos, lat, lng)
    for m in proofs:
        m.grievance_id = g.id
    if g.status == "assigned":
        g.first_response_at = g.first_response_at or clock.now()
    g.ai_verification = v
    g.resolved_at = clock.now()
    old = g.status
    g.status = "resolved_pending_verification"
    audit.add_event(db, g.id, "resolution_submitted", f"Resolution submitted: {note}", actor_role=actor.role,
                    actor_id=actor.id, actor_name=actor.name, payload={"from": old, "media_ids": [m.id for m in proofs]})
    audit.add_event(db, g.id, "ai_verification", f"AI verification: {v['verdict']} ({v['assessment']})", actor_role="ai",
                    payload=v)
    if g.citizen_id:
        notify(db, g.citizen_id, g.id, "verification_request", "Please confirm the fix",
               f"The officer marked {g.id} as resolved. Please confirm or reopen.", g.language)
    if v["verdict"] == "suspicious":
        if alert(db, "suspicious_closure", "warning", f"Suspicious resolution on {g.id}",
                 "; ".join(v["reasons_en"]), [g.id], f"susp:{g.id}:{g.reopen_count}", g.ward_id, g.category):
            _notify_role(db, "supervisor", g, "Suspicious resolution",
                         f"{g.id}: {(v['reasons_en'] or ['the AI check flagged the proof photo'])[0]}", "alert")
    live(db, f"dept:{g.category}", "grievance_updated", g.id)
    sync_incident(db, g.incident_id)
    return v


def _phash(m: Media):
    """Hash saved at upload; only photos without one are fetched."""
    try:
        import imagehash
        from PIL import Image
        if m.phash:
            return imagehash.hex_to_hash(m.phash)
        with Image.open(io.BytesIO(storage.read(m.storage_path))) as im:
            return imagehash.phash(im)
    except Exception:
        return None


def verify_resolution(g: Grievance, proofs: list[Media], citizen_photos: list[Media], lat, lng) -> dict:
    """Rule checks first (distance, perceptual-hash re-use), then the vision model if available.
    assessment: verified | likely_resolved | needs_human_review | rejected_evidence. AI never 'proves' a fix."""
    reasons, dup, dist = [], False, None
    p_geo = next(((m.geo or {}) for m in proofs if m.geo), {})
    plat, plng = (lat, lng) if lat is not None else (p_geo.get("lat"), p_geo.get("lng"))
    if plat is not None and g.lat is not None:
        dist = round(haversine_m(plat, plng, g.lat, g.lng))
    ph_c = [h for h in (_phash(c) for c in citizen_photos) if h is not None]
    for p in proofs:
        hp = _phash(p)
        if hp is not None and any(hp - hc < 8 for hc in ph_c):
            dup = True
    if dup:
        reasons.append("Proof photo is visually identical to the citizen's original photo (perceptual hash distance < 8).")
    if dist is not None and dist > 500:
        reasons.append(f"Proof photo location is {dist} m from the complaint location (> 500 m).")
    vision = None
    if not dup and (dist is None or dist <= 500):
        from ..ai import gateway, prompts
        imgs = []
        for m in citizen_photos[:2] + proofs[:1]:
            data = storage.read(m.storage_path)
            if data:
                imgs.append((data, "image/webp"))
        if len(imgs) >= 2:
            vision, _ = gateway.run("verify_resolution", prompts.VERIFY.format(summary=g.summary_en), images=imgs, cache=True)
    if dup or (dist is not None and dist > 500):
        verdict, conf, assessment = "suspicious", 0.9, "rejected_evidence"
    elif vision and vision.get("verdict") in ("verified", "suspicious", "unclear"):
        verdict, conf = vision["verdict"], float(vision.get("confidence", 0.5))
        reasons += vision.get("reasons_en", [])
        assessment = ("likely_resolved" if verdict == "verified" and conf >= 0.7 else
                      "rejected_evidence" if verdict == "suspicious" else "needs_human_review")
    else:
        verdict, conf, assessment = "unclear", 0.0, "needs_human_review"
        reasons.append("No automatic visual comparison available (vision model unavailable or no citizen photo); "
                       "citizen confirmation required.")
    return {"verdict": verdict, "confidence": round(conf, 2), "reasons_en": reasons, "assessment": assessment,
            "checks": {"same_location": (dist <= 500) if dist is not None else (vision or {}).get("same_location"),
                       "issue_resolved_visible": (vision or {}).get("issue_resolved_visible"),
                       "duplicate_photo": dup, "distance_m": dist},
            "created_at": clock.iso(clock.now())}


def citizen_feedback(db: Session, g: Grievance, actor, accepted: bool, rating=None, comment=None):
    if g.status != "resolved_pending_verification":
        raise err(409, "invalid_transition", "Feedback is only possible after the officer submits a resolution.")
    if accepted:
        g.status, g.closure_type, g.closed_at = "closed", "citizen_verified", clock.now()
        g.rating, g.feedback_comment = rating, comment
        if g.ai_verification:
            g.ai_verification = {**g.ai_verification, "assessment": "verified"}
        audit.add_event(db, g.id, "citizen_verified", f"Citizen confirmed the fix (rating {rating})", actor_role=actor.role, actor_id=actor.id)
        audit.add_event(db, g.id, "closed", "Closed — citizen verified", actor_role="system")
    else:
        reopen(db, g, actor, comment or "Citizen says the issue is not fixed")
    live(db, f"dept:{g.category}", "grievance_updated", g.id)
    sync_incident(db, g.incident_id)


DISPUTE_ACTIONS = ("demand_new_proof", "close_disputed")


def is_disputed(g: Grievance) -> bool:
    """Same rule as review-queue?kind=disputed, limited to resolutions still waiting for a decision."""
    flagged = g.status == "reopened" or g.reopen_count > 0 or (g.ai_verification or {}).get("verdict") == "suspicious"
    return flagged and g.status in ("resolved_pending_verification", "reopened")


def decide_dispute(db: Session, g: Grievance, actor, action: str, note: str):
    """Supervisor decision on a disputed resolution (Spec C §5.3; master rule 10: humans decide disputed closures).
    demand_new_proof: back to in_progress, the officer must resolve again with new proof.
    close_disputed: closed with closure_type 'disputed'."""
    old, now = g.status, clock.now()
    if action == "demand_new_proof":
        g.status, g.resolved_at = "in_progress", None
        audit.add_event(db, g.id, "status_changed", f"Supervisor asked for new resolution proof: {note}", actor_role=actor.role,
                        actor_id=actor.id, actor_name=actor.name, payload={"from": old, "to": "in_progress", "dispute": action})
        officer = db.get(Profile, g.assigned_officer_id) if g.assigned_officer_id else None
        if officer:
            notify(db, officer.id, g.id, "alert", "New resolution proof required", f"{g.id}: {note}", officer.preferred_language)
        notify(db, g.citizen_id, g.id, "status", "Status updated",
               f"A supervisor reviewed {g.id} and asked the officer for new proof of the fix.", g.language)
    else:
        g.status, g.closure_type, g.closed_at = "closed", "disputed", now
        audit.add_event(db, g.id, "closed", f"Closed as disputed after supervisor review: {note}", actor_role=actor.role,
                        actor_id=actor.id, actor_name=actor.name, payload={"from": old, "closure_type": "disputed", "dispute": action})
        notify(db, g.citizen_id, g.id, "status", "Status updated",
               f"A supervisor reviewed the dispute on {g.id} and closed it.", g.language)
    live(db, f"dept:{g.category}", "grievance_updated", g.id)
    sync_incident(db, g.incident_id)


def reopen(db: Session, g: Grievance, actor, reason: str):
    if g.status not in ("resolved_pending_verification", "closed"):
        raise err(409, "invalid_transition", f"Cannot reopen from {g.status}.")
    g.status, g.closure_type, g.closed_at, g.resolved_at = "reopened", None, None, None
    g.reopen_count += 1
    g.escalation_level = min(3, g.escalation_level + 1)
    audit.add_event(db, g.id, "citizen_rejected", f"Citizen rejected the resolution: {reason}", actor_role=actor.role, actor_id=actor.id)
    audit.add_event(db, g.id, "reopened", f"Reopened (count {g.reopen_count}); escalation level {g.escalation_level}", actor_role="system")
    if g.reopen_count >= 2:
        alert(db, "repeated_reopen", "warning", f"{g.id} reopened {g.reopen_count} times",
              f"Citizen rejected the resolution {g.reopen_count} times; supervisor review needed.", [g.id],
              f"reopen:{g.id}:{g.reopen_count}", g.ward_id, g.category)
    sync_incident(db, g.incident_id)


# ---------- scheduler: escalation / auto-close ----------
def run_escalations(db: Session) -> dict:
    now = clock.now()
    stats = {"escalated_l1": 0, "escalated_l2": 0, "auto_closed": 0, "alerts": 0}
    for g in db.execute(select(Grievance).where(Grievance.status.in_(OPEN))).scalars():
        over_h = (now - g.sla_due_at).total_seconds() / 3600
        if over_h > 0 and g.escalation_level < 1:
            g.escalation_level = 1
            stats["escalated_l1"] += 1
            audit.add_event(db, g.id, "escalated", "SLA breached — escalated to supervisor (level 1)", actor_role="system",
                            payload={"level": 1, "overdue_hours": round(over_h, 1)})
            _notify_role(db, "supervisor", g, "SLA breached", f"{g.id} breached its SLA.")
        level2 = (over_h >= 0.5 * g.sla_hours) or (g.priority == "critical" and over_h >= 2)
        if level2 and g.escalation_level < 2:
            g.escalation_level = 2
            stats["escalated_l2"] += 1
            audit.add_event(db, g.id, "escalated", "Escalated to administrator (level 2)", actor_role="system",
                            payload={"level": 2, "overdue_hours": round(over_h, 1)})
            _notify_role(db, "admin", g, "Escalated to admin", f"{g.id} is {round(over_h)} h overdue.")
        # independent of the level change: a case can already be at level 2 (e.g. after reopens) before it is overdue
        if g.priority == "critical" and over_h >= 2 and alert(
                db, "overdue_critical", "critical", f"Critical {g.id} overdue", f"{round(over_h, 1)} h past SLA.",
                [g.id], f"crit:{g.id}", g.ward_id, g.category):
            stats["alerts"] += 1
        if g.is_emergency and g.emergency_confirmed is None and (now - g.created_at) > timedelta(minutes=30):
            alert(db, "emergency_unconfirmed", "critical", f"Emergency {g.id} unconfirmed",
                  "Flagged by safety rules more than 30 minutes ago and not yet confirmed by a supervisor.",
                  [g.id], f"emunc:{g.id}", g.ward_id, g.category)
    cutoff = now - timedelta(days=7)
    for g in db.execute(select(Grievance).where(Grievance.status == "resolved_pending_verification",
                                                Grievance.resolved_at < cutoff)).scalars():
        g.status, g.closure_type, g.closed_at = "closed", "auto_closed_unverified", now
        audit.add_event(db, g.id, "closed", "Auto-closed: no citizen response in 7 days", actor_role="system")
        stats["auto_closed"] += 1
        sync_incident(db, g.incident_id)
    from .analytics import scan_spikes
    stats["alerts"] += scan_spikes(db)
    return stats


def _notify_role(db: Session, role: str, g: Grievance, title: str, body: str, type_: str = "escalation"):
    q = select(Profile).where(Profile.role == role, Profile.is_active.is_(True))
    if role == "supervisor":   # department supervisors + city-wide supervisors (no department)
        q = q.where((Profile.department_id == g.category) | (Profile.department_id.is_(None)))
    for p in db.execute(q).scalars():
        notify(db, p.id, g.id, type_, title, body, p.preferred_language)
    live(db, "role:admin", "alert", g.id)


def open_count(db: Session, officer_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Grievance).where(Grievance.assigned_officer_id == officer_id,
                                                                       Grievance.status.in_(OPEN))) or 0
