"""Loads the trained department classifier and serves predictions. Two artefacts: the e5 embedding model, and a TF-IDF
fallback for when the embedding model cannot load. Hot-swappable after retraining. Raises nothing at import; `available()` reports readiness."""
import json
import logging
import threading

import joblib

from ..core.config import MODELS_DIR, get_settings
from . import embeddings

log = logging.getLogger("janavaani.classifier")
_lock = threading.Lock()
_model = None
_metrics: dict = {}
_features: str | None = None
MODEL_FILES = {"e5": ("classifier.joblib", "metrics.json"), "tfidf": ("classifier_tfidf.joblib", "metrics_tfidf.json")}


def _choose_features() -> str:
    """e5 only when its encoder runs here and is the one the head was trained on; a different model's vectors would be meaningless."""
    if embeddings.mode() != "semantic":
        return "tfidf"
    model_file, metrics_file = MODEL_FILES["e5"]
    trained_on = None
    if (MODELS_DIR / model_file).exists() and (MODELS_DIR / metrics_file).exists():
        trained_on = json.loads((MODELS_DIR / metrics_file).read_text()).get("embedding_model")
    if trained_on == get_settings().embedding_model:
        return "e5"
    log.warning("classifier was trained on %s but EMBEDDING_MODEL is %s; using TF-IDF", trained_on, get_settings().embedding_model)
    return "tfidf"


def active_features() -> str:
    load()
    return _features or "tfidf"


def load(force: bool = False):
    global _model, _metrics, _features
    with _lock:
        if _model is not None and not force:
            return _model
        _features = _choose_features()
        model_file, metrics_file = MODEL_FILES[_features]
        path = MODELS_DIR / model_file
        if not path.exists():
            log.error("classifier not found at %s — run ml/train_classifier.py", path)
            return None
        _model = joblib.load(path)
        mp = MODELS_DIR / metrics_file
        _metrics = json.loads(mp.read_text()) if mp.exists() else {}
        log.info("classifier loaded: %s (%s)", _metrics.get("model_version"), _features)
        return _model


def swap(model, metrics: dict):
    global _model, _metrics
    with _lock:
        _model, _metrics = model, metrics


def available() -> bool:
    return load() is not None


def metrics() -> dict:
    load()
    return _metrics


def predict(text: str) -> dict:
    """Returns {"department", "confidence", "proba": {label: p}} or a needs-review fallback."""
    m = load()
    if m is None or not (text or "").strip():
        return {"department": "other", "confidence": 0.0, "proba": {}, "available": False}
    probs = m.predict_proba([text])[0]
    labels = list(m.classes_)
    proba = {l: round(float(p), 4) for l, p in zip(labels, probs)}
    best = max(proba, key=proba.get)
    return {"department": best, "confidence": proba[best], "proba": proba, "available": True}
