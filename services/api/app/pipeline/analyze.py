"""Core multilingual analysis: LLM (Gemini→Groq) with a deterministic fallback that never fails.

Original text is preserved by the caller; this module receives the PII-masked text only.
Output follows Spec B §5.1 `Analysis` plus an `analysis_source` field."""
import concurrent.futures as cf
import re
import time
import uuid

from pydantic import BaseModel, Field

from ..ai import gateway, prompts
from ..ai.localize import localize
from ..ml import classifier, embeddings
from ..refdata import DEPARTMENT_IDS, department, ward_by_mention, ward_for_point
from . import safety, scoring

URGENCY = ["critical", "high", "medium", "low"]
DISTRESS_WORDS = ["please help", "urgent", "immediately", "dying", "scared", "fed up", "nobody is responding", "sick",
                  "దయచేసి", "వెంటనే", "कृपया", "तुरंत", "براہ کرم", "فوری", "help karo", "chala ibbandi"]
VULNERABLE_WORDS = {"children": ["child", "children", "kids", "school", "పిల్ల", "बच्च", "بچ", "pillalu", "bachon"],
                    "elderly": ["old age", "elderly", "senior citizen", "వృద్ధ", "बुज़ुर्ग", "بزرگ"],
                    "pregnant": ["pregnant", "గర్భిణ", "गर्भवती", "حاملہ"]}


class Issue(BaseModel):
    summary_en: str = ""
    category: str = "other"


class Analysis(BaseModel):
    language: str = "en"
    script: str = "native"
    is_code_mixed: bool = False
    cleaned_original: str = ""
    text_en: str = ""
    title: dict = Field(default_factory=dict)
    summary_en: str = ""
    formal_text: dict = Field(default_factory=dict)
    issues: list[Issue] = Field(default_factory=list)
    category: str = "other"
    sub_department: str = ""
    secondary_categories: list[str] = Field(default_factory=list)
    category_evidence: list[str] = Field(default_factory=list)
    location_mentions: list[str] = Field(default_factory=list)
    fields: dict = Field(default_factory=dict)
    urgency: str = "medium"
    hazards: list[str] = Field(default_factory=list)
    vulnerable: list[str] = Field(default_factory=list)
    sentiment: str = "concerned"
    distress_score: float = 0.0
    is_emergency: bool = False
    spam_likelihood: float = 0.0


class SecondOpinion(BaseModel):
    department: str = "other"
    sub_department: str = ""
    confidence: float = 0.0


def _clean_cat(c):
    return c if c in DEPARTMENT_IDS else "other"


def fallback_analysis(masked: str, lid: dict, cls: dict, emergency: dict) -> dict:
    """Deterministic analysis used when both LLM providers are unavailable."""
    t = masked.lower()
    cat = cls["department"]
    hazards = list(emergency["hazards"])
    urgency = "critical" if emergency["is_emergency"] else "high" if hazards else "medium"
    vulnerable = [k for k, ws in VULNERABLE_WORDS.items() if any(w in t for w in ws)]
    if "children" in vulnerable and "school" in t and "near_school" not in hazards:
        hazards.append("near_school")
    distress = min(1.0, 0.25 * sum(w in t for w in DISTRESS_WORDS))
    words = masked.split()
    title = " ".join(words[:8]) + ("…" if len(words) > 8 else "")
    dep_en = department(cat)["name"]["en"]
    w = ward_by_mention(masked)
    is_en = lid["language"] == "en"
    return {
        "language": lid["language"], "script": lid["script"], "is_code_mixed": lid["is_code_mixed"],
        "cleaned_original": masked, "text_en": masked if is_en else "",
        "title": {"original": title, "en": title if is_en else f"{dep_en} complaint"},
        "summary_en": (masked[:240] if is_en else f"{dep_en} complaint in {lid['language']} (translation unavailable — AI providers offline)"),
        "formal_text": {"original": masked, "en": masked if is_en else ""},
        "issues": [{"summary_en": dep_en, "category": cat}], "category": cat, "sub_department": "",
        "secondary_categories": [], "category_evidence": [], "location_mentions": [w["name"]] if w else [],
        "fields": {}, "urgency": urgency, "hazards": sorted(set(hazards)), "vulnerable": vulnerable,
        "sentiment": "distressed" if distress >= 0.5 else "concerned", "distress_score": round(distress, 2),
        "is_emergency": emergency["is_emergency"], "spam_likelihood": safety.spam_score(masked)[0],
    }


def analyze(original_text: str, location: dict | None = None, images=None) -> dict:
    """Full per-complaint analysis. Returns a dict with analysis, routing, priority, geo, embedding."""
    t0 = time.perf_counter()
    text = safety.normalize(original_text)
    masked = safety.mask_pii(text)
    lid = safety.identify_language(masked)
    emergency = safety.detect_emergency(masked)

    with cf.ThreadPoolExecutor(max_workers=3) as ex:            # parallel: classifier, LLM analysis
        f_cls = ex.submit(classifier.predict, masked)
        f_llm = ex.submit(gateway.run, "analyze_complaint", prompts.ANALYZE.replace("{text}", masked), Analysis, images)
        cls = f_cls.result()
        llm, llm_meta = f_llm.result()

    if llm:
        a = llm
        a["category"] = _clean_cat(a.get("category"))
        a["urgency"] = a.get("urgency") if a.get("urgency") in URGENCY else "medium"
        a["analysis_source"] = llm_meta["provider"]
        # Deterministic safety rules can only ADD hazards / emergency; the LLM can never suppress them.
        a["hazards"] = sorted(set(a.get("hazards", [])) | set(emergency["hazards"]))
        a["is_emergency"] = bool(a.get("is_emergency")) or emergency["is_emergency"]
        # keep rule-based script detection when it found native script (more reliable than the LLM)
        if lid["method"] == "script":
            a["language"], a["script"], a["is_code_mixed"] = lid["language"], lid["script"], lid["is_code_mixed"]
    else:
        a = fallback_analysis(masked, lid, cls, emergency)
        a["analysis_source"] = "rules"

    # second opinion (Groq) on the English summary, only if it exists
    second = None
    if a.get("summary_en") and llm:
        so, _ = gateway.run("route_second_opinion", prompts.SECOND_OPINION.replace("{text}", a["summary_en"]), SecondOpinion)
        second = _clean_cat(so["department"]) if so else None
    gemini_vote = a["category"] if a.get("analysis_source") == "gemini" else None
    groq_vote = second if second else (a["category"] if a.get("analysis_source") == "groq" else None)
    routing = scoring.route(cls, gemini_vote, groq_vote, a.get("category_evidence"))
    routing["sub_department"] = a.get("sub_department") or None
    routing["secondary_departments"] = [c for c in a.get("secondary_categories", []) if c in DEPARTMENT_IDS and c != routing["department"]]

    prio = scoring.priority(a["urgency"], a["hazards"], emergency["is_emergency"], a.get("distress_score", 0),
                            a.get("vulnerable", []), 1)
    geo = resolve_location(location, a.get("location_mentions", []), masked)
    emb_text = a.get("text_en") or a.get("cleaned_original") or masked
    return {
        "text": text, "masked": masked, "analysis": a, "classifier": cls, "routing": routing, "priority": prio,
        "emergency": emergency, "location": geo, "embedding": embeddings.embed(emb_text),
        "embedding_kind": embeddings.mode(), "llm_meta": llm_meta,
        "pipeline_ms": int((time.perf_counter() - t0) * 1000),
    }


def split_issue(res: dict, issue: dict) -> dict:
    """One analysis result per issue of a multi-issue complaint (Spec B §6 step 8). Hazards and priority stay shared."""
    a = res["analysis"]
    summary = issue.get("summary_en") or a.get("summary_en", "")
    cat = _clean_cat(issue.get("category"))
    original = localize(summary, a["language"])["original"]
    src = a.get("analysis_source")
    routing = scoring.route(classifier.predict(summary), cat if src == "gemini" else None, cat if src == "groq" else None)
    if routing["department"] != cat:   # the LLM separated the issues; a disagreeing classifier goes to a human
        routing.update(department=cat, method="auto_flagged", needs_review=True,
                       explanation_en=f"Split from a multi-issue complaint and routed to {department(cat)['name']['en']} as identified "
                                      f"by the AI; our model suggested {routing['department']}, so a human reviews it.")
    routing.update(sub_department=None, secondary_departments=[])
    return {**res, "routing": routing, "embedding": embeddings.embed(summary),
            "analysis": {**a, "category": cat, "summary_en": summary, "text_en": summary, "issues": [issue], "secondary_categories": [],
                         "sub_department": "", "title": {"original": original, "en": summary},
                         "formal_text": {"original": original, "en": summary}}}


def resolve_location(loc: dict | None, mentions: list[str], text: str) -> dict | None:
    """GPS/pin -> ward (nearest-centroid Voronoi). Text mention -> ward centroid (source 'text').
    Never fabricates coordinates: no evidence -> None."""
    if loc and loc.get("lat") is not None and loc.get("lng") is not None:
        w = ward_for_point(loc["lat"], loc["lng"])
        out = {**loc, "source": loc.get("source", "gps")}
        if w:
            out.update(ward_id=w["id"], ward_name=w["name"], zone=w["zone"])
        return out
    for m in mentions + [text]:
        w = ward_by_mention(m or "")
        if w:
            return {"lat": w["lat"], "lng": w["lng"], "ward_id": w["id"], "ward_name": w["name"], "zone": w["zone"],
                    "source": "text", "address": m if m != text else w["name"], "accuracy_m": 1500}
    return None


def to_draft(res: dict, media_ids: list[str] | None = None, officer: dict | None = None) -> dict:
    a, r, p = res["analysis"], res["routing"], res["priority"]
    lang = a["language"]
    req = [f["key"] for f in department(r["department"])["required_fields"]]
    missing = [k for k in req if k not in (a.get("fields") or {}) and not (k in ("location_detail", "address") and res["location"])]
    rp = {**r}
    if officer:
        rp.update(officer_name=officer.get("name"), office_name=officer.get("office_name"))
    return {
        "draft_id": str(uuid.uuid4()),
        "title": {"original": a["title"].get("original", ""), "en": a["title"].get("en", ""), "lang": lang},
        "formal_text": {"original": a["formal_text"].get("original", ""), "en": a["formal_text"].get("en", ""), "lang": lang},
        "summary_en": a.get("summary_en", ""), "cleaned_original": a.get("cleaned_original", ""),
        "category": r["department"], "sub_department": r.get("sub_department"), "urgency": p["level"],
        "hazards": a.get("hazards", []), "location": res["location"], "media_ids": media_ids or [],
        "fields": a.get("fields") or {}, "missing_fields": missing,
        "routing_preview": rp,
        "priority_preview": {"score": p["score"], "level": p["level"], "factors": p["factors"], "sla_hours": p["sla_hours"]},
    }


_LOC_RX = re.compile(r"(near|opposite|beside|behind|daggara|ke paas|పక్కన|దగ్గర|के पास)\s+[\w\s]{2,30}", re.I)
