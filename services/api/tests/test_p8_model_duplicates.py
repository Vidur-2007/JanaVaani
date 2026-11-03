"""Classifier artefacts (e5 model + TF-IDF fallback) and the semantic duplicate score. The real e5 model is not loaded here."""
import json
import pickle

import numpy as np
import pytest

from app.core.config import MODELS_DIR
from app.ml import classifier, embeddings
from app.ml.features import EmbeddingFeatures
from app.pipeline import duplicates, scoring


def test_both_artefacts_are_committed_and_e5_beats_the_fallback():
    e5 = json.loads((MODELS_DIR / "metrics.json").read_text())
    tfidf = json.loads((MODELS_DIR / "metrics_tfidf.json").read_text())
    assert e5["features"] == "e5" and tfidf["features"] == "tfidf"
    assert (MODELS_DIR / "classifier.joblib").exists() and (MODELS_DIR / "classifier_tfidf.joblib").exists()
    assert e5["human_test"]["accuracy"] > tfidf["human_test"]["accuracy"]


def test_e5_artefact_holds_only_the_head_not_the_embedding_model():
    assert (MODELS_DIR / "classifier.joblib").stat().st_size < 1_000_000
    restored = pickle.loads(pickle.dumps(EmbeddingFeatures("intfloat/multilingual-e5-small")))
    assert vars(restored) == {"name": "intfloat/multilingual-e5-small"}


def test_features_add_the_e5_query_prefix(monkeypatch):
    seen = {}
    monkeypatch.setattr(embeddings, "encode", lambda texts, name: seen.update(texts=texts, name=name) or np.zeros((len(texts), 3)))
    EmbeddingFeatures("intfloat/multilingual-e5-small").transform(["pothole"])
    assert seen == {"texts": ["query: pothole"], "name": "intfloat/multilingual-e5-small"}


def test_offline_mode_uses_the_tfidf_fallback():
    assert embeddings.mode() == "lexical" and classifier.active_features() == "tfidf"
    assert classifier.metrics()["features"] == "tfidf"


@pytest.mark.parametrize("configured,expected", [("intfloat/multilingual-e5-small", "e5"), ("some/other-model", "tfidf")])
def test_e5_head_only_used_with_the_encoder_it_was_trained_on(monkeypatch, configured, expected):
    from app.core.config import get_settings
    monkeypatch.setattr(embeddings, "mode", lambda: "semantic")
    monkeypatch.setattr(get_settings(), "embedding_model", configured)
    assert classifier._choose_features() == expected


@pytest.mark.parametrize("cos,distance,same,strong", [
    (0.93, 100, True, True),      # same issue, English text
    (0.885, 300, True, True),     # same issue, further away
    (0.825, 100, True, False),    # same department, different issue, close by
    (0.79, 10, True, False),      # unrelated text cannot pass on distance and category alone
    (0.93, 100, False, True),     # same issue reported under a related department
    (0.84, 450, False, False),
])
def test_semantic_duplicate_score(cos, distance, same, strong):
    assert (duplicates.score(cos, distance, same, "semantic") >= duplicates.STRONG["semantic"]) is strong


def test_matches_in_an_incident_report_the_incident_total(client, seeded):
    loc = {"lat": 17.4968, "lng": 78.3614, "source": "gps"}
    matches = client.post("/api/v1/grievances/check-duplicates", json={"text": "pothole on the road at Miyapur X Roads", "location": loc, "category": "roads"}).json()
    in_incident = [m for m in matches if m["incident_id"]]
    assert in_incident and all(m["support_count"] >= 32 for m in in_incident)


def test_keyword_rule_routes_a_live_wire_to_power_despite_the_classifier():
    wrong = {"department": "drainage", "confidence": 0.87, "proba": {"drainage": 0.87, "power": 0.001}}
    offline = scoring.route(wrong, None, None, None, "power")
    assert offline["department"] == "power" and offline["confidence"] == 0.9 and {"source": "rule", "department": "power"} in offline["votes"]
    agreed = scoring.route(wrong, "power", "power", None, "power")
    assert agreed["department"] == "power" and agreed["confidence"] >= 0.75 and agreed["method"] == "auto"
    assert "safety keyword rule" in agreed["explanation_en"]
    outvoted = scoring.route(wrong, "drainage", "drainage", None, "power")    # the rule informs, two LLMs and the model can still overrule
    assert outvoted["department"] == "drainage"


def test_chat_live_wire_in_telugu_routes_to_power_offline(client, seeded):
    r = client.post("/api/v1/chat/turn", json={"text": "మా బడి దగ్గర కరెంటు తీగ తెగి రోడ్డు మీద పడింది, కూకట్‌పల్లి", "ui_lang": "te", "input_mode": "text"}).json()
    r = client.post("/api/v1/chat/turn", json={"session_id": r["session_id"], "action": "continue_after_emergency", "ui_lang": "te", "input_mode": "text"}).json()
    r = client.post("/api/v1/chat/turn", json={"session_id": r["session_id"], "text": "anthe", "ui_lang": "te", "input_mode": "text"}).json()
    assert r["draft"]["category"] == "power" and r["draft"]["routing_preview"]["confidence"] >= 0.75


def test_lexical_score_keeps_the_plain_cosine():
    assert duplicates.score(0.5, 0, True, "lexical") == pytest.approx(0.6 * 0.5 + 0.25 + 0.15)
