"""Prompt templates live in app/ai/prompts/<task>.md (Spec B §5). Every template demands JSON only and carries
Telugu + Tenglish few-shots. Inputs are PII-masked before formatting."""
from pathlib import Path

_DIR = Path(__file__).parent


def _load(name: str) -> str:
    return (_DIR / f"{name}.md").read_text(encoding="utf-8")


ANALYZE = _load("analyze_complaint")
SECOND_OPINION = _load("route_second_opinion")
TRANSLATE = _load("translate")
LOCALIZE = _load("localize_reply")
BRIEF = _load("officer_brief")
DRAFT_REPLY = _load("draft_reply")
VERIFY = _load("verify_resolution")
INSIGHTS = _load("insights_summary")
GUIDE = _load("guide_answer")
