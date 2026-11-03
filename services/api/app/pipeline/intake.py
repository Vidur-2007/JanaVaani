"""Conversational intake (Spec B §5.2): per citizen message, decide the intent, merge the department's required fields
and ask the next question. The LLM (`intake_turn`) writes the turn; the rules below are enforced on its answer and
also run alone, deterministically, when both providers are down.

Rules: one question at a time in the citizen's language; never ask for what is already given (location counts as given
when GPS/pin was sent or the text names a known place); a photo is asked for once if none was attached (roads,
sanitation, drainage, streetlights); at most 4 follow-up questions, then ready_to_confirm with what is known."""
import json
import re

from pydantic import BaseModel, Field

from ..ai import gateway, prompts
from ..ai.localize import localize
from ..refdata import department, departments
from . import safety

MAX_QUESTIONS = 4
PHOTO_DEPARTMENTS = {"roads", "sanitation", "drainage", "streetlights"}
LOCATION_KEYS = ("location_detail", "address")
YES_NO = {"blocking_traffic", "bin_overflow", "sparking_or_danger", "entering_homes"}
INTENTS = ("new_complaint", "track_status", "ask_info", "smalltalk")
PHOTO_QUESTION = "Could you add a photo of the problem? It helps the officer. You can also skip."
GREETING_REPLY = "Please tell me about the problem you are facing."

DONE = re.compile(r"\b(that'?s all|that is all|nothing else|submit|bas|itna hi|anthe|inthe|ainthe|chalu)\b", re.I)
TRACK = re.compile(r"\b(status|track|where is my complaint|naa complaint|meri shikayat|my complaint)\b", re.I)
ASK = re.compile(r"^\s*(how|what|when|which|who|can i|do i|is there|where can|kaise|kya|kab|ela|enti|eppudu)\b.*\?\s*$", re.I)
GREETING = re.compile(r"^\s*(hi+|hello|hey|namaste|namaskaram|salaam|thanks?|thank you|ok|okay)\W*$", re.I)
DURATION = re.compile(
    r"\b(?:for|since)\s+(?:\d+|a|an|one|two|three|four|five|six|seven|few|several)\s+(?:hours?|days?|weeks?|months?)\b"
    r"|\b\d+\s*(?:hours?|days?|weeks?|months?|rojulu|rojula|dinon|din|roju)\b"
    r"|\d+\s*(?:రోజులు|రోజుల|రోజు|వారాలు|నెలలు|दिन|दिनों|हफ्ते|महीने|دن|ہفتے|مہینے)", re.I)


class IntakeTurn(BaseModel):
    intent: str = "new_complaint"
    language: str = "en"
    is_code_mixed: bool = False
    reply: dict = Field(default_factory=dict)
    updated_fields: dict = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    ready_to_confirm: bool = False
    quick_replies: list[dict] = Field(default_factory=list)
    track_query: str | None = None
    asking: str | None = None          # internal: the field key (or "photo") the reply asks about
    is_emergency: bool = False         # internal: danger to life the keyword rules may have missed
    hazards: list[str] = Field(default_factory=list)


def required(dep: str) -> list[dict]:
    return department(dep)["required_fields"]


def missing(dep: str, fields: dict, has_location: bool) -> list[str]:
    return [f["key"] for f in required(dep) if f["key"] not in fields and not (f["key"] in LOCATION_KEYS and has_location)]


def _queue(dep: str, fields: dict, has_location: bool, has_photo: bool, asked: list[str]) -> list[str]:
    """What is still worth asking, in order: the location first, then the photo (asked once), then the other fields."""
    todo = [k for k in missing(dep, fields, has_location) if k not in asked]
    if dep in PHOTO_DEPARTMENTS and not has_photo and "photo" not in asked:
        todo.insert(1 if todo and todo[0] in LOCATION_KEYS else 0, "photo")
    return todo


def question(key: str, dep: str, lang: str) -> dict:
    if key == "photo":
        return localize(PHOTO_QUESTION, lang, use_llm=False)
    q = next((f["question"] for d in [department(dep)] + departments() for f in d["required_fields"] if f["key"] == key),
             {"en": GREETING_REPLY})
    return {"original": q.get(lang) or q["en"], "en": q["en"], "lang": lang if q.get(lang) else "en"}


def quick_replies(key: str | None) -> list[dict]:
    if key in LOCATION_KEYS:
        return [{"label": "Share my location", "value": "share_location"}]
    if key == "photo":
        return [{"label": "Skip", "value": "skip"}]
    if key in YES_NO:
        return [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]
    return []


def _rules_intent(text: str, has_complaint: bool) -> str:
    if TRACK.search(text):
        return "track_status"
    if not has_complaint and ASK.search(text):
        return "ask_info"
    if not has_complaint and GREETING.search(text):
        return "smalltalk"
    return "new_complaint"


def _llm_turn(st: dict, text: str, dep: str, has_location: bool, has_photo: bool, lang: str) -> dict | None:
    state = {"language": lang, "collected_fields": st.get("fields", {}), "questions_asked": len(st.get("asked", [])),
             "already_asked": st.get("asked", []), "location_given": has_location, "photo_attached": has_photo,
             "complaint_so_far": safety.mask_pii(" ".join(st.get("texts", [])))[:1500],
             "last_messages": st.get("history", [])[-8:]}
    fields = [{"key": f["key"], "label_en": f["label_en"], "question_en": f["question"]["en"]} for f in required(dep)]
    prompt = prompts.INTAKE.format(state=json.dumps(state, ensure_ascii=False), department=dep,
                                   fields=json.dumps(fields, ensure_ascii=False), photo_department=dep in PHOTO_DEPARTMENTS,
                                   max_questions=MAX_QUESTIONS, text=safety.mask_pii(text))
    r, _ = gateway.run("intake_turn", prompt, IntakeTurn)
    return r


def run(st: dict, text: str | None, *, dep: str, has_location: bool, has_photo: bool, lang: str) -> dict:
    """One intake turn. Updates st["fields"], st["asked"], st["pending"] and returns an IntakeTurn dict whose `reply`
    is Localized. `text` is None when the citizen only sent a location or a photo, or continued after an emergency."""
    fields, asked = dict(st.get("fields", {})), list(st.get("asked", []))
    has_complaint = bool(st.get("texts"))
    llm = _llm_turn(st, text, dep, has_location, has_photo, lang) if text else None
    intent = (llm or {}).get("intent") if (llm or {}).get("intent") in INTENTS else None
    intent = intent or (_rules_intent(text, has_complaint) if text else "new_complaint")
    if intent == "smalltalk" and has_complaint:        # mid-complaint chatter is still the complaint conversation
        intent = "new_complaint"
    if intent != "new_complaint":
        reply = (llm or {}).get("reply") or {}
        return {"intent": intent, "reply": _localized(reply, lang) if reply.get("en") else localize(GREETING_REPLY, lang, use_llm=False),
                "track_query": (llm or {}).get("track_query") or text, "missing_fields": [], "quick_replies": [],
                "ready_to_confirm": False}

    # merge what this message gave: the LLM's extraction, else the answer to the question asked last turn
    if text and st.get("pending") and st["pending"] != "photo":
        fields.setdefault(st["pending"], text.strip())
    valid = {f["key"] for f in required(dep)}
    for k, v in ((llm or {}).get("updated_fields") or {}).items():
        if k in valid and str(v).strip():
            fields[k] = str(v).strip()[:200]
    if text and "duration" in valid and "duration" not in fields and (m := DURATION.search(text)):
        fields["duration"] = m.group(0)

    todo = _queue(dep, fields, has_location, has_photo, asked)
    done = bool(text and DONE.search(text)) or bool((llm or {}).get("ready_to_confirm"))     # "that's all", any language
    ready = st.get("ready") or done or not todo or len(asked) >= MAX_QUESTIONS
    st.update(fields=fields)
    danger = {"is_emergency": bool((llm or {}).get("is_emergency")), "hazards": list((llm or {}).get("hazards") or [])}
    if ready:
        st.update(ready=True, pending=None)
        return {"intent": "new_complaint", "reply": {}, "missing_fields": missing(dep, fields, has_location),
                "quick_replies": [], "ready_to_confirm": True, **danger}

    # one question: the LLM's, if it asks about something still open; otherwise the next one in the queue
    ask = (llm or {}).get("asking") if (llm or {}).get("asking") in todo and (llm or {}).get("reply", {}).get("en") else todo[0]
    reply = _localized(llm["reply"], lang) if ask == (llm or {}).get("asking") else question(ask, dep, lang)
    st.update(asked=asked + [ask], pending=ask)
    return {"intent": "new_complaint", "reply": reply, "missing_fields": missing(dep, fields, has_location),
            "quick_replies": quick_replies(ask), "ready_to_confirm": False, **danger}


def _localized(reply: dict, lang: str) -> dict:
    return {"original": reply.get("original") or reply.get("en", ""), "en": reply.get("en", ""), "lang": lang}
