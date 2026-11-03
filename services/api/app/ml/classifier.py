"""Loads the trained department classifier (ml/models/classifier.joblib) and serves predictions.
Hot-swappable after retraining. Raises nothing at import; `available()` reports readiness."""
import json
import logging
import threading

import joblib

from ..core.config import MODELS_DIR

log = logging.getLogger("janavaani.classifier")
_lock = threading.Lock()
_model = None
_metrics: dict = {}


def load(force: bool = False):
    global _model, _metrics
    with _lock:
        if _model is not None and not force:
            return _model
        path = MODELS_DIR / "classifier.joblib"
        if not path.exists():
            log.error("classifier not found at %s — run ml/train_classifier.py", path)
            return None
        _model = joblib.load(path)
        mp = MODELS_DIR / "metrics.json"
        _metrics = json.loads(mp.read_text()) if mp.exists() else {}
        log.info("classifier loaded: %s", _metrics.get("model_version"))
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
