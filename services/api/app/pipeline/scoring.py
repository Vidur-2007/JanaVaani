"""Routing vote, explainable priority, SLA/ETA/delay risk (master §7, Spec B §6)."""
import math
from datetime import datetime, timedelta

from ..core import clock
from ..refdata import department, sla_config

URGENCY_BASE = {"critical": 70, "high": 50, "medium": 30, "low": 15}
HAZARD_LABEL = {"live_wire": "Live wire", "fire": "Fire", "gas_leak": "Gas leak", "collapse_risk": "Collapse risk",
                "flooding": "Flooding", "open_manhole": "Open manhole", "contaminated_water": "Contaminated water",
                "sewage_overflow": "Sewage overflow", "traffic_danger": "Traffic danger", "disease_risk": "Disease risk",
                "near_school": "Near a school", "near_hospital": "Near a hospital"}


# ---------- routing vote ----------
RULE_CONFIDENCE = 0.9


def route(classifier: dict, gemini: str | None, groq: str | None, key_phrases: list[str] | None = None,
          rule_department: str | None = None) -> dict:
    votes = [{"source": "classifier", "department": classifier["department"], "confidence": round(classifier["confidence"], 3)}]
    if gemini:
        votes.append({"source": "gemini", "department": gemini})
    if groq:
        votes.append({"source": "groq", "department": groq})
    if rule_department:
        votes.append({"source": "rule", "department": rule_department})
    labels = [v["department"] for v in votes]
    counts = {l: labels.count(l) for l in labels}
    top = max(counts.values())
    if top >= 2:
        label = max(counts, key=counts.get)
    elif rule_department:
        label = rule_department
    elif classifier["confidence"] >= 0.6 or not gemini:
        label = classifier["department"]
    else:
        label = gemini
    p = classifier.get("proba", {}).get(label, 0.0)
    if label == rule_department:     # a safety keyword settles it; a model that lacks the phrase must not drag confidence down
        p = max(p, RULE_CONFIDENCE)
    llm_votes = [v for v in votes if v["source"] in ("gemini", "groq")]
    if llm_votes:
        conf = 0.5 * p + 0.25 * (gemini == label) + 0.25 * (groq == label)
        if not gemini or not groq:   # one LLM missing: renormalise over available signals
            conf = (0.5 * p + 0.25 * ((gemini or groq) == label)) / 0.75
    else:                            # classifier only (both providers down)
        conf = p
    conf = round(min(1.0, conf), 3)
    if label == "other" or conf < 0.5:
        method, needs_review = "auto_flagged", True
    elif conf < 0.75:
        method, needs_review = "auto_flagged", False
    else:
        method, needs_review = "auto", False
    name = department(label)["name"]["en"]
    agree = [v["source"] for v in votes if v["department"] == label]
    who = {1: "only {}".format(agree[0] if agree else "classifier"), 2: " and ".join(agree) + " agree",
           3: "our model, Gemini and Groq all agree"}.get(len(agree), ", ".join(agree))
    if "rule" in agree:
        who = "safety keyword rule" + (", " + " and ".join(a for a in agree if a != "rule") + " agree" if len(agree) > 1 else "")
    expl = f"Routed to {name}: {who} (model p={p:.2f}, confidence {conf:.2f})"
    if key_phrases:
        expl += "; key phrases: " + ", ".join(f"'{k}'" for k in key_phrases[:3])
    if needs_review:
        expl += ". Low confidence — sent to human review before final routing."
    return {"department": label, "confidence": conf, "votes": votes, "explanation_en": expl,
            "needs_review": needs_review, "method": method}


# ---------- priority ----------
def priority(urgency: str, hazards: list[str], emergency_rule_hit: bool, distress: float,
             vulnerable: list[str], supporters: int) -> dict:
    f = [{"key": "urgency", "label_en": f"Reported urgency: {urgency}", "points": URGENCY_BASE.get(urgency, 30)}]
    hz = min(20, 10 * len(hazards))
    if hz:
        f.append({"key": "hazards", "label_en": "Hazards: " + ", ".join(HAZARD_LABEL.get(h, h) for h in hazards), "points": hz})
    d = int(round(max(0.0, min(1.0, distress)) * 10))
    if d:
        f.append({"key": "distress", "label_en": "Citizen distress", "points": d})
    if vulnerable:
        f.append({"key": "vulnerable", "label_en": "Vulnerable people affected: " + ", ".join(vulnerable), "points": 8})
    community = min(15, round(5 * math.log2(1 + max(0, supporters - 1)))) if supporters > 1 else 0
    if community:
        f.append({"key": "community", "label_en": f"{supporters} citizens reported this", "points": community})
    score = sum(x["points"] for x in f)
    if emergency_rule_hit and score < 80:
        f.append({"key": "emergency_rule", "label_en": "Emergency safety rule (floor 80)", "points": 80 - score})
        score = 80
    score = int(min(100, score))
    level = "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low"
    return {"score": score, "level": level, "factors": f, "sla_hours": sla_hours(level, False)}


def sla_hours(level: str, emergency_confirmed: bool) -> int:
    cfg = sla_config()
    if emergency_confirmed:
        return int(cfg["emergency_confirmed_hours"])
    return int(cfg["levels"][level]["sla_hours"])


def sla_view(g, officer_overdue: int = 0) -> dict:
    now = clock.now()
    due = g.sla_due_at
    closed = g.status in ("closed", "rejected", "merged") or g.resolved_at is not None
    end = g.resolved_at or now
    breached = end > due
    remaining = int((due - now).total_seconds() // 60) if not closed else 0
    elapsed = (end - g.created_at).total_seconds() / 3600
    ratio = elapsed / max(1, g.sla_hours)
    risk = "high" if (ratio > 0.8 or officer_overdue >= 3) and not closed else "medium" if ratio > 0.5 and not closed else "low"
    from ..core.clock import iso
    out = {"hours": g.sla_hours, "due_at": iso(due), "breached": bool(breached), "remaining_minutes": remaining,
           "delay_risk": risk}
    if g.eta_at:
        out["eta_at"] = iso(g.eta_at)
    if g.delay_reason:
        out["delay_reason"] = g.delay_reason
    return out


def eta(db, category: str, ward_id: str | None, created_at: datetime) -> datetime | None:
    """Historical estimate: median resolution hours for (category, ward) with >=5 samples, else category."""
    from statistics import median

    from sqlalchemy import select

    from ..models import Grievance
    rows = db.execute(select(Grievance.ward_id, Grievance.created_at, Grievance.resolved_at)
                      .where(Grievance.category == category, Grievance.resolved_at.is_not(None))).all()
    ward_h = [(r.resolved_at - r.created_at).total_seconds() / 3600 for r in rows if r.ward_id == ward_id]
    all_h = [(r.resolved_at - r.created_at).total_seconds() / 3600 for r in rows]
    hs = ward_h if len(ward_h) >= 5 else all_h if len(all_h) >= 5 else None
    return created_at + timedelta(hours=median(hs)) if hs else None
