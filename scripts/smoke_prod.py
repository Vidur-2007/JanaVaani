"""Production smoke test for the JanaVaani API: safe requests only, no secrets, no permanent records.

Checks health, public metadata/stats/map, auth enforcement (no token, a garbage token), and the real AI providers
through the app's own endpoints: complaint analysis (English + Telugu), translation (both directions) and the guide.
Which provider answered an analysis is read from its routing votes: a `gemini` vote means Gemini main answered,
`groq` alone means Gemini failed and Groq took over, neither means both failed and the offline rules answered.

Side effects: AI requests add rows to `ai_calls` (telemetry) and may fill the AI cache. Nothing else is written:
/grievances/analyze keeps its draft in process memory, and no grievance, upload, account or chat is created.

Usage: python scripts/smoke_prod.py [--base https://janavaani-gnbo.onrender.com] [--json out.json] [--skip-ai]
"""
import argparse
import json
import re
import sys
import time

import httpx

TE = re.compile(r"[ఀ-౿]")
RESULTS = []


def check(name, method, path, *, body=None, headers=None, expect=200, judge=None, timeout=90):
    t0 = time.perf_counter()
    try:
        r = CLIENT.request(method, path, json=body, headers=headers, timeout=timeout)
        status, data = r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else None)
    except httpx.HTTPError as e:
        status, data = None, None
        note = f"network error: {type(e).__name__}"
    dt = time.perf_counter() - t0
    if status is not None:
        ok = status == expect if isinstance(expect, int) else status in expect
        note = "" if ok else f"expected {expect}: {_err(data)}"
        if ok and judge:
            verdict, note = judge(data)
            ok = verdict
    else:
        ok = False
    RESULTS.append({"name": name, "method": method, "path": path, "status": status, "seconds": round(dt, 2),
                    "result": "PASS" if ok else "FAIL", "note": note})
    print(f"{'PASS' if ok else 'FAIL':4} {status or '---':>3} {dt:6.2f}s  {method:4} {path:48} {note}"[:220], flush=True)
    return data


def _err(data):
    if isinstance(data, dict) and isinstance(data.get("error"), dict):
        return f"{data['error'].get('code')}: {data['error'].get('message', '')[:80]}"
    return ""


def need(*conds):
    """judge helper: (ok, note) from (condition, note-if-failed) pairs."""
    failed = [n for c, n in conds if not c]
    return (not failed, "; ".join(failed))


def votes(d):
    return {v["source"]: v["department"] for v in (d or {}).get("routing_preview", {}).get("votes", [])}


def providers_of(d):
    v = votes(d)
    if "gemini" in v:
        return "gemini main answered" + (", groq second opinion answered" if "groq" in v else ", groq second opinion failed")
    if "groq" in v:
        return "gemini main FAILED -> groq answered (fallback)"
    return "both LLMs FAILED -> offline rules"


def main():
    global CLIENT
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://janavaani-gnbo.onrender.com")
    ap.add_argument("--json")
    ap.add_argument("--skip-ai", action="store_true")
    a = ap.parse_args()
    CLIENT = httpx.Client(base_url=a.base.rstrip("/") + "/api/v1")
    stamp = int(time.time())

    print("== health and public endpoints")
    check("health", "GET", "/health", judge=lambda d: need((d["status"] == "ok", f"status={d['status']}"),
                                                         (d["providers"]["db"] == "ok", "db down")))
    check("departments", "GET", "/meta/departments", judge=lambda d: need((len(d) == 11, f"{len(d)} departments")))
    check("wards", "GET", "/meta/wards", judge=lambda d: need((len(d) == 30, f"{len(d)} wards")))
    check("wards geojson", "GET", "/meta/wards.geojson", judge=lambda d: need((d.get("type") == "FeatureCollection", "not geojson")))
    check("emergency contacts", "GET", "/meta/emergency-contacts", judge=lambda d: need((bool(d), "empty")))
    check("unknown asset", "GET", "/meta/assets/SL-XXX-0000", expect=404)
    check("asset list", "GET", "/meta/assets?type=streetlight", judge=lambda d: need((isinstance(d, list), "not a list")))
    check("public stats", "GET", "/public/stats", judge=lambda d: need(("total" in d and "trend" in d, "shape")))
    check("public map", "GET", "/public/map", judge=lambda d: need((isinstance(d, list), "not a list")))
    check("public nearby", "GET", "/public/nearby?lat=17.4968&lng=78.3614&radius_m=1000",
          judge=lambda d: need((isinstance(d, list), "not a list")))
    check("public search", "GET", "/search?q=streetlight", judge=lambda d: need(("grievances" in d, "shape")))
    check("unknown grievance", "GET", "/grievances/JV-0000-000000", expect=404)
    check("validation error", "POST", "/grievances/analyze", body={"text": ""}, expect=422)

    print("== auth enforcement (no token, garbage token)")
    protected = [("GET", "/me"), ("GET", "/me/grievances"), ("GET", "/notifications"),
                 ("GET", "/officer/inbox"), ("GET", "/officer/review-queue"), ("GET", "/officer/officers"),
                 ("GET", "/officer/incidents"), ("GET", "/admin/kpis"), ("GET", "/admin/audit"),
                 ("GET", "/admin/alerts"), ("GET", "/admin/ai/metrics"), ("GET", "/admin/demo/clock"),
                 ("POST", "/officer/grievances/JV-0000-000000/status"), ("POST", "/officer/bulk"),
                 ("POST", "/admin/ai/retrain"), ("POST", "/admin/demo/reset"),
                 ("POST", "/grievances/JV-0000-000000/feedback")]
    for m, p in protected:
        check(f"no token {p}", m, p, body={} if m == "POST" else None, expect=401)
    for m, p in protected[:4] + protected[7:9]:
        check(f"bad token {p}", m, p, headers={"Authorization": "Bearer not.a.jwt"}, expect=401)
    check("demo login closed", "POST", "/auth/demo-login", body={"email": "admin@janavaani.test"}, expect=403)

    if a.skip_ai:
        return finish(a)
    print("== AI through the production endpoints (real providers)")
    en = check("analyze English", "POST", "/grievances/analyze", timeout=120,
               body={"text": f"Smoke {stamp}: the streetlight near Miyapur bus stop has been off for four days and "
                             "the road is completely dark at night."},
               judge=lambda d: need((d["category"] == "streetlights", f"category={d['category']}"),
                                    (d["location"].get("ward_id") == "W-SLP-04", f"ward={d['location'].get('ward_id')}"),
                                    (bool(d["title"].get("en")), "no title")))
    te = check("analyze Telugu", "POST", "/grievances/analyze", timeout=120,
               body={"text": f"స్మోక్ {stamp}: కూకట్‌పల్లి లో మూడు రోజులుగా నీళ్ళు రావడం లేదు, పిల్లలు చాలా ఇబ్బంది పడుతున్నారు"},
               judge=lambda d: need((d["category"] == "water", f"category={d['category']}"),
                                    (bool(d["summary_en"]) and not TE.search(d["summary_en"]), "summary_en not English")))
    for label, d in (("English", en), ("Telugu", te)):
        if d:
            RESULTS[-2 if label == "English" else -1]["note"] += f" [{providers_of(d)}; votes={votes(d)}]"
            print(f"     providers ({label}): {providers_of(d)}; votes={votes(d)}")
    check("translate en->te", "POST", "/translate", timeout=120,
          body={"text": f"Smoke {stamp}: the drain outside the school is overflowing.", "target_lang": "te"},
          judge=lambda d: need((len(TE.findall(d["text"])) >= 10, "not Telugu"), (d["source_lang"] == "en", f"source_lang={d['source_lang']}")))
    check("translate te->en", "POST", "/translate", timeout=120,
          body={"text": f"{stamp}: మియాపూర్ బస్ స్టాప్ దగ్గర వీధి దీపం పనిచేయడం లేదు", "target_lang": "en"},
          judge=lambda d: need((not TE.search(d["text"]) and "light" in d["text"].lower(), f"text={d['text'][:60]!r}"),
                               (d["source_lang"] == "te", f"source_lang={d['source_lang']}")))
    check("guide answer", "POST", "/guide/ask", timeout=120,
          body={"question": f"How long does a streetlight repair take? ({stamp})", "ui_lang": "en"},
          judge=lambda d: need((bool(d["answer"]["en"]), "empty answer"), (bool(d["sources"]), "no sources")))
    return finish(a)


def finish(a):
    failed = [r for r in RESULTS if r["result"] != "PASS"]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    if a.json:
        with open(a.json, "w") as f:
            json.dump(RESULTS, f, ensure_ascii=False, indent=1)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
