"""#20–#27 meta + public endpoints and #57 /health."""
import statistics
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .. import __version__
from ..ai import gateway
from ..core import clock
from ..core.db import get_db
from ..core.errors import err
from ..core.ratelimit import limiter
from ..ml import classifier, embeddings
from ..models import Asset, Grievance, Media
from ..pipeline import analytics
from ..refdata import department, departments, emergency_contacts, haversine_m, wards, wards_geojson

router = APIRouter()
_cache: dict[str, tuple[float, object]] = {}


def cached(key: str, ttl: float, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


@router.get("/health")
def health(db: Session = Depends(get_db)):
    def compute():
        try:
            db.execute(text("select 1"))
            dbs = "ok"
        except Exception:
            dbs = "down"
        return {"status": "ok" if dbs == "ok" and classifier.available() else "degraded", "version": __version__,
                "providers": {**gateway.status(), "db": dbs,
                              "embeddings": embeddings.mode() if embeddings._mode else "not_loaded",
                              "classifier": "loaded" if classifier.available() else "missing"}}
    return cached("health", 60, compute)


@router.get("/meta/departments")
def meta_departments():
    return departments()


@router.get("/meta/wards")
def meta_wards():
    return [{"id": w["id"], "name": w["name"], "zone": w["zone"], "centroid": {"lat": w["lat"], "lng": w["lng"]}} for w in wards()]


@router.get("/meta/wards.geojson")
def meta_wards_geojson():
    from ..core.config import DATA_DIR
    import json
    p = DATA_DIR / "geo" / "wards.geojson"
    return json.loads(p.read_text()) if p.exists() else wards_geojson()


@router.get("/meta/emergency-contacts")
def meta_contacts():
    return emergency_contacts()


@router.get("/meta/assets/{asset_id}")
def meta_asset(asset_id: str, db: Session = Depends(get_db)):
    a = db.get(Asset, asset_id)
    if not a:
        raise err(404, "not_found", "Asset not found.")
    gs = db.execute(select(Grievance).where(Grievance.asset_id == a.id).order_by(Grievance.created_at.desc())).scalars().all()
    return {"id": a.id, "type": a.type, "label_en": a.label_en, "ward_id": a.ward_id, "location": {"lat": a.lat, "lng": a.lng},
            "open_grievance_ids": [g.id for g in gs if g.status in analytics.OPEN and not g.is_private],
            "history": [{"grievance_id": g.id, "category": g.category, "created_at": clock.iso(g.created_at),
                         "closed_at": clock.iso(g.closed_at)} for g in gs if not g.is_private]}


# ---------------- public (#25–#27): aggregates only, private excluded ----------------
@router.get("/public/stats")
@limiter.limit("120/minute")
def public_stats(request: Request, db: Session = Depends(get_db)):
    def compute():
        rows = [g for g in db.execute(select(Grievance).where(Grievance.is_private.is_(False))).scalars()]
        res = [g for g in rows if g.resolved_at]
        hrs = [(g.resolved_at - g.created_at).total_seconds() / 3600 for g in res]
        by_d, by_z = defaultdict(list), defaultdict(list)
        for g in rows:
            by_d[g.category].append(g)
            by_z[g.zone or "Unknown"].append(g)

        def pct(gs):
            return round(100 * sum(1 for g in gs if g.resolved_at) / len(gs), 1) if gs else 0.0
        recent = []
        for g in sorted((g for g in res if g.rating and g.rating >= 4 and g.status == "closed"), key=lambda g: g.resolved_at, reverse=True)[:6]:
            proof = next((m for m in g.media if m.purpose == "resolution_proof"), None)
            recent.append({"title_en": (g.title or {}).get("en") or g.summary_en[:80], "category": g.category,
                           "zone": g.zone or "", "after_url": f"/api/v1/uploads/{proof.id}" if proof else None,
                           "resolved_at": clock.iso(g.resolved_at)})   # proof photos only, never citizen photos
        return {"total": len(rows), "resolved": len(res), "resolution_rate_pct": pct(rows),
                "avg_resolution_hours": round(statistics.mean(hrs), 1) if hrs else 0.0,
                "by_department": [{"department_id": d, "total": len(gs), "resolved_pct": pct(gs),
                                   "avg_resolution_hours": round(statistics.mean([(g.resolved_at - g.created_at).total_seconds() / 3600 for g in gs if g.resolved_at] or [0]), 1)}
                                  for d, gs in sorted(by_d.items())],
                "by_zone": [{"zone": z, "total": len(gs), "resolved_pct": pct(gs)} for z, gs in sorted(by_z.items())],
                "trend": analytics.trends(db, 30, "day", public=True), "recent_resolved": recent}
    return cached("public_stats", 60, compute)


@router.get("/public/map")
@limiter.limit("120/minute")
def public_map(request: Request, category: str | None = None, days: int = 90, db: Session = Depends(get_db)):
    return cached(f"pmap:{category}:{days}", 60, lambda: analytics.map_points(db, days, category=category, public=True))


@router.get("/public/nearby")
@limiter.limit("120/minute")
def public_nearby(request: Request, lat: float, lng: float, radius_m: int = 1000, db: Session = Depends(get_db)):
    radius_m = max(50, min(radius_m, 5000))
    d = radius_m / 111000
    q = select(Grievance).where(Grievance.is_private.is_(False), Grievance.status.in_(analytics.OPEN),
                                Grievance.lat.between(lat - d, lat + d), Grievance.lng.between(lng - d * 1.1, lng + d * 1.1))
    out = []
    for g in db.execute(q).scalars():
        dist = haversine_m(lat, lng, g.lat, g.lng)
        if dist <= radius_m:
            out.append({"title": {**(g.title or {}), "lang": g.language}, "category": g.category, "status": g.status,
                        "distance_m": round(dist), "support_count": g.support_count, "grievance_id": g.id})
    return sorted(out, key=lambda x: x["distance_m"])[:50]
