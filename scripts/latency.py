"""Latency check (Spec B §12): 10 sequential chat submissions (analyze -> confirm), report p50/p95.
Usage: python scripts/latency.py [--base http://localhost:8000/api/v1]"""
import argparse
import statistics
import time

import httpx

TEXTS = ["Miyapur lo road meeda pedda gunta undi", "మా వీధిలో మూడు రోజులుగా నీళ్ళు రావడం లేదు, Tarnaka",
         "गली की स्ट्रीट लाइट खराब है, Ameerpet", "نالی ابل کر سڑک پر آ رہی ہے Malakpet", "Garbage not collected for a week in Uppal",
         "Kukatpally lo current ledu morning nunchi", "स्कूल में बच्चों के लिए पीने का पानी नहीं, Alwal",
         "Traffic signal not working at Begumpet junction", "Dilsukhnagar lo domalu chala ekkuva ayyayi", "Footpath encroached by shops in Abids"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000/api/v1")
    base = ap.parse_args().base
    ms = []
    with httpx.Client(timeout=60) as c:
        for t in TEXTS:
            t0 = time.perf_counter()
            r = c.post(f"{base}/chat/turn", json={"text": t, "ui_lang": "en"}).json()
            if r.get("stage") in ("confirming", "duplicate_check"):
                r = c.post(f"{base}/chat/turn", json={"session_id": r["session_id"], "action": "file_new_anyway", "ui_lang": "en"}).json()
            ms.append((time.perf_counter() - t0) * 1000)
            print(f"{ms[-1]:7.0f} ms  stage={r.get('stage')}  {t[:40]}")
    ms.sort()
    print(f"p50={statistics.median(ms):.0f} ms  p95={ms[int(0.95 * (len(ms) - 1))]:.0f} ms  (target p50 < 5000 ms)")


if __name__ == "__main__":
    main()
