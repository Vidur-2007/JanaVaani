"""Duplicate candidates (Spec B §6.1): semantic/lexical similarity + distance + time + category.
score = 0.6·cosine + 0.25·(1 − d/500) + 0.15·[same category]; strong match >= threshold.
Matches are SUGGESTIONS: the citizen (support_existing / file_new_anyway) or an officer (bulk merge)
confirms — nothing is merged automatically."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import clock
from ..ml import embeddings
from ..models import Grievance
from ..refdata import haversine_m

RADIUS_M = 500
WINDOW_DAYS = 30
# Thresholds per embedding mode (lexical char-ngram cosines run lower than e5 cosines).
STRONG = {"semantic": 0.78, "lexical": 0.54}   # lexical tuned in P6 (ml/tune_thresholds.py): best F1 0.984 on story clusters
RELATED = {"roads": {"drainage", "traffic"}, "drainage": {"roads", "water", "health"}, "water": {"drainage", "health"},
           "power": {"streetlights"}, "streetlights": {"power"}, "sanitation": {"health", "drainage"},
           "health": {"sanitation", "drainage", "water"}}


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
        score = 0.6 * cos + 0.25 * (1 - d / RADIUS_M) + 0.15 * (g.category == category)
        strong = score >= STRONG[mode]
        if strong_only and not strong:
            continue
        out.append({"grievance_id": g.id, "incident_id": g.incident_id, "title": g.title,
                    "similarity": round(score, 3), "distance_m": round(d), "support_count": g.support_count,
                    "status": g.status, "created_at": clock.iso(g.created_at), "language": g.language,
                    "strong": strong,
                    "signals": {"text_cosine": round(cos, 3), "distance_m": round(d), "same_category": g.category == category,
                                "age_days": round((now - g.created_at).total_seconds() / 86400, 1), "embedding_mode": mode}})
    out.sort(key=lambda x: -x["similarity"])
    return out[:limit]
