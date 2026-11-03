"""Train + evaluate the department classifier (our own model, not an LLM call).

Model: TF-IDF (character 2–5-grams within word boundaries + word 1–2-grams) -> LogisticRegression
(class_weight=balanced), probability-calibrated with CalibratedClassifierCV(cv=3).
Why: char n-grams handle Telugu/Devanagari/Urdu scripts and romanised code-mixing without a tokenizer,
train in seconds on CPU, and give calibrated probabilities for the routing vote. If
sentence-transformers + e5 are installed, `--features e5` benchmarks embeddings + LR instead.

Leakage control: GROUP split by phrase_id — every surface phrase appears in train OR test, never both,
so the synthetic test measures generalisation to unseen wording. text_en augmentation is added only
for training groups. The hand-written set data/eval/human_test.jsonl is never used for training.

Usage: python ml/train_classifier.py [--features tfidf|e5] [--corrections corrections.jsonl]
Outputs: ml/models/classifier.joblib, labels.json, metrics.json
"""
import argparse
import json
import random
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.pipeline import FeatureUnion, Pipeline

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MODELS = ROOT / "ml" / "models"
LABELS = ["roads", "sanitation", "water", "streetlights", "power", "drainage",
          "traffic", "health", "education", "town_planning", "other"]


def load_jsonl(p: Path):
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "api"))
from app.ml.textnorm import normalize  # noqa: E402  (importable => pickled model loads inside the API)


def make_tfidf_pipeline(C: float = 4.0):
    feats = FeatureUnion([
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=1, sublinear_tf=True, preprocessor=normalize)),
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1, sublinear_tf=True, preprocessor=normalize,
                                 token_pattern=r"(?u)\b\w+\b")),
    ])
    clf = CalibratedClassifierCV(LogisticRegression(C=C, class_weight="balanced", max_iter=3000), cv=3)
    return Pipeline([("features", feats), ("clf", clf)])


class E5Features:
    """Optional: multilingual-e5-small embeddings (needs sentence-transformers + model download)."""
    def __init__(self, name="intfloat/multilingual-e5-small"):
        from sentence_transformers import SentenceTransformer
        self.name, self.m = name, SentenceTransformer(name)

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        pre = "query: " if "e5" in self.name else ""
        return self.m.encode([pre + x for x in X], normalize_embeddings=True, batch_size=32)


def group_split(rows, test_frac=0.25, seed=13):
    """Hold out whole phrase groups, stratified per (category, lang bucket)."""
    rng = random.Random(seed)
    by_stratum = defaultdict(set)
    for r in rows:
        by_stratum[(r["category"], r["lang_bucket"])].add(r["phrase_id"])
    test_groups = set()
    for _, groups in sorted(by_stratum.items()):
        g = sorted(groups)
        rng.shuffle(g)
        k = max(1, round(len(g) * test_frac)) if len(g) >= 2 else 0
        test_groups.update(g[:k])
    train = [r for r in rows if r["phrase_id"] not in test_groups]
    test = [r for r in rows if r["phrase_id"] in test_groups]
    return train, test


def per_bucket(rows, preds):
    acc = defaultdict(lambda: [0, 0])
    for r, p in zip(rows, preds):
        b = r.get("lang_bucket") or r.get("language", "other")
        acc[b][0] += int(p == r["category"])
        acc[b][1] += 1
    return {k: {"accuracy": round(c / n, 4), "n": n} for k, (c, n) in sorted(acc.items())}


def train(features="tfidf", corrections: list | None = None, version: str | None = None, quiet=False):
    rows = load_jsonl(DATA / "seed" / "complaints.jsonl")
    train_rows, test_rows = group_split(rows)
    X = [r["text_original"] for r in train_rows] + [r["text_en"] for r in train_rows]
    y = [r["category"] for r in train_rows] * 2
    # Domain glossary augmentation (training only). Any term that occurs inside a human-test sentence is
    # dropped so the hand-written evaluation cannot leak into training.
    human_texts = [normalize(r["text"]) for r in load_jsonl(DATA / "eval" / "human_test.jsonl")]
    lex = json.loads((DATA / "lexicon.json").read_text(encoding="utf-8"))
    lex_used = lex_dropped = 0
    for cat, terms in lex.items():
        if cat not in LABELS:
            continue
        for t in terms:
            if any(normalize(t) in h for h in human_texts):
                lex_dropped += 1
                continue
            X.append(t); y.append(cat); lex_used += 1
    w = [1.0] * len(y)
    n_corr = 0
    for c in corrections or []:            # human routing corrections weighted x3
        X.append(c["text"]); y.append(c["category"]); w.append(3.0); n_corr += 1

    if features in ("e5", "labse"):
        feat = E5Features("intfloat/multilingual-e5-small" if features == "e5" else "sentence-transformers/LaBSE")
        model = Pipeline([("features", feat), ("clf", CalibratedClassifierCV(
            LogisticRegression(C=4.0, class_weight="balanced", max_iter=3000), cv=3))])
        emb_name = feat.name
    else:
        model = make_tfidf_pipeline()
        emb_name = "tfidf-char2-5+word1-2"
    model.fit(X, y, clf__sample_weight=np.array(w))

    def evaluate(rs, key):
        texts = [r[key] for r in rs]
        pred = list(model.predict(texts))
        return pred

    pred_syn = evaluate(test_rows, "text_original")
    y_syn = [r["category"] for r in test_rows]
    labels = [l for l in LABELS if l in set(y) | set(y_syn)]
    cm = confusion_matrix(y_syn, pred_syn, labels=labels).tolist()
    human = load_jsonl(DATA / "eval" / "human_test.jsonl")
    pred_h = evaluate(human, "text")
    y_h = [r["category"] for r in human]

    version = version or datetime.now(timezone.utc).strftime("v%Y%m%d-%H%M%S")
    metrics = {
        "model_version": version,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "embedding_model": emb_name,
        "algorithm": "LogisticRegression(class_weight=balanced) + CalibratedClassifierCV(cv=3)",
        "split": "group split by phrase_id (no phrase shared between train and test)",
        "dataset": "synthetic template dataset (ml/generate_dataset.py); see limitations",
        "n_train": len(X), "n_test": len(test_rows), "corrections_used": n_corr,
        "lexicon_terms_used": lex_used, "lexicon_terms_dropped_overlap_with_human_test": lex_dropped,
        "accuracy": round(accuracy_score(y_syn, pred_syn), 4),
        "macro_f1": round(f1_score(y_syn, pred_syn, average="macro", labels=labels, zero_division=0), 4),
        "per_language": per_bucket(test_rows, pred_syn),
        "per_class": {k: {kk: round(vv, 4) for kk, vv in v.items()} for k, v in classification_report(
            y_syn, pred_syn, labels=labels, output_dict=True, zero_division=0).items() if k in labels},
        "human_test": {"accuracy": round(accuracy_score(y_h, pred_h), 4),
                       "macro_f1": round(f1_score(y_h, pred_h, average="macro", zero_division=0), 4),
                       "n": len(human), "per_language": per_bucket(human, pred_h),
                       "errors": [{"text": r["text"], "true": t, "pred": p} for r, t, p in zip(human, y_h, pred_h) if t != p]},
        "confusion": {"labels": labels, "matrix": cm},
        "limitations": [
            "Training data is template-generated, not real citizen complaints; synthetic-test accuracy is optimistic.",
            "human_test.jsonl (48 rows) was written independently of the templates but is small; treat per-language numbers as indicative.",
            "Replace/extend with the team's own human-written complaints and LLM-generated data when keys are available.",
        ],
    }
    MODELS.mkdir(parents=True, exist_ok=True)
    return model, metrics


def save(model, metrics):
    joblib.dump(model, MODELS / "classifier.joblib")
    (MODELS / "labels.json").write_text(json.dumps(metrics["confusion"]["labels"]))
    hist_path = MODELS / "metrics.json"
    history = []
    if hist_path.exists():
        try:
            old = json.loads(hist_path.read_text())
            history = old.get("history", []) + [{k: old[k] for k in ("model_version", "accuracy", "macro_f1", "trained_at")}
                                                | {"corrections_used": old.get("corrections_used", 0)}]
        except Exception:
            history = []
    metrics["history"] = history[-20:]
    hist_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", default="tfidf", choices=["tfidf", "e5", "labse", "benchmark"])
    ap.add_argument("--corrections", default=None)
    a = ap.parse_args()
    corr = load_jsonl(Path(a.corrections)) if a.corrections else None
    if a.features == "benchmark":   # Spec B §7.3: e5-small vs LaBSE (+ our TF-IDF baseline); keep the best, log all
        results = {}
        for f in ("tfidf", "e5", "labse"):
            try:
                results[f] = train(f, corr)
                print(f"{f:6s} synthetic acc={results[f][1]['accuracy']} human acc={results[f][1]['human_test']['accuracy']}")
            except Exception as e:
                print(f"{f:6s} unavailable: {type(e).__name__}: {e}")
        best = max(results, key=lambda k: results[k][1]["macro_f1"])
        print("best:", best)
        model, m = results[best]
    else:
        model, m = train(a.features, corr)
    save(model, m)
    print(f"model {m['model_version']}  features={m['embedding_model']}  n_train={m['n_train']} n_test={m['n_test']}")
    print(f"synthetic held-out (unseen phrases): accuracy={m['accuracy']}  macro_f1={m['macro_f1']}")
    print(f"human-written test (n={m['human_test']['n']}): accuracy={m['human_test']['accuracy']}  macro_f1={m['human_test']['macro_f1']}")
    print("per-language (synthetic):", json.dumps(m["per_language"]))
    print("per-language (human):", json.dumps(m["human_test"]["per_language"]))
    print("per-class F1:", {k: v["f1-score"] for k, v in m["per_class"].items()})
    print(f"human-test errors ({len(m['human_test']['errors'])}):")
    for e in m["human_test"]["errors"]:
        print(f"  {e['true']:>13} -> {e['pred']:<13} {e['text'][:70]}")


if __name__ == "__main__":
    sys.exit(main())
