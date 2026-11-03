"""Deterministic safety layer (<20 ms): PII masking, emergency keywords, spam heuristics, language/script ID."""
import re
import unicodedata

from ..refdata import emergency_keywords, is_whole_word

PII = [
    (re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"), "[AADHAAR]"),
    # spec regex + common written forms "98480 22338" / "98480-22338"
    (re.compile(r"(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b"), "[PHONE]"),
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL]"),
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[PAN]"),
]


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip()


def mask_pii(text: str) -> str:
    out = text or ""
    for rx, tok in PII:
        out = rx.sub(tok, out)
    return out


_HI_UR = re.compile(r"[ऀ-ॿ؀-ۿ]")   # postpositions are separate words here; Telugu suffixes are not
_NOT_A_FIRE = re.compile(r"\bfire (station|brigade office|works)\b|\bfire (the|this|that|him|her|them|these|those)\b")


def _has_phrase(text: str, phrase: str) -> bool:
    p = unicodedata.normalize("NFC", phrase).lower()
    if re.fullmatch(r"[a-z ]+", p):            # latin phrase: word boundaries (avoid 'fire' in 'fireworks'? keep strict)
        return re.search(rf"(?<![a-z]){re.escape(p)}(?![a-z])", text) is not None
    if " " not in p and _HI_UR.search(p):      # 'आग' must not match 'आगे' or 'आगरा'; 'آگ' must not match 'آگے'
        return any(is_whole_word(text, m.start(), m.end()) for m in re.finditer(re.escape(p), text))
    return p in text


def detect_emergency(text: str) -> dict:
    t = _NOT_A_FIRE.sub(" ", unicodedata.normalize("NFC", text or "").lower())
    kw = emergency_keywords()
    matched = []
    for lang in ("en", "te", "hi", "ur", "translit"):
        matched += [p for p in kw[lang] if _has_phrase(t, p)]
    hazards = sorted({h for h, phrases in kw["hazard_map"].items() if any(_has_phrase(t, p) for p in phrases)})
    return {"is_emergency": bool(matched), "matched_terms": sorted(set(matched)), "hazards": hazards}


def spam_score(text: str) -> tuple[float, str | None]:
    t = (text or "").strip()
    if len(t) < 3:
        return 1.0, "empty"
    if len(set(t.replace(" ", ""))) <= 2:
        return 0.9, "repeated_characters"
    letters = sum(ch.isalpha() for ch in t)
    if letters / max(1, len(t)) < 0.3:
        return 0.8, "mostly_non_letters"
    if re.search(r"(.{3,})\1{4,}", t):
        return 0.7, "repeated_text"
    return 0.0, None


# ---------- language + script identification ----------
TE = re.compile(r"[ఀ-౿]")
DEV = re.compile(r"[ऀ-ॿ]")
ARAB = re.compile(r"[؀-ۿݐ-ݿ]")
TA, KN, ML, BN, GU = (re.compile(r) for r in (r"[஀-௿]", r"[ಀ-೿]", r"[ഀ-ൿ]", r"[ঀ-৿]", r"[઀-૿]"))
TENGLISH = {"ledu", "undi", "ayyindi", "avtundi", "chala", "meeda", "nunchi", "raavadam", "neellu", "galli", "gunta",
            "chetta", "intlo", "ma", "mee", "andi", "kuda", "ekkuva", "takkuva", "cheyyatledu", "poyindi", "vastundi",
            "vastunnayi", "unnayi", "lo", "ki", "pedda", "rojulu", "rojula", "cheyali", "kadutunnaru", "domalu", "vangipoyindi"}
HINGLISH = {"hai", "nahi", "raha", "rahi", "hain", "mein", "ka", "ki", "ke", "se", "paani", "kachra", "gaddha", "gali",
            "bahut", "kar", "karo", "ho", "gaya", "aa", "din", "pe", "sadak", "bijli", "machhar", "naali", "yaar"}


def identify_language(text: str) -> dict:
    t = text or ""
    counts = {"te": len(TE.findall(t)), "hi": len(DEV.findall(t)), "ur": len(ARAB.findall(t)),
              "ta": len(TA.findall(t)), "kn": len(KN.findall(t)), "ml": len(ML.findall(t)),
              "bn": len(BN.findall(t)), "gu": len(GU.findall(t))}
    latin = len(re.findall(r"[A-Za-z]", t))
    native_lang, native_n = max(counts.items(), key=lambda kv: kv[1])
    if native_n > 0:
        script = "mixed" if latin > native_n * 0.3 else "native"
        return {"language": native_lang, "script": script, "is_code_mixed": script == "mixed", "method": "script"}
    words = re.findall(r"[a-z]+", t.lower())
    te_hits = sum(w in TENGLISH for w in words)
    hi_hits = sum(w in HINGLISH for w in words)
    if te_hits >= 2 and te_hits >= hi_hits:
        return {"language": "te", "script": "latin", "is_code_mixed": True, "method": "romanised_lexicon"}
    if hi_hits >= 2:
        return {"language": "hi", "script": "latin", "is_code_mixed": True, "method": "romanised_lexicon"}
    return {"language": "en", "script": "native", "is_code_mixed": False, "method": "default_latin"}
