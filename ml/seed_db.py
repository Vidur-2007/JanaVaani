"""Seed the demo city (Spec B §7.6, master §14–15). Idempotent: wipes demo tables first.

- 7 demo accounts (master §14) + one officer per department per zone (supervisor/admin cover all).
- 200 assets, grievances from data/seed/complaints.jsonl over the last 180 virtual days with a monsoon bump,
  status mix, log-normal resolution times, ratings 3–5, real hash-chained timelines, embeddings.
- Story scenarios: live wire (Kukatpally), Miyapur pothole incident (32 supporters), Charminar/Falaknuma
  contaminated-water spike (last 48 h), suspicious streetlight closure (Ameerpet), Malakpet drainage reopened 3x.
- model_versions v1. Supabase auth users are created via the admin API when SUPABASE_URL + service key are set.
Usage: python ml/seed_db.py [--n 600]
"""
import argparse
import io
import json
import math
import random
import sys
import uuid
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from sqlalchemy import delete, text  # noqa: E402

from app.core import clock, storage  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import create_all, engine, session_scope  # noqa: E402
from app.ml import classifier, embeddings  # noqa: E402
from app.models import (AICall, AlertRow, Appeal, Asset, ChatSession, Grievance, Incident, LiveEvent, Media,  # noqa: E402
                        Message, ModelVersion, Notification, Profile, RoutingCorrection, Setting, Supporter,
                        TimelineEvent)
from app.pipeline import audit, scoring  # noqa: E402
from app.refdata import departments, wards  # noqa: E402

PASSWORD = "Demo@2026"
DEPTS = [d["id"] for d in departments() if d["id"] != "other"]
ZONE_CODE = {"Serilingampally": "SLP", "Kukatpally": "KKP", "Khairatabad": "KHB", "Secunderabad": "SEC", "Charminar": "CHR", "LB Nagar": "LBN"}
DEMO = [
    ("citizen", "lakshmi@janavaani.test", "Lakshmi Devi", "te", None, [], "Kukatpally", None),
    ("citizen", "imran@janavaani.test", "Imran Khan", "ur", None, [], "Charminar", None),
    ("officer", "ravi.roads@janavaani.test", "Ravi Kumar", "en", "roads", ["Kukatpally", "Serilingampally"], "Kukatpally", "AE Roads"),
    ("officer", "sunitha.electrical@janavaani.test", "Sunitha Reddy", "en", "streetlights", ["Kukatpally", "Khairatabad", "Serilingampally"], "Khairatabad", "AE Electrical"),
    ("officer", "farhan.water@janavaani.test", "Farhan Ali", "en", "water", ["Charminar"], "Charminar", "Manager, Water Supply"),
    ("supervisor", "supervisor@janavaani.test", "Deputy Commissioner", "en", None, [], None, "Deputy Commissioner"),
    ("admin", "admin@janavaani.test", "Commissioner's Office", "en", None, [], None, "Commissioner"),
]
FIRST = ["Anil", "Swathi", "Mahesh", "Ayesha", "Srinivas", "Priya", "Kiran", "Sameer", "Divya", "Rahul", "Nazia", "Venkat"]
LAST = ["Rao", "Sharma", "Reddy", "Khan", "Naidu", "Goud", "Siddiqui", "Varma", "Patel", "Chary"]
ASSET_TYPES = {"streetlights": ("streetlight", "SL"), "drainage": ("drain", "DR"), "water": ("water_pipe", "WP"),
               "sanitation": ("bin", "BN"), "roads": ("road_segment", "RD"), "traffic": ("signal", "TS")}
STATUS_MIX = [("closed", .60), ("in_progress", .15), ("assigned", .12), ("resolved_pending_verification", .06),
              ("needs_review", .04), ("reopened", .03)]
RES_MEDIAN_H = {"roads": 70, "sanitation": 30, "water": 36, "streetlights": 50, "power": 20, "drainage": 45, "traffic": 40,
                "health": 60, "education": 90, "town_planning": 140, "other": 100}


def ward_by_name(name):
    return next(w for w in wards() if w["name"] == name)


def jitter(rng, w, m=700):
    r, a = m * math.sqrt(rng.random()), rng.random() * 2 * math.pi
    return w["lat"] + r * math.cos(a) / 111000, w["lng"] + r * math.sin(a) / (111000 * math.cos(math.radians(w["lat"])))


def supabase_user(email, role, name=None):
    """Create (or update) the auth user via the Supabase admin API when configured; else a deterministic local uuid.
    Sets app_metadata.role (server-controlled, read by the frontend before /me) and user_metadata.name/role."""
    s = get_settings()
    key = s.supabase_service_role_key
    if not (s.supabase_url and key):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
    import httpx
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    meta = {"app_metadata": {"role": role}, "user_metadata": {"name": name or email.split("@")[0], "role": role}}
    r = httpx.post(f"{s.supabase_url}/auth/v1/admin/users", headers=h, timeout=20,
                   json={"email": email, "password": PASSWORD, "email_confirm": True, **meta})
    if r.status_code in (200, 201):
        return r.json()["id"]
    lst = httpx.get(f"{s.supabase_url}/auth/v1/admin/users", headers=h, params={"per_page": 1000}, timeout=20).json()
    uid = next(u["id"] for u in lst.get("users", []) if u.get("email") == email)
    httpx.put(f"{s.supabase_url}/auth/v1/admin/users/{uid}", headers=h, timeout=20, json=meta)   # re-seed keeps metadata current
    return uid


def wipe(db):
    if engine.dialect.name == "postgresql":   # the append-only trigger on timeline_events allows this transaction only
        db.execute(text("set local janavaani.allow_tamper = on"))
    for m in (LiveEvent, Notification, AlertRow, RoutingCorrection, AICall, Appeal, Message, ChatSession, Supporter,
              TimelineEvent, Media, Grievance, Incident, Asset, ModelVersion, Profile, Setting):
        db.execute(delete(m))
    if engine.dialect.name == "postgresql":
        db.execute(text("delete from wards"))
        db.execute(text("delete from departments"))


def seed_reference(db):
    if engine.dialect.name != "postgresql":
        return   # SQLite offline mode reads departments/wards from data/*.json
    for d in departments():
        db.execute(text("insert into departments(id, data) values (:i, cast(:d as jsonb))"), {"i": d["id"], "d": json.dumps(d, ensure_ascii=False)})
    gj = json.loads((ROOT / "data" / "geo" / "wards.geojson").read_text())
    for f in gj["features"]:
        w = next(x for x in wards() if x["id"] == f["properties"]["id"])
        db.execute(text("insert into wards(id,name,zone,geom,centroid) values (:i,:n,:z, st_multi(st_setsrid(st_geomfromgeojson(:g),4326)),"
                        " st_setsrid(st_makepoint(:lng,:lat),4326)::geography)"),
                   {"i": w["id"], "n": w["name"], "z": w["zone"], "g": json.dumps(f["geometry"]), "lng": w["lng"], "lat": w["lat"]})


def seed_people(db, rng):
    people = {}
    for role, email, name, lang, dep, zones, home, desig in DEMO:
        wids = [w["id"] for w in wards() if w["zone"] in zones]
        p = Profile(id=supabase_user(email, role, name), role=role, name=name, email=email, preferred_language=lang,
                    department_id=dep, ward_ids=wids, zone=zones[0] if zones else None, designation=desig,
                    office_name=f"GHMC {home} Circle Office" if home else "GHMC Head Office", office_phone=None)
        db.add(p)
        people[email] = p
    covered = {(p.department_id, z) for _, e, _, _, _, zs, _, _ in DEMO for p in [people[e]] if p.department_id for z in zs}
    for zone, code in ZONE_CODE.items():
        for dep in DEPTS:
            if (dep, zone) in covered:
                continue
            nm = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            email = f"{dep}.{code.lower()}@janavaani.test"
            db.add(Profile(id=supabase_user(email, "officer", nm), role="officer", name=nm, email=email, department_id=dep,
                           ward_ids=[w["id"] for w in wards() if w["zone"] == zone], zone=zone,
                           designation=f"AE {dep.replace('_', ' ').title()}", office_name=f"{zone} Zonal Office"))
    db.flush()
    return people


def seed_assets(db, rng, n=200):
    out, i = [], 0
    types = list(ASSET_TYPES.items())
    while i < n:
        w = wards()[i % len(wards())]
        dep, (t, pre) = types[i % len(types)]
        lat, lng = jitter(rng, w, 900)
        a = Asset(id=f"{pre}-{w['id'].split('-')[1]}-{i:04d}", type=t, label_en=f"{t.replace('_', ' ').title()} near {w['name']}",
                  ward_id=w["id"], lat=lat, lng=lng)
        db.add(a)
        out.append((dep, a))
        i += 1
    db.flush()
    return out


def officer_for(db, dep, ward_id):
    from sqlalchemy import select
    offs = db.execute(select(Profile).where(Profile.role == "officer", Profile.department_id == dep)).scalars().all()
    return next((o for o in offs if ward_id in (o.ward_ids or [])), offs[0] if offs else None)


def make_grievance(db, gid, row, created, status, rng, citizen=None, w=None, lat=None, lng=None, support=1, asset=None):
    w = w or next(x for x in wards() if x["id"] == row["ward_id"])
    if lat is None:
        lat, lng = jitter(rng, w)
    cat = row["category"]
    cls = classifier.predict(row["text_original"])
    routing = scoring.route(cls, cat, cat)   # seed history: LLM votes reflect the dataset label
    hz = row.get("hazards", [])
    prio = scoring.priority(row["urgency"], hz, row["urgency"] == "critical", 0.2, [], support)
    off = officer_for(db, cat, w["id"])
    g = Grievance(id=gid, citizen_id=citizen.id if citizen else None, language=row["language"], script=row["script"],
                  is_code_mixed=row["is_code_mixed"], description_original=row["text_original"],
                  description_masked=row["text_original"], description_en=row["text_en"],
                  title={"original": row["text_original"][:60], "en": row["text_en"][:60]},
                  formal_text={"original": row["text_original"], "en": row["text_en"]}, summary_en=row["text_en"],
                  category=cat, sub_department=row.get("sub_department") or None, secondary_departments=[],
                  routing={**routing, "sub_department": row.get("sub_department") or None, "secondary_departments": []},
                  status="registered", priority=prio["level"], priority_score=prio["score"], priority_factors=prio["factors"],
                  priority_base={"urgency": row["urgency"], "hazards": hz, "rule": False, "distress": 0.2, "vulnerable": []},
                  is_emergency=False, hazards=hz, vulnerable=[], sentiment="concerned", distress_score=0.2, lat=lat, lng=lng,
                  location={"lat": lat, "lng": lng, "ward_id": w["id"], "ward_name": w["name"], "zone": w["zone"],
                            "source": "gps", "address": f"{row.get('landmark', '')}, {w['name']}".strip(", ")},
                  ward_id=w["id"], zone=w["zone"], asset_id=asset, sla_hours=prio["sla_hours"],
                  sla_due_at=created + timedelta(hours=prio["sla_hours"]), support_count=support,
                  embedding=embeddings.embed(row["text_en"]), embedding_kind=embeddings.mode(),
                  pipeline_ms=rng.randint(900, 3800), created_at=created, updated_at=created)
    db.add(g)
    db.flush()
    audit.add_event(db, gid, "registered", "Grievance registered", actor_role="citizen" if citizen else "guest", at=created)
    audit.add_event(db, gid, "classified", routing["explanation_en"], actor_role="ai", at=created + timedelta(seconds=3),
                    payload={"department": cat, "confidence": routing["confidence"]})
    t = created + timedelta(seconds=5)
    if status == "needs_review":
        g.status = "needs_review"
        audit.add_event(db, gid, "routing_review", "Sent to human review: low routing confidence", at=t)
        return g
    if off:
        g.assigned_officer_id, g.status = off.id, "assigned"
        audit.add_event(db, gid, "assigned", f"Assigned to {off.name} ({off.designation})", payload={"officer_id": off.id}, at=t)
    if status == "assigned":
        return g
    med = RES_MEDIAN_H[cat]
    fr = created + timedelta(hours=min(med * 0.3, rng.uniform(1, 12)))
    g.first_response_at, g.status = fr, "in_progress"
    audit.add_event(db, gid, "status_changed", "Status assigned → in_progress", actor_role="officer", at=fr, payload={"from": "assigned", "to": "in_progress"})
    if status == "in_progress":
        return g
    res_h = max(2.0, rng.lognormvariate(math.log(med), 0.6))
    res_at = created + timedelta(hours=res_h)
    if res_at >= clock.now():
        return g
    g.resolved_at = res_at
    g.status = "resolved_pending_verification"
    g.ai_verification = {"verdict": "verified", "confidence": 0.8, "reasons_en": ["Seeded history"], "assessment": "likely_resolved",
                         "checks": {"same_location": True, "issue_resolved_visible": True, "duplicate_photo": False, "distance_m": rng.randint(5, 120)},
                         "created_at": clock.iso(res_at)}
    audit.add_event(db, gid, "resolution_submitted", "Resolution submitted: work completed and site cleared", actor_role="officer", at=res_at)
    if status == "reopened":
        g.status, g.reopen_count, g.resolved_at, g.escalation_level = "reopened", 1, None, 1
        audit.add_event(db, gid, "citizen_rejected", "Citizen rejected the resolution", actor_role="citizen", at=res_at + timedelta(hours=6))
        audit.add_event(db, gid, "reopened", "Reopened (count 1)", at=res_at + timedelta(hours=6))
        return g
    if status == "closed":
        verified = rng.random() < 0.85
        close_at = res_at + timedelta(hours=rng.uniform(2, 30) if verified else 168)
        if close_at >= clock.now():
            return g
        g.status, g.closed_at = "closed", close_at
        g.closure_type = "citizen_verified" if verified else "auto_closed_unverified"
        if verified:
            g.rating = rng.choices([3, 4, 5], [2, 4, 4])[0]
            audit.add_event(db, gid, "citizen_verified", f"Citizen confirmed the fix (rating {g.rating})", actor_role="citizen", at=close_at)
        audit.add_event(db, gid, "closed", "Closed", at=close_at)
    return g


class Ids:
    def __init__(self):
        self.n = 0

    def __call__(self):
        self.n += 1
        return f"GRV-{clock.now().year}-{self.n:06d}"


def _img(name, seed, color):
    """Stores a generated WebP; returns (storage_path, phash)."""
    from PIL import Image, ImageDraw
    r = random.Random(seed)
    im = Image.new("RGB", (640, 480), color)
    d = ImageDraw.Draw(im)
    for _ in range(40):
        x, y = r.randint(0, 600), r.randint(0, 440)
        d.rectangle([x, y, x + r.randint(10, 80), y + r.randint(10, 60)], fill=(r.randint(0, 255), r.randint(0, 255), r.randint(0, 255)))
    buf = io.BytesIO()
    im.save(buf, "WEBP")
    import imagehash
    return storage.save(name, buf.getvalue()), str(imagehash.phash(im))


def seed_stories(db, rng, rows, people, nid):
    now = clock.now()
    lak, imr = people["lakshmi@janavaani.test"], people["imran@janavaani.test"]
    by = lambda cat, lang=None: [r for r in rows if r["category"] == cat and (lang is None or r["lang_bucket"] == lang)]
    # 1. live wire near a school (backup of the live demo)
    kk = ward_by_name("Kukatpally")
    row = {"text_original": "మా బడి దగ్గర కరెంటు తీగ తెగి రోడ్డు మీద పడింది, పిల్లలు అటు వెళ్తున్నారు", "language": "te", "script": "native",
           "is_code_mixed": False, "text_en": "A live electric wire has snapped and fallen on the road near our school; children walk there.",
           "category": "power", "sub_department": "sparking lines", "urgency": "critical", "hazards": ["live_wire", "near_school"], "ward_id": kk["id"]}
    g = make_grievance(db, nid(), row, now - timedelta(hours=3), "assigned", rng, citizen=lak, w=kk)
    g.is_emergency, g.vulnerable = True, ["children"]
    g.priority_base = {**g.priority_base, "rule": True, "vulnerable": ["children"]}
    p = scoring.priority("critical", ["live_wire", "near_school"], True, 0.6, ["children"], 1)
    g.priority, g.priority_score, g.priority_factors = p["level"], p["score"], p["factors"]
    audit.add_event(db, g.id, "emergency_flagged", "Emergency keywords detected: కరెంటు తీగ, తీగ తెగి", payload={"story": "live_wire"})
    # 2. Miyapur X Roads pothole cluster: 32 reports in te/hi/en/Tenglish -> one incident
    mi = ward_by_name("Miyapur")
    plat, plng = mi["lat"] + 0.0012, mi["lng"] + 0.0008
    pot = [r for r in by("roads") if r["sub_department"] == "potholes"]
    langs = ["te", "hi", "en", "code_mixed"]
    members = []
    for i in range(8):
        r = dict(next(x for x in pot if x["lang_bucket"] == langs[i % 4] and x not in members), ward_id=mi["id"])
        lat, lng = plat + rng.uniform(-0.0006, 0.0006), plng + rng.uniform(-0.0006, 0.0006)
        members.append(make_grievance(db, nid(), r, now - timedelta(days=rng.uniform(1, 9)), "assigned", rng, w=mi, lat=lat, lng=lng))
    parent = max(members, key=lambda x: x.created_at)
    # Merged members are not duplicate candidates, so the parent must describe the story itself for new reports to find it.
    story_en = "Big pothole on the road at Miyapur X Roads; bikes are falling."
    parent.description_en, parent.summary_en, parent.embedding = story_en, story_en, embeddings.embed(story_en)
    parent.title = {**parent.title, "en": "Big pothole at Miyapur X Roads"}
    inc = Incident(id=f"INC-{now.year}-MYP001", title_en="Pothole cluster at Miyapur X Roads", category="roads", ward_id=mi["id"],
                   lat=plat, lng=plng, status="assigned", created_at=min(m.created_at for m in members))
    db.add(inc)
    db.flush()
    for m in members:
        m.incident_id = inc.id
        if m is not parent:
            m.status = "merged"
            audit.add_event(db, m.id, "merged", f"Merged into {parent.id} (incident {inc.id})")
    parent.support_count = 32
    for k in range(31):
        db.add(Supporter(grievance_id=parent.id, user_key=f"seed:{k}"))
    parent.priority_base = {**parent.priority_base, "urgency": "high", "hazards": ["traffic_danger"]}
    from app.pipeline.workflow import recompute_priority
    recompute_priority(parent)
    audit.add_event(db, parent.id, "support_added", "31 more citizens reported the same pothole (32 total)", payload={"support_count": 32})
    # 3. contaminated water spike (Charminar + Falaknuma), 35 Urdu/Hindi complaints in the last 48 h
    wr = [r for r in by("water") if r["sub_department"] == "contamination" and r["lang_bucket"] in ("ur", "hi", "code_mixed")]
    for i in range(35):
        w = ward_by_name("Charminar" if i % 3 else "Falaknuma")
        hrs = rng.uniform(0.5, 23) if i < 24 else rng.uniform(24, 47)
        make_grievance(db, nid(), {**wr[i % len(wr)], "ward_id": w["id"]}, now - timedelta(hours=hrs), "assigned", rng,
                       citizen=imr if i == 0 else None, w=w)
    # 4. suspicious streetlight closure (Ameerpet): officer re-uploaded the citizen's own photo
    am = ward_by_name("Ameerpet")
    sl = next(r for r in by("streetlights", "en"))
    g4 = make_grievance(db, nid(), {**sl, "ward_id": am["id"]}, now - timedelta(days=4), "in_progress", rng, citizen=lak, w=am)
    photo, ph = _img("seed/streetlight_citizen.webp", 4, (20, 20, 40))
    db.add(Media(id=str(uuid.uuid4()), grievance_id=g4.id, storage_path=photo, uploaded_by_role="citizen",
                 purpose="evidence", quality={"ok": True, "issue": "none"}, phash=ph, geo={"lat": g4.lat, "lng": g4.lng},
                 created_at=g4.created_at))
    db.add(Media(id=str(uuid.uuid4()), grievance_id=g4.id, storage_path=photo, uploaded_by_role="officer",
                 purpose="resolution_proof", quality={"ok": True, "issue": "none"}, phash=ph, created_at=now - timedelta(hours=5)))
    g4.status, g4.resolved_at = "resolved_pending_verification", now - timedelta(hours=5)
    g4.ai_verification = {"verdict": "suspicious", "confidence": 0.9, "assessment": "rejected_evidence",
                          "reasons_en": ["Proof photo is visually identical to the citizen's original photo (perceptual hash distance < 8)."],
                          "checks": {"same_location": None, "issue_resolved_visible": None, "duplicate_photo": True, "distance_m": None},
                          "created_at": clock.iso(now - timedelta(hours=5))}
    audit.add_event(db, g4.id, "resolution_submitted", "Resolution submitted: lamp replaced", actor_role="officer", at=now - timedelta(hours=5))
    audit.add_event(db, g4.id, "ai_verification", "AI verification: suspicious (rejected_evidence)", actor_role="ai", payload=g4.ai_verification, at=now - timedelta(hours=5))
    db.add(AlertRow(kind="suspicious_closure", severity="warning", title_en=f"Suspicious resolution on {g4.id}",
                    detail_en=g4.ai_verification["reasons_en"][0], grievance_ids=[g4.id], dedupe_key=f"susp:{g4.id}:0",
                    ward_id=am["id"], category="streetlights", created_at=now - timedelta(hours=5)))
    # 5. Malakpet drainage reopened 3 times
    mk = ward_by_name("Malakpet")
    dr = next(r for r in by("drainage", "hi") if r["sub_department"] == "overflow")
    g5 = make_grievance(db, nid(), {**dr, "ward_id": mk["id"]}, now - timedelta(days=20), "in_progress", rng, citizen=imr, w=mk)
    for k in range(3):
        t = now - timedelta(days=15 - 4 * k)
        audit.add_event(db, g5.id, "resolution_submitted", f"Resolution submitted: drain cleared (attempt {k + 1})", actor_role="officer", at=t)
        audit.add_event(db, g5.id, "citizen_rejected", "Citizen rejected the resolution: still overflowing", actor_role="citizen", at=t + timedelta(hours=8))
        audit.add_event(db, g5.id, "reopened", f"Reopened (count {k + 1})", at=t + timedelta(hours=8))
    g5.status, g5.reopen_count, g5.escalation_level = "reopened", 3, 2
    db.add(AlertRow(kind="repeated_reopen", severity="warning", title_en=f"{g5.id} reopened 3 times",
                    detail_en="Citizen rejected the resolution 3 times; supervisor review needed.", grievance_ids=[g5.id],
                    dedupe_key=f"reopen:{g5.id}:3", ward_id=mk["id"], category="drainage", created_at=now - timedelta(days=7)))


def main(quick=False, n_grievances=600, seed=2026):
    rng = random.Random(seed)
    create_all()
    classifier.load()
    rows = [json.loads(l) for l in (ROOT / "data" / "seed" / "complaints.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    now = clock.now()
    with session_scope() as db:
        wipe(db)
        seed_reference(db)
        people = seed_people(db, rng)
        assets = seed_assets(db, rng)
        nid = Ids()
        citizens = [people["lakshmi@janavaani.test"], people["imran@janavaani.test"]]
        pool = rng.sample(rows, min(n_grievances, len(rows)))
        statuses, weights = zip(*STATUS_MIX)
        for i, r in enumerate(pool):
            month_bias = 1.8 if r["category"] in ("drainage", "water") else 1.0
            for _ in range(20):      # monsoon bump: accept July–September with x1.8 weight
                days = rng.uniform(1, 180)
                c = now - timedelta(days=days, hours=rng.uniform(0, 23))
                if c.month in (7, 8, 9) or rng.random() < 1 / month_bias:
                    break
            st = rng.choices(statuses, weights)[0]
            asset = None
            if r["category"] in ASSET_TYPES and rng.random() < 0.25:
                cand = [a for d, a in assets if d == r["category"] and a.ward_id == r["ward_id"]]
                asset = cand[0].id if cand else None
            make_grievance(db, nid(), r, c, st, rng, citizen=citizens[i % 2] if i % 9 == 0 else None, asset=asset)
        seed_stories(db, rng, rows, people, nid)
        m = classifier.metrics()
        db.add(ModelVersion(version=m.get("model_version", "v1"), metrics={k: m.get(k) for k in ("accuracy", "macro_f1", "n_train", "n_test")},
                            corrections_used=0, is_active=True))
        db.add(Setting(key="demo_clock_offset_minutes", value={"v": clock.offset()}))
    with session_scope() as db:
        from app.pipeline.analytics import scan_spikes
        spikes = scan_spikes(db)
        from sqlalchemy import func, select
        n = db.scalar(select(func.count()).select_from(Grievance))
        nev = db.scalar(select(func.count()).select_from(TimelineEvent))
    print(f"seeded {n} grievances, {nev} timeline events, {len(assets)} assets, spike alerts={spikes}")
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=600)
    a = ap.parse_args()
    main(n_grievances=a.n)
