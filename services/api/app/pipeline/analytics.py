"""Analytics computed from persisted grievances only (Spec B §9): KPIs, department score, trends,
breakdowns, map points, spike detection, insights with a numbers guard."""
import random
import re
import statistics
from collections import Counter, defaultdict
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import clock
from ..models import Grievance

OPEN = ("registered", "needs_review", "assigned", "in_progress", "reopened")


def _rows(db: Session, days: int | None, start=None, end=None, public=False):
    q = select(Grievance)
    now = clock.now()
    if days:
        q = q.where(Grievance.created_at >= (start or now - timedelta(days=days)), Grievance.created_at < (end or now + timedelta(seconds=1)))
    if public:
        q = q.where(Grievance.is_private.is_(False))
    return list(db.execute(q).scalars())


def _res_h(g):
    return (g.resolved_at - g.created_at).total_seconds() / 3600 if g.resolved_at else None


def _kpi(rows, now):
    resolved = [g for g in rows if g.resolved_at]
    closed = [g for g in rows if g.status == "closed"]
    rh = [_res_h(g) for g in resolved]
    fr = [(g.first_response_at - g.created_at).total_seconds() / 3600 for g in rows if g.first_response_at]
    within = [g for g in resolved if g.resolved_at <= g.sla_due_at]
    rated = [g.rating for g in rows if g.rating]
    return {
        "total": len(rows), "open": sum(g.status in OPEN for g in rows), "resolved": len(resolved),
        "overdue": sum(g.status in OPEN and g.sla_due_at < now for g in rows),
        "critical_open": sum(g.status in OPEN and g.priority == "critical" for g in rows),
        "avg_resolution_hours": round(statistics.mean(rh), 1) if rh else 0.0,
        "avg_first_response_hours": round(statistics.mean(fr), 1) if fr else 0.0,
        "sla_compliance_pct": round(100 * len(within) / len(resolved), 1) if resolved else 0.0,
        "satisfaction_avg": round(statistics.mean(rated), 2) if rated else 0.0,
        "reopened_pct": round(100 * sum(g.reopen_count > 0 for g in rows) / len(rows), 1) if rows else 0.0,
        "needs_review": sum(g.status == "needs_review" for g in rows),
        "_closed": len(closed),
    }


def kpis(db: Session, days: int = 30) -> dict:
    now = clock.now()
    cur = _kpi(_rows(db, days), now)
    prev = _kpi(_rows(db, days, start=now - timedelta(days=2 * days), end=now - timedelta(days=days)), now)
    cur.pop("_closed")
    cur["deltas"] = {k: round(cur[k] - prev[k], 1) for k in ("total", "open", "resolved", "overdue", "sla_compliance_pct", "avg_resolution_hours")}
    return cur


def department_performance(db: Session, days: int = 30) -> list[dict]:
    now = clock.now()
    by = defaultdict(list)
    for g in _rows(db, days):
        by[g.category].append(g)
    all_h = [h for g in _rows(db, days) if (h := _res_h(g)) is not None]
    med_all = statistics.median(all_h) if all_h else 0
    out = []
    for dep, rows in by.items():
        k = _kpi(rows, now)
        hs = [h for g in rows if (h := _res_h(g)) is not None]
        med = statistics.median(hs) if hs else 0
        speed = 100 * max(0.0, min(1.0, med_all / med)) if med else 0
        reopen_rate = k["reopened_pct"]
        score = 0.4 * k["sla_compliance_pct"] + 0.3 * (k["satisfaction_avg"] / 5 * 100) + 0.2 * (100 - reopen_rate) + 0.1 * speed
        out.append({"department_id": dep, "total": k["total"], "open": k["open"], "resolved": k["resolved"],
                    "overdue": k["overdue"], "avg_resolution_hours": k["avg_resolution_hours"],
                    "sla_compliance_pct": k["sla_compliance_pct"], "satisfaction_avg": k["satisfaction_avg"],
                    "reopen_rate": reopen_rate, "score": round(score, 1)})
    out.sort(key=lambda x: -x["score"])
    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out


def trends(db: Session, days: int = 30, group: str = "day", public=False) -> list[dict]:
    now = clock.now()
    rows = _rows(db, days, public=public)
    created, resolved, bycat = Counter(), Counter(), defaultdict(Counter)

    def key(dt):
        d = dt.date()
        if group == "week":
            d = d - timedelta(days=d.weekday())
        return d.isoformat()
    for g in rows:
        created[key(g.created_at)] += 1
        bycat[key(g.created_at)][g.category] += 1
        if g.resolved_at:
            resolved[key(g.resolved_at)] += 1
    out, d = [], (now - timedelta(days=days - 1)).date()
    seen = set()
    while d <= now.date():
        k = key(clock.now().replace(year=d.year, month=d.month, day=d.day))
        if k not in seen:
            seen.add(k)
            out.append({"date": k, "created": created[k], "resolved": resolved[k], "by_category": dict(bycat[k])})
        d += timedelta(days=1)
    return out


def breakdown(db: Session, by: str = "ward", days: int = 30) -> list[dict]:
    now = clock.now()
    from ..refdata import department, ward
    groups = defaultdict(list)
    for g in _rows(db, days):
        k = {"ward": g.ward_id, "zone": g.zone, "category": g.category, "priority": g.priority}.get(by) or "unknown"
        groups[k].append(g)
    out = []
    for k, rows in groups.items():
        label = (ward(k) or {}).get("name", k) if by == "ward" else department(k)["name"]["en"] if by == "category" else k
        hs = [h for g in rows if (h := _res_h(g)) is not None]
        out.append({"key": k, "label": label, "total": len(rows), "open": sum(g.status in OPEN for g in rows),
                    "overdue": sum(g.status in OPEN and g.sla_due_at < now for g in rows),
                    "avg_resolution_hours": round(statistics.mean(hs), 1) if hs else 0.0})
    return sorted(out, key=lambda x: -x["total"])


def map_points(db: Session, days=30, category=None, status=None, priority=None, public=False) -> list[dict]:
    pts = []
    rng = random.Random(42)
    for g in _rows(db, days, public=public):
        if g.lat is None or (category and g.category != category) or (status and g.status != status) or (priority and g.priority != priority):
            continue
        p = {"lat": g.lat, "lng": g.lng, "category": g.category, "priority": g.priority, "status": g.status}
        if public:   # jitter up to ~75 m, no ids, no text
            p["lat"] += rng.uniform(-0.00068, 0.00068)
            p["lng"] += rng.uniform(-0.00068, 0.00068)
        else:
            p["id"] = g.id
            if g.incident_id:
                p["incident_id"] = g.incident_id
        pts.append(p)
    return pts


def scan_spikes(db: Session) -> int:
    """Spike if count_24h >= max(5, μ + 3σ) of the previous 28 daily counts, per (category, ward) and citywide."""
    from .workflow import alert
    now = clock.now()
    rows = _rows(db, 29)
    made = 0
    groups = defaultdict(list)
    for g in rows:
        groups[(g.category, g.ward_id)].append(g)
        groups[(g.category, None)].append(g)
    for (cat, wid), gs in groups.items():
        last = [g for g in gs if g.created_at >= now - timedelta(hours=24)]
        daily = Counter(int((now - g.created_at).total_seconds() // 86400) for g in gs if g.created_at < now - timedelta(hours=24))
        counts = [daily.get(d, 0) for d in range(1, 29)]
        mu, sd = statistics.mean(counts), statistics.pstdev(counts)
        if len(last) >= max(5, mu + 3 * sd):
            langs = sorted({g.language for g in last})
            where = wid or "citywide"
            alert(db, "spike", "critical" if len(last) >= 10 else "warning",
                  f"Spike: {len(last)} {cat} complaints in 24 h ({where})",
                  f"Baseline {mu:.1f}/day (σ {sd:.1f}). Languages: {', '.join(langs)}.",
                  [g.id for g in last[:3]], f"spike:{cat}:{where}:{now.date()}", wid, cat)
            made += 1
    return made


def insight_stats(db: Session, days: int = 30) -> dict:
    k = kpis(db, days)
    perf = department_performance(db, days)
    stats = {f"{x}": k[x] for x in ("total", "open", "resolved", "overdue", "sla_compliance_pct", "avg_resolution_hours", "needs_review")}
    if perf:
        stats["best_department"], stats["best_score"] = perf[0]["department_id"], perf[0]["score"]
        stats["worst_department"], stats["worst_score"] = perf[-1]["department_id"], perf[-1]["score"]
    return stats


def numbers_ok(bullets: list[str], stats: dict) -> bool:
    allowed = {str(v) for v in stats.values()} | {str(int(v)) for v in stats.values() if isinstance(v, (int, float))}
    for b in bullets:
        for n in re.findall(r"\d+(?:\.\d+)?", b):
            if n not in allowed:
                return False
    return True


def template_insights(s: dict) -> list[str]:
    out = [f"{s['total']} grievances were filed in the period; {s['open']} remain open and {s['overdue']} are overdue.",
           f"SLA compliance is {s['sla_compliance_pct']}% with an average resolution time of {s['avg_resolution_hours']} hours.",
           f"{s['needs_review']} grievances are waiting for human routing review."]
    if "best_department" in s:
        out.append(f"Best performing department: {s['best_department']} (score {s['best_score']}); "
                   f"lowest: {s['worst_department']} (score {s['worst_score']}).")
    return out
