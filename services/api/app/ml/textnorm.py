"""Text normaliser shared by training and inference (must be importable so the pickled model loads in the API)."""
import unicodedata


def normalize(t: str) -> str:
    return unicodedata.normalize("NFC", t or "").lower().strip()
