"""Duplicate candidates (Spec B §6.1): semantic/lexical similarity + distance + time + category.
score = 0.6·text + 0.25·(1 − d/500) + 0.15·[same category]; strong match >= threshold. `text` is the cosine, except that e5
cosines sit near 0.8 even for unrelated civic complaints, so there it is rescaled from COSINE_BASE up to 1.
Matches are SUGGESTIONS: the citizen (support_existing / file_new_anyway) or an officer (bulk merge)
confirms — nothing is merged automatically."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core import clock
from ..ml import embeddings
from ..models import Grievance
from ..refdata import haversine_m

RADIUS_M = 500
WINDOW_DAYS = 30
# Tuned by ml/tune_thresholds.py. Semantic: labelled pairs from the dataset; lexical: story clusters.
STRONG = {"semantic": 0.48, "lexical": 0.54}
COSINE_BASE = {"semantic": 0.80, "lexical": 0.0}
RELATED = {"roads": {"drainage", "traffic"}, "drainage": {"roads", "water", "health"}, "water": {"drainage", "health"},
           "power": {"streetlights"}, "streetlights": {"power"}, "sanitation": {"health", "drainage"},
           "health": {"sanitation", "drainage", "water"}}


def score(cos: float, distance_m: float, same_category: bool, mode: str) -> float:
    base = COSINE_BASE[mode]
    text = max(0.0, (cos - base) / (1 - base))
    return 0.6 * text + 0.25 * (1 - distance_m / RADIUS_M) + 0.15 * same_category


def find(db: Session, embedding: list[float], lat: float | None, lng: float | None, category: str,
         exclude_id: str | None = None, limit: int = 3, strong_only: bool = False) -> list[dict]:
    if lat is None or lng is None or not embedding:
        return []
    now = clock.now()
    cats = {category} | RELATED.get(category, set())
    # Coarse bbox prefilter (~0.006° ≈ 650 m) before exact haversine — PostGIS ST_DWithin on Postgres deployments.
    q = select(Grievance).where(Grievance.category.in_(cats), Grievance.status.not_in(["rejected", "merged"]),
                                Grievance.created_at >= now - timedelta(days=WINDOW_DAYS),
                                Grievance.lat.between(lat - 0.006, lat + 0.006), Grievance.lng.between(lng - 0.006, lng + 0.006))
    mode = embeddings.mode()
    out = []
    for g in db.execute(q).scalars():
        if g.id == exclude_id:
            continue
        if g.closed_at and g.closed_at < now - timedelta(days=7):
            continue
        d = haversine_m(lat, lng, g.lat, g.lng)
        if d > RADIUS_M:
            continue
        if g.embedding_kind and g.embedding_kind != mode:
            continue  # vectors from a different embedding space are not comparable
        cos = embeddings.cosine(embedding, g.embedding)
        total = score(cos, d, g.category == category, mode)
        strong = total >= STRONG[mode]
        if strong_only and not strong:
            continue
        out.append({"grievance_id": g.id, "incident_id": g.incident_id, "title": {"lang": g.language, **(g.title or {})},
                    "similarity": round(total, 3), "distance_m": round(d), "support_count": g.support_count,
                    "status": g.status, "created_at": clock.iso(g.created_at), "language": g.language,
                    "strong": strong,
                    "signals": {"text_cosine": round(cos, 3), "distance_m": round(d), "same_category": g.category == category,
                                "age_days": round((now - g.created_at).total_seconds() / 86400, 1), "embedding_mode": mode}})
    out.sort(key=lambda x: -x["similarity"])
    out = out[:limit]
    for m in out:    # "N people affected": a member of an incident speaks for the whole incident
        if m["incident_id"]:
            m["support_count"] = db.scalar(select(func.sum(Grievance.support_count)).where(
                Grievance.incident_id == m["incident_id"], Grievance.status != "merged")) or m["support_count"]
    return out
