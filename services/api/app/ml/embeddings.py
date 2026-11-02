"""Text embeddings for duplicate detection.

Preferred: multilingual-e5-small via sentence-transformers (semantic, cross-lingual, 384-d).
Fallback: hashed character 2–4-gram TF vectors (384-d to match vector(384), l2-normalised). The fallback is LEXICAL —
it matches paraphrases that share words/spellings, not meaning across languages — and every vector
is tagged with `kind` so the API and duplicate explanations report which mode was used."""
import logging
import threading
import unicodedata

import numpy as np

from ..core.config import get_settings

log = logging.getLogger("janavaani.embeddings")
_lock = threading.Lock()
_model = None
_mode = None  # "semantic" | "lexical"
_hasher = None


def _norm(t: str) -> str:
    return unicodedata.normalize("NFC", t or "").lower()


def load():
    global _model, _mode, _hasher
    with _lock:
        if _mode:
            return _mode
        s = get_settings()
        if s.use_embeddings:
            try:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(s.embedding_model)
                _model.encode(["query: warm up"], normalize_embeddings=True)
                _mode = "semantic"
                log.info("embeddings: semantic (%s)", s.embedding_model)
                return _mode
            except Exception as e:  # missing package / no network for model download
                log.warning("embeddings: semantic model unavailable (%s); using lexical fallback", type(e).__name__)
        from sklearn.feature_extraction.text import HashingVectorizer
        _hasher = HashingVectorizer(analyzer="char_wb", ngram_range=(2, 4), n_features=384,
                                    alternate_sign=False, norm="l2", preprocessor=_norm)
        _mode = "lexical"
        return _mode


def mode() -> str:
    return _mode or load()


def embed(text: str, kind: str = "passage") -> list[float]:
    m = load()
    if m == "semantic":
        v = _model.encode([f"{kind}: {text}"], normalize_embeddings=True)[0]
    else:
        v = _hasher.transform([text]).toarray()[0]
    return [round(float(x), 5) for x in v]


def cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va, vb = np.asarray(a), np.asarray(b)
    d = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(va @ vb / d) if d else 0.0
