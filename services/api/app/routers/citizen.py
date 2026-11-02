"""Citizen-facing endpoints #1–#19 (master §9)."""
import io
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core import clock
from ..core.config import get_settings
from ..core.db import get_db
from ..core.errors import err
from ..core.ratelimit import limiter
from ..core.security import User, current_user, require
from ..ml import embeddings
from ..models import Appeal, ChatSession, Grievance, Media, Message, Notification, Profile
from ..pipeline import analyze as an, audit, duplicates, safety, workflow
from ..ai.localize import localize
from ..refdata import emergency_contacts
from ..serialize import appeal_dict, detail_dict, grievance_dict, media_dict, message_dict, paged

router = APIRouter()


# ---------------- schemas ----------------
class LocationIn(BaseModel):
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    landmark: str | None = None
    source: str = "gps"
    accuracy_m: float | None = None


class ChatTurnRequest(BaseModel):
    session_id: str | None = None
    text: str | None = Field(None, max_length=4000)
    input_mode: str = "text"
    lang_hint: str | None = None
    ui_lang: str = "en"
    media_ids: list[str] = []
    location: LocationIn | None = None
    asset_id: str | None = None
    action: str | None = None
    action_payload: dict = {}
    submit_options: dict = {}


class AnalyzeIn(BaseModel):
    text: str = Field(..., min_length=3, max_length=4000)
    ui_lang: str = "en"
    media_ids: list[str] = []
    location: LocationIn | None = None


class CreateIn(BaseModel):
    draft: dict
    location: LocationIn | None = None
    media_ids: list[str] = []
    asset_id: str | None = None
    is_anonymous: bool = False
    is_private: bool = False
    text: str | None = None          # optional: original citizen text (if the client kept it)


class DupIn(BaseModel):
    text: str
    location: LocationIn
    category: str


class FeedbackIn(BaseModel):
    accepted: bool
    rating: int | None = Field(None, ge=1, le=5)
    comment: str | None = None
    media_ids: list[str] = []


class ReasonIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)
    media_ids: list[str] = []


class MsgIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    ui_lang: str = "en"


# ---------------- helpers ----------------
def _imgs(db, media_ids):
    out = []
    for mid in media_ids or []:
        m = db.get(Media, mid)
        if m:
            try:
                out.append((Path(m.storage_path).read_bytes(), "image/webp"))
            except OSError:
                pass
    return out or None


def get_grievance_for(db: Session, gid: str, user: User, pin: str | None = None, write=False) -> Grievance:
    g = db.get(Grievance, gid)
    if not g:
        raise err(404, "not_found", "Grievance not found.")
    if user.is_gov:
        if user.role == "officer" and g.category != user.department_id and g.assigned_officer_id != user.id:
            raise err(403, "forbidden", "This grievance belongs to another department.")
        return g
    if user.authenticated and g.citizen_id == user.id:
        return g
    if pin and g.guest_pin_hash and workflow.hash_pin(g.id, pin) == g.guest_pin_hash:
        return g
    raise err(403, "forbidden", "You can only view your own grievances (or use the ticket PIN).")


def _create(db, res, user, *, media_ids, asset_id, opts, location=None) -> list[dict]:
    """Create main grievance + linked grievances for secondary departments (multi-label)."""
    g, pin = workflow.create_from_analysis(db, res, user, media_ids=media_ids, asset_id=asset_id,
                                           is_anonymous=bool(opts.get("is_anonymous")), is_private=bool(opts.get("is_private")),
                                           location_override=location)
    out = [{"grievance_id": g.id, "guest_pin": pin} if pin else {"grievance_id": g.id}]
    linked = []
    for sec in res["routing"].get("secondary_departments", []):
        r2 = {**res, "routing": {**res["routing"], "department": sec, "secondary_departments": [],
                                 "explanation_en": f"Linked grievance for secondary department {sec} (multi-issue complaint {g.id})"}}
        g2, _ = workflow.create_from_analysis(db, r2, user, location_override=location, is_private=bool(opts.get("is_private")))
        g2.guest_pin_hash = g.guest_pin_hash
        linked.append(g2)
    if linked:
        g.related_ids = [x.id for x in linked]
        for x in linked:
            x.related_ids = [g.id] + [y.id for y in linked if y.id != x.id]
    return out, g


# ---------------- #1 chat ----------------
@router.post("/chat/turn")
@limiter.limit("30/minute")
def chat_turn(request: Request, body: ChatTurnRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = db.get(ChatSession, body.session_id) if body.session_id else None
    if s is None:
        s = ChatSession(id=str(uuid.uuid4()), user_id=user.id, state={"stage": "collecting", "texts": []})
        db.add(s)
    st = dict(s.state or {})
    lang = st.get("language") or body.lang_hint or body.ui_lang

    def reply(stage, intent, text_en, **extra):
        s.state = st | {"stage": stage}
        db.add(Message(session_id=s.id, sender="bot", text=localize(text_en, lang)))
        db.commit()
        return {"session_id": s.id, "intent": intent, "stage": stage, "detected_language": lang,
                "is_code_mixed": st.get("is_code_mixed", False), "reply": localize(text_en, lang),
                "quick_replies": extra.pop("quick_replies", []), "missing_fields": extra.pop("missing_fields", []), **extra}

    act = body.action
    if act == "cancel":
        st = {"stage": "collecting", "texts": []}
        return reply("collecting", "smalltalk", "Cancelled. You can start a new complaint any time.")
    if act == "edit":
        st["stage"] = "collecting"
        return reply("collecting", "new_complaint", "What would you like to change?")
    if act == "support_existing":
        gid = (body.action_payload or {}).get("grievance_id")
        g = db.get(Grievance, gid) if gid else None
        if not g:
            raise err(404, "not_found", "Grievance to support not found.")
        workflow.add_support(db, g, user.id or f"session:{s.id}", user)
        return reply("submitted", "new_complaint", "Thank you. Your voice was added to the existing complaint.",
                     submitted=[{"grievance_id": g.id}])
    if act in ("confirm", "file_new_anyway", "split_confirm"):
        res = st.get("analysis_result")
        if not res:
            raise err(409, "nothing_to_confirm", "No draft to confirm in this session.")
        loc = res["location"]
        if act == "confirm":
            dups = duplicates.find(db, res["embedding"], (loc or {}).get("lat"), (loc or {}).get("lng"),
                                   res["routing"]["department"], strong_only=True)
            if dups:
                st["stage"] = "duplicate_check"
                return reply("duplicate_check", "new_complaint",
                             "Similar complaints were already reported nearby. Would you like to add your voice to one of them?",
                             duplicates=dups, draft=st.get("draft"),
                             quick_replies=[{"label": "Add my voice", "value": "support_existing"},
                                            {"label": "File new anyway", "value": "file_new_anyway"}])
        submitted, _ = _create(db, res, user, media_ids=st.get("media_ids", []), asset_id=st.get("asset_id"),
                               opts=body.submit_options or {})
        st.pop("analysis_result", None)
        return reply("submitted", "new_complaint", "Your complaint has been submitted.", submitted=submitted)

    text = (body.text or "").strip()
    if not text:
        return reply("collecting", "smalltalk", "Please tell me about the problem you are facing.")
    db.add(Message(session_id=s.id, sender="citizen", text={"original": text, "en": "", "lang": lang}))
    em = safety.detect_emergency(text)
    if em["is_emergency"] and act != "continue_after_emergency" and not st.get("emergency_ack"):
        st.update(emergency=True, emergency_ack=True, texts=st.get("texts", []) + [text])
        lid = safety.identify_language(text)
        lang = lid["language"] if lid["language"] in ("en", "te", "hi", "ur") else lang
        st["language"] = lang
        return reply("emergency", "emergency", "We are sorry. This looks like an emergency. Please call the numbers below right now.",
                     emergency={"matched_terms": em["matched_terms"], "contacts": emergency_contacts(),
                                "message": localize("We are sorry. This looks like an emergency. Please call the numbers below right now.", lang)},
                     quick_replies=[{"label": "Continue filing complaint", "value": "continue_after_emergency"}])
    # track status intent: explicit ticket id or status words
    m = re.search(r"GRV-\d{4}-\d{6}", text, re.I)
    if m or re.search(r"\b(status|track|where is my complaint|naa complaint|meri shikayat)\b", text, re.I):
        q = select(Grievance)
        q = q.where(Grievance.id == m.group(0).upper()) if m else q.where(Grievance.citizen_id == user.id) if user.authenticated else q.where(False)
        tracked = [grievance_dict(g, db, user) for g in db.execute(q.order_by(Grievance.created_at.desc()).limit(5)).scalars()
                   if user.is_gov or g.citizen_id == user.id or (m and not g.is_private)]
        msg = "Here is the latest status of your complaint." if tracked else "I could not find a complaint with that number."
        return reply("answered", "track_status", msg, tracked=tracked)

    texts = st.get("texts", []) + [text]
    st["texts"] = texts
    st["media_ids"] = list(dict.fromkeys(st.get("media_ids", []) + (body.media_ids or [])))
    st["asset_id"] = body.asset_id or st.get("asset_id")
    full = " ".join(texts)
    res = an.analyze(full, body.location.model_dump() if body.location else st.get("location"), _imgs(db, st["media_ids"]))
    if st.get("emergency"):
        res["emergency"]["is_emergency"] = True
        res["analysis"]["is_emergency"] = True
    if body.location:
        st["location"] = body.location.model_dump()
    lang = res["analysis"]["language"] if res["analysis"]["language"] in ("en", "te", "hi", "ur") else body.ui_lang
    st.update(language=lang, is_code_mixed=res["analysis"]["is_code_mixed"])
    officer = None
    loc = res["location"] or {}
    if loc.get("ward_id"):
        off = workflow.pick_officer(db, res["routing"]["department"], loc["ward_id"], loc.get("zone"))
        officer = {"name": off.name, "office_name": off.office_name} if off else None
    draft = an.to_draft(res, st["media_ids"], officer)
    st["analysis_result"], st["draft"] = res, draft
    ask = [f for f in draft["missing_fields"] if f in ("location_detail", "address")] if not res["location"] else []
    if not res["location"] and len(texts) <= 4:
        from ..refdata import department
        q = next((f["question"] for f in department(draft["category"])["required_fields"] if f["key"] in ("location_detail", "address")),
                 {"en": "Where exactly is it? Please share a landmark or your location."})
        return reply("collecting", "new_complaint", q.get("en"), draft=draft, missing_fields=ask or ["location"],
                     quick_replies=[{"label": "Share my location", "value": "share_location"}])
    drafts = None
    issues = res["analysis"].get("issues") or []
    if len(issues) > 1:
        drafts = [{**draft, "draft_id": str(uuid.uuid4()), "summary_en": i.get("summary_en", ""),
                   "category": i.get("category", draft["category"])} for i in issues]
    return reply("confirming", "new_complaint", "Thank you. Please check the details and confirm your complaint.",
                 draft=draft, drafts=drafts, missing_fields=draft["missing_fields"],
                 quick_replies=[{"label": "Confirm", "value": "confirm"}, {"label": "Edit", "value": "edit"}])


# ---------------- #2–#6 grievances ----------------
_drafts: dict[str, dict] = {}   # draft_id -> full analysis result (process-local; drafts are short-lived)


@router.post("/grievances/analyze")
@limiter.limit("30/minute")
def analyze_ep(request: Request, body: AnalyzeIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    res = an.analyze(body.text, body.location.model_dump() if body.location else None, _imgs(db, body.media_ids))
    draft = an.to_draft(res, body.media_ids)
    _drafts[draft["draft_id"]] = res
    if len(_drafts) > 500:
        _drafts.pop(next(iter(_drafts)))
    return draft


@router.post("/grievances")
@limiter.limit("10/hour")
def create_ep(request: Request, body: CreateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    res = _drafts.get(body.draft.get("draft_id"))
    if res is None:
        text = body.text or body.draft.get("cleaned_original") or body.draft.get("summary_en")
        if not text:
            raise err(422, "draft_expired", "Draft not found; send the original text again via /grievances/analyze.")
        res = an.analyze(text, body.location.model_dump() if body.location else body.draft.get("location"))
    loc = an.resolve_location(body.location.model_dump(), [], "") if body.location and body.location.lat is not None else None
    cat = body.draft.get("category")
    if cat and cat != res["routing"]["department"]:   # citizen edited category: record as human vote, keep review
        res = {**res, "routing": {**res["routing"], "department": cat,
                                  "votes": res["routing"]["votes"] + [{"source": "human", "department": cat}],
                                  "explanation_en": res["routing"]["explanation_en"] + f" Citizen selected {cat}."}}
    l = loc or res["location"] or {}
    dups = duplicates.find(db, res["embedding"], l.get("lat"), l.get("lng"), res["routing"]["department"], strong_only=True)
    submitted, g = _create(db, res, user, media_ids=body.media_ids, asset_id=body.asset_id,
                           opts={"is_anonymous": body.is_anonymous, "is_private": body.is_private}, location=loc)
    db.commit()
    _drafts.pop(body.draft.get("draft_id"), None)
    out = {"grievance": grievance_dict(g, db, user)}
    if submitted[0].get("guest_pin"):
        out["guest_pin"] = submitted[0]["guest_pin"]
    if dups:
        out["duplicates"] = dups
    return out


@router.post("/grievances/check-duplicates")
def check_dups(body: DupIn, db: Session = Depends(get_db)):
    return duplicates.find(db, embeddings.embed(safety.mask_pii(body.text)), body.location.lat, body.location.lng, body.category)


@router.post("/grievances/{gid}/support")
def support(gid: str, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    g = db.get(Grievance, gid)
    if not g:
        raise err(404, "not_found", "Grievance not found.")
    key = user.id or f"ip:{request.client.host if request.client else 'anon'}"
    out = workflow.add_support(db, g, key, user)
    db.commit()
    return out


@router.get("/grievances/{gid}")
def get_one(gid: str, pin: str | None = None, lang: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return detail_dict(get_grievance_for(db, gid, user, pin), db, user)


@router.get("/me/grievances")
def mine(status: str | None = None, q: str | None = None, page: int = 1, page_size: int = 20,
         db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    qq = select(Grievance).where(Grievance.citizen_id == user.id)
    if status:
        qq = qq.where(Grievance.status == status)
    if q:
        qq = qq.where(or_(Grievance.summary_en.ilike(f"%{q}%"), Grievance.id.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(qq.subquery()))
    rows = db.execute(qq.order_by(Grievance.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars()
    return paged([grievance_dict(g, db, user) for g in rows], total, page, page_size)


def _owner(db, gid, user):
    g = db.get(Grievance, gid)
    if not g:
        raise err(404, "not_found", "Grievance not found.")
    if not (user.authenticated and g.citizen_id == user.id):
        raise err(403, "forbidden", "Only the citizen who filed this grievance can do this.")
    return g


@router.post("/grievances/{gid}/feedback")
def feedback(gid: str, body: FeedbackIn, db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    g = _owner(db, gid, user)
    workflow.citizen_feedback(db, g, user, body.accepted, body.rating, body.comment)
    db.commit()
    return detail_dict(g, db, user)


@router.post("/grievances/{gid}/reopen")
def reopen(gid: str, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    g = _owner(db, gid, user)
    workflow.reopen(db, g, user, body.reason)
    db.commit()
    return detail_dict(g, db, user)


@router.post("/grievances/{gid}/appeal")
def appeal(gid: str, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    g = _owner(db, gid, user)
    a = Appeal(grievance_id=g.id, reason={"original": body.reason, "en": "", "lang": g.language})
    db.add(a)
    audit.add_event(db, g.id, "appeal_filed", "Citizen filed an appeal", actor_role=user.role, actor_id=user.id)
    workflow.live(db, "role:admin", "grievance_updated", g.id)
    db.commit()
    return appeal_dict(a)


@router.post("/grievances/{gid}/messages")
def citizen_msg(gid: str, body: MsgIn, db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    g = _owner(db, gid, user)
    m = Message(grievance_id=g.id, sender="citizen", sender_name=None if g.is_anonymous else user.name,
                text={"original": safety.mask_pii(body.text), "en": "", "lang": body.ui_lang})
    db.add(m)
    audit.add_event(db, g.id, "message", "Citizen sent a message", actor_role=user.role, actor_id=user.id)
    if g.assigned_officer_id:
        workflow.notify(db, g.assigned_officer_id, g.id, "message", "New citizen message", f"New message on {g.id}")
    db.commit()
    return message_dict(m)


# ---------------- #12 uploads ----------------
@router.post("/uploads")
@limiter.limit("30/hour")
async def upload(request: Request, file: UploadFile = File(...), purpose: str = Form("evidence"),
                 grievance_id: str | None = Form(None), lat: float | None = Form(None), lng: float | None = Form(None),
                 db: Session = Depends(get_db), user: User = Depends(current_user)):
    from PIL import Image, ImageOps, ImageStat
    if purpose not in ("evidence", "resolution_proof", "verification"):
        raise err(422, "bad_purpose", "purpose must be evidence, resolution_proof or verification.")
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise err(415, "unsupported_type", "Only JPEG, PNG or WebP images are allowed.")
    data = await file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise err(413, "too_large", "Images must be 8 MB or smaller.")
    try:
        im = Image.open(io.BytesIO(data))
        im.verify()
        im = Image.open(io.BytesIO(data))
    except Exception:
        raise err(422, "invalid_image", "The file is not a valid image.")
    exif_geo = _exif_gps(im)
    im = ImageOps.exif_transpose(im).convert("RGB")       # re-encode drops all EXIF
    im.thumbnail((1600, 1600))
    gray = im.convert("L")
    bright = ImageStat.Stat(gray).mean[0]
    from PIL import ImageFilter
    lap = ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).var[0]
    issue = "too_small" if min(im.size) < 200 else "dark" if bright < 40 else "blurry" if lap < 30 else "none"
    now = clock.now()
    folder = Path(get_settings().upload_dir) / f"{now:%Y}" / f"{now:%m}"
    folder.mkdir(parents=True, exist_ok=True)
    mid = str(uuid.uuid4())
    path = folder / f"{mid}.webp"
    im.save(path, "WEBP", quality=82)
    geo = {"lat": lat, "lng": lng} if lat is not None and lng is not None else exif_geo
    if grievance_id and not db.get(Grievance, grievance_id):
        raise err(404, "not_found", "grievance_id not found.")
    m = Media(id=mid, grievance_id=grievance_id, storage_path=str(path), uploaded_by_role=user.role, uploaded_by=user.id,
              purpose=purpose, quality={"ok": issue == "none", "issue": issue}, geo=geo)
    try:
        import imagehash
        m.phash = str(imagehash.phash(im))
    except Exception:
        pass
    db.add(m)
    if grievance_id:
        audit.add_event(db, grievance_id, "evidence_added", f"Photo added ({purpose})", actor_role=user.role, actor_id=user.id)
    db.commit()
    return media_dict(m)


def _exif_gps(im):
    try:
        gps = im.getexif().get_ifd(0x8825)
        if not gps:
            return None

        def dec(v, ref):
            d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
            return -d if ref in ("S", "W") else d
        return {"lat": dec(gps[2], gps[1]), "lng": dec(gps[4], gps[3])}
    except Exception:
        return None


@router.get("/uploads/{mid}")
def get_upload(mid: str, db: Session = Depends(get_db)):
    """Media URLs (Media.url). Supabase signed URLs replace this in a Supabase Storage deployment."""
    m = db.get(Media, mid)
    if not m or not Path(m.storage_path).exists():
        raise err(404, "not_found", "Media not found.")
    return FileResponse(m.storage_path, media_type="image/webp")


# ---------------- #13–#17 speech, translate, search, guide ----------------
@router.post("/speech/transcribe")
@limiter.limit("30/hour")
async def transcribe(request: Request, audio: UploadFile = File(...), language: str | None = Form(None)):
    import httpx
    s = get_settings()
    if not s.groq_api_key or s.force_fail_groq:
        raise err(501, "not_configured", "Server transcription is not configured; use the browser speech input.")
    data = await audio.read(25 * 1024 * 1024)
    for model in (s.groq_whisper_model, "whisper-large-v3"):
        try:
            r = httpx.post("https://api.groq.com/openai/v1/audio/transcriptions", timeout=30,
                           headers={"Authorization": f"Bearer {s.groq_api_key}"},
                           files={"file": (audio.filename or "audio.webm", data)},
                           data={"model": model, "response_format": "verbose_json", **({"language": language} if language else {})})
            if r.status_code == 200:
                j = r.json()
                code = {"telugu": "te", "hindi": "hi", "urdu": "ur", "english": "en"}.get(str(j.get("language", "")).lower(), j.get("language", "other"))
                return {"text": j.get("text", ""), "language": code, "duration_s": j.get("duration", 0)}
        except httpx.HTTPError:
            continue
    raise err(502, "transcription_failed", "Transcription failed. Please type your complaint instead.")


@router.post("/speech/tts")
def tts():
    raise err(501, "not_configured", "Server text-to-speech is not configured (GEMINI_TTS_MODEL empty); use browser speech synthesis.")


class TranslateIn(BaseModel):
    text: str = Field(..., max_length=4000)
    target_lang: str


@router.post("/translate")
def translate(body: TranslateIn):
    from pydantic import BaseModel as BM

    from ..ai import gateway, prompts

    class T(BM):
        text: str
        source_lang: str = "other"
    src = safety.identify_language(body.text)["language"]
    if src == body.target_lang:
        return {"text": body.text, "source_lang": src}
    r, _ = gateway.run("translate", prompts.TRANSLATE.format(target=body.target_lang, text=safety.mask_pii(body.text)), T)
    if not r:
        raise err(503, "translation_unavailable", "Translation is temporarily unavailable.")
    return {"text": r["text"], "source_lang": r.get("source_lang") or src}


@router.get("/search")
def search(q: str, scope: str = "public", lang: str = "en", db: Session = Depends(get_db), user: User = Depends(current_user)):
    qv = embeddings.embed(safety.mask_pii(q), "query")
    base = select(Grievance)
    if scope == "mine":
        base = base.where(Grievance.citizen_id == (user.id or "-"))
    elif scope == "gov" and user.is_gov:
        if user.role == "officer":
            base = base.where(Grievance.category == user.department_id)
    else:
        base = base.where(Grievance.is_private.is_(False))
    rows = list(db.execute(base.order_by(Grievance.created_at.desc()).limit(2000)).scalars())
    kw = q.lower()
    scored = sorted(((embeddings.cosine(qv, g.embedding) + (0.5 if kw in (g.summary_en or "").lower() or kw in g.id.lower() else 0), g)
                     for g in rows), key=lambda x: -x[0])
    viewer = user if scope != "public" else None
    gs = [grievance_dict(g, db, viewer) for s_, g in scored[:10] if s_ > 0.2]
    if scope == "public":
        for d in gs:
            d.pop("description", None); d.pop("citizen_display_name", None)
    return {"grievances": gs, "guide": _guide_hits(q)[:3]}


def _guide_sections():
    from ..core.config import DATA_DIR
    p = DATA_DIR / "knowledge" / "service_guide.md"
    if not p.exists():
        return []
    secs, cur = [], None
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            cur = {"title": line[3:].strip(), "anchor": re.sub(r"[^a-z0-9]+", "-", line[3:].lower()).strip("-"), "text": ""}
            secs.append(cur)
        elif cur:
            cur["text"] += line + "\n"
    return secs


def _guide_hits(q):
    words = [w for w in re.findall(r"\w+", q.lower()) if len(w) > 2]
    hits = []
    for s_ in _guide_sections():
        score = sum(s_["text"].lower().count(w) + 3 * s_["title"].lower().count(w) for w in words)
        if score:
            hits.append((score, {"title": s_["title"], "snippet": s_["text"].strip()[:200], "anchor": s_["anchor"]}))
    return [h for _, h in sorted(hits, key=lambda x: -x[0])]


class GuideIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)
    ui_lang: str = "en"


@router.post("/guide/ask")
def guide_ask(body: GuideIn):
    from pydantic import BaseModel as BM

    from ..ai import gateway, prompts

    class G(BM):
        answer_original: str
        answer_en: str
        sources: list[str] = []
        department_id: str | None = None
    secs = _guide_sections()
    hits = _guide_hits(body.question)[:3]
    ctx = "\n\n".join(f"[{s_['anchor']}] {s_['title']}\n{s_['text'][:1200]}" for s_ in secs if s_["anchor"] in {h["anchor"] for h in hits}) or \
        "\n\n".join(f"[{s_['anchor']}] {s_['title']}\n{s_['text'][:400]}" for s_ in secs)
    r, _ = gateway.run("guide_answer", prompts.GUIDE.format(lang=body.ui_lang, cats="roads|...|other", guide=ctx,
                                                            q=safety.mask_pii(body.question)), G)
    if r:
        srcs = [{"title": next((s_["title"] for s_ in secs if s_["anchor"] == a), a), "anchor": a} for a in r["sources"]]
        return {"answer": {"original": r["answer_original"], "en": r["answer_en"], "lang": body.ui_lang},
                "sources": srcs, "department_id": r.get("department_id")}
    if not hits:
        return {"answer": localize("Sorry, I could not find this in the service guide.", body.ui_lang), "sources": []}
    top = hits[0]
    return {"answer": {"original": top["snippet"], "en": top["snippet"], "lang": "en"},
            "sources": [{"title": h["title"], "anchor": h["anchor"]} for h in hits]}


# ---------------- #18–#19 notifications ----------------
@router.get("/notifications")
def notifications(page: int = 1, page_size: int = 20, db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    q = select(Notification).where(Notification.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars()
    return paged([{"id": n.id, "grievance_id": n.grievance_id, "type": n.type, "title": n.title, "body": n.body,
                   "read": n.read, "created_at": clock.iso(n.created_at)} for n in rows], total, page, page_size)


@router.post("/notifications/{nid}/read")
def read_notif(nid: str, db: Session = Depends(get_db), user: User = Depends(require("guest"))):
    q = select(Notification).where(Notification.user_id == user.id)
    if nid != "all":
        q = q.where(Notification.id == nid)
    for n in db.execute(q).scalars():
        n.read = True
    db.commit()
    return {"ok": True}
