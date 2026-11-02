"""Evaluate the saved classifier on the frozen synthetic group-split test set and the human-written test set.
Prints accuracy, macro-F1, per-class P/R/F1, per-language accuracy (incl. code_mixed) and the confusion matrix.
Usage: python ml/evaluate.py"""
import json
import sys
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "services" / "api"))
from train_classifier import LABELS, group_split, load_jsonl, per_bucket  # noqa: E402


def main():
    model = joblib.load(ROOT / "ml" / "models" / "classifier.joblib")
    rows = load_jsonl(ROOT / "data" / "seed" / "complaints.jsonl")
    _, test = group_split(rows)
    human = load_jsonl(ROOT / "data" / "eval" / "human_test.jsonl")
    for name, rs, key in (("synthetic (unseen phrases)", test, "text_original"), ("human-written", human, "text")):
        y = [r["category"] for r in rs]
        p = list(model.predict([r[key] for r in rs]))
        labels = [l for l in LABELS if l in set(y) | set(p)]
        print(f"\n=== {name}: n={len(rs)} accuracy={accuracy_score(y, p):.4f} macro_f1={f1_score(y, p, average='macro', labels=labels, zero_division=0):.4f}")
        print(classification_report(y, p, labels=labels, digits=3, zero_division=0))
        print("per-language:", json.dumps(per_bucket(rs, p)))
        print("confusion (rows=true):", labels)
        for l, row in zip(labels, confusion_matrix(y, p, labels=labels)):
            print(f"  {l:>13} {' '.join(f'{v:3d}' for v in row)}")


if __name__ == "__main__":
    main()
