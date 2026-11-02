"""Reference data loaded from data/*.json (departments, wards, SLA, keywords, contacts)."""
import json
import math
from functools import lru_cache

from .core.config import DATA_DIR

DEPARTMENT_IDS = ["roads", "sanitation", "water", "streetlights", "power", "drainage",
                  "traffic", "health", "education", "town_planning", "other"]


def _load(name):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@lru_cache
def departments() -> list[dict]:
    qs = _load("field_questions.json")
    out = []
    for d in _load("departments.json"):
        d = dict(d)
        d["required_fields"] = [{"key": k, "label_en": qs[k]["label_en"], "question": qs[k]["question"]}
                                for k in d["required_fields"]]
        out.append(d)
    return out


def department(dep_id: str) -> dict:
    return next((d for d in departments() if d["id"] == dep_id), departments()[-1])


@lru_cache
def wards() -> list[dict]:
    return _load("geo/localities.json")


def ward(ward_id: str | None) -> dict | None:
    return next((w for w in wards() if w["id"] == ward_id), None)


@lru_cache
def sla_config() -> dict:
    return _load("sla.json")


@lru_cache
def emergency_keywords() -> dict:
    return _load("emergency_keywords.json")


@lru_cache
def emergency_contacts() -> list[dict]:
    return _load("emergency_contacts.json")


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


BBOX = (17.30, 78.29, 17.56, 78.60)


def ward_for_point(lat: float, lng: float) -> dict | None:
    """Nearest-centroid lookup == membership in the Voronoi cell of that centroid
    (the demo ward polygons are Voronoi cells of these centroids)."""
    if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]):
        return None
    return min(wards(), key=lambda w: haversine_m(lat, lng, w["lat"], w["lng"]))


def ward_by_mention(text: str) -> dict | None:
    t = (text or "").lower()
    best = None
    for w in wards():
        if w["name"].lower() in t:
            if best is None or len(w["name"]) > len(best["name"]):
                best = w
    return best


def wards_geojson() -> dict:
    """Voronoi polygons clipped to the demo bounding box (scipy if present, else centroid points)."""
    feats = []
    try:
        import numpy as np
        from scipy.spatial import Voronoi
        pts = np.array([[w["lng"], w["lat"]] for w in wards()])
        far = [[BBOX[1] - 5, BBOX[0] - 5], [BBOX[3] + 5, BBOX[0] - 5], [BBOX[1] - 5, BBOX[2] + 5], [BBOX[3] + 5, BBOX[2] + 5]]
        vor = Voronoi(np.vstack([pts, far]))
        for i, w in enumerate(wards()):
            region = vor.regions[vor.point_region[i]]
            poly = [list(vor.vertices[j]) for j in region if j != -1]
            poly = _clip_box(poly)
            if poly:
                poly.append(poly[0])
                feats.append({"type": "Feature", "properties": {"id": w["id"], "name": w["name"], "zone": w["zone"],
                              "note": "Approximate demo boundaries"},
                              "geometry": {"type": "Polygon", "coordinates": [poly]}})
    except Exception:
        feats = [{"type": "Feature", "properties": {"id": w["id"], "name": w["name"], "zone": w["zone"],
                  "note": "Approximate demo boundaries"},
                  "geometry": {"type": "Point", "coordinates": [w["lng"], w["lat"]]}} for w in wards()]
    return {"type": "FeatureCollection", "features": feats}


def _clip_box(poly):
    """Sutherland–Hodgman clip of a convex polygon to the bbox (lng/lat)."""
    import math as _m
    if len(poly) < 3:
        return poly
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    poly = sorted(poly, key=lambda p: _m.atan2(p[1] - cy, p[0] - cx))
    lo_x, lo_y, hi_x, hi_y = BBOX[1], BBOX[0], BBOX[3], BBOX[2]
    edges = [(lambda p: p[0] >= lo_x, lambda a, b: _ix(a, b, 0, lo_x)),
             (lambda p: p[0] <= hi_x, lambda a, b: _ix(a, b, 0, hi_x)),
             (lambda p: p[1] >= lo_y, lambda a, b: _ix(a, b, 1, lo_y)),
             (lambda p: p[1] <= hi_y, lambda a, b: _ix(a, b, 1, hi_y))]
    out = poly
    for inside, inter in edges:
        inp, out = out, []
        for i, cur in enumerate(inp):
            prev = inp[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
    return [[round(x, 6), round(y, 6)] for x, y in out]


def _ix(a, b, axis, val):
    t = (val - a[axis]) / ((b[axis] - a[axis]) or 1e-12)
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
