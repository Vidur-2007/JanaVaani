"""P6 evaluation hardening (Spec B §7.5):
1. Emergency keyword precision/recall on every seed row (label: urgency == critical or an emergency hazard).
2. Routing-confidence bands vs accuracy on the frozen synthetic test split (classifier-only confidence).
3. Duplicate threshold that maximises F1 on the seeded story clusters (Miyapur potholes, Charminar water) vs
   nearby non-story grievances. Requires a seeded DB (python ml/seed_db.py).
4. Semantic duplicate threshold on labelled pairs from the dataset (needs the embedding model): same category + sub-department
   vs a different sub-department in the same or a related category, on the English text the live pipeline embeds.
Usage: python ml/tune_thresholds.py"""
import json
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))
sys.path.insert(0, str(ROOT / "ml"))

from app.ml import classifier, embeddings  # noqa: E402
from app.pipeline import safety  # noqa: E402
from train_classifier import group_split, load_jsonl  # noqa: E402

# Keyword-emergency label = the spec's emergency hazard types. collapse_risk (bent poles, leaking roofs) and contaminated
# water are high/critical PRIORITY cases handled by the priority score, not keyword emergencies.
EMERGENCY_HAZARDS = {"live_wire", "fire", "gas_leak", "flooding", "open_manhole"}


def emergency_precision(rows):
    tp = fp = fn = tn = 0
    errs = []
    for r in rows:
        truth = bool(set(r.get("hazards", [])) & EMERGENCY_HAZARDS)
        pred = safety.detect_emergency(r["text_original"])["is_emergency"]
        tp += truth and pred; fp += pred and not truth; fn += truth and not pred; tn += not truth and not pred
        if truth != pred and len(errs) < 12:
            errs.append(("FP" if pred else "FN", r["text_original"][:70]))
    p = tp / (tp + fp) if tp + fp else 0
    rc = tp / (tp + fn) if tp + fn else 0
    return {"precision": round(p, 3), "recall": round(rc, 3), "tp": tp, "fp": fp, "fn": fn, "tn": tn, "examples": errs}


def routing_bands(rows):
    _, test = group_split(rows)
    bands = Counter(), Counter()
    for r in test:
        p = classifier.predict(r["text_original"])
        b = "auto (>=0.75)" if p["confidence"] >= 0.75 else "flagged (0.50-0.75)" if p["confidence"] >= 0.5 else "review (<0.50)"
        bands[0][b] += 1
        bands[1][b] += p["department"] == r["category"]
    return {b: {"n": bands[0][b], "accuracy": round(bands[1][b] / bands[0][b], 3)} for b in bands[0]}


def duplicate_threshold():
    from sqlalchemy import select

    from app.core.db import session_scope
    from app.models import Grievance
    from app.pipeline import duplicates
    with session_scope() as db:
        gs = db.execute(select(Grievance).where(Grievance.ward_id.in_(["W-SLP-04", "W-CHR-01", "W-CHR-02"]))).scalars().all()
        pairs = []
        for g in gs:
            if g.lat is None:
                continue
            story = "pothole" if g.incident_id and g.incident_id.endswith("MYP001") else None
            for c in duplicates.find(db, g.embedding, g.lat, g.lng, g.category, exclude_id=g.id, limit=10):
                other = db.get(Grievance, c["grievance_id"])
                same = (story == "pothole" and other.incident_id == g.incident_id) or \
                       (g.category == other.category == "water" and g.sub_department == other.sub_department == "contamination")
                pairs.append((c["similarity"], same))
    best = (0, None)
    table = []
    for t in [x / 100 for x in range(40, 95, 2)]:
        tp = sum(s >= t and y for s, y in pairs); fp = sum(s >= t and not y for s, y in pairs)
        fn = sum(s < t and y for s, y in pairs)
        f1 = 2 * tp / (2 * tp + fp + fn) if tp else 0
        table.append((t, round(f1, 3)))
        if f1 > best[0]:
            best = (f1, t)
    return {"mode": embeddings.mode(), "pairs": len(pairs), "positives": sum(y for _, y in pairs),
            "best_threshold": best[1], "best_f1": round(best[0], 3), "curve": table[::3]}


def semantic_duplicate_threshold(rows, n=3000):
    if embeddings.mode() != "semantic":
        return None
    from app.pipeline import duplicates
    rng = random.Random(7)
    by_issue = {}
    for r in rows:
        by_issue.setdefault((r["category"], r.get("sub_department")), []).append(r)
    keys = sorted(by_issue, key=str)
    vec = {t: embeddings.embed(t) for t in {r["text_en"] for r in rows}}
    pairs = []
    for _ in range(n):
        k = rng.choice(keys)
        if len(by_issue[k]) > 1:
            pairs.append((*rng.sample(by_issue[k], 2), True))
        a = rng.choice(rows)
        near = {a["category"]} | duplicates.RELATED.get(a["category"], set())
        other = next((r for r in rng.sample(rows, 60) if r["category"] in near and r.get("sub_department") != a.get("sub_department")), None)
        if other:
            pairs.append((a, other, False))
    scored = [(duplicates.score(embeddings.cosine(vec[a["text_en"]], vec[b["text_en"]]), rng.uniform(0, duplicates.RADIUS_M),
                                a["category"] == b["category"], "semantic"), y) for a, b, y in pairs]
    table = []
    for t in [x / 100 for x in range(30, 95, 2)]:
        tp = sum(s >= t and y for s, y in scored); fp = sum(s >= t and not y for s, y in scored)
        fn = sum(s < t and y for s, y in scored); neg = sum(not y for _, y in scored)
        table.append({"threshold": t, "f1": round(2 * tp / max(1, 2 * tp + fp + fn), 3), "recall": round(tp / max(1, tp + fn), 3),
                      "false_positive_rate": round(fp / max(1, neg), 3)})
    current = min(table, key=lambda r: abs(r["threshold"] - duplicates.STRONG["semantic"]))
    return {"pairs": len(scored), "cosine_base": duplicates.COSINE_BASE["semantic"], "current": current,
            "best": max(table, key=lambda r: r["f1"]), "curve": table[::4]}


def main():
    rows = load_jsonl(ROOT / "data" / "seed" / "complaints.jsonl")
    out = {"emergency_keywords": emergency_precision(rows), "routing_bands": routing_bands(rows),
           "duplicates": duplicate_threshold(), "duplicates_semantic": semantic_duplicate_threshold(rows)}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    (ROOT / "ml" / "models" / "tuning.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
