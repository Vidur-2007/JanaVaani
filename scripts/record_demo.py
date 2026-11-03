"""Warm the AI cache with the master §16 demo inputs (DEMO_MODE replays cache hits instantly).
Run against the deployed API after setting fresh keys: python scripts/record_demo.py --base https://<space>.hf.space/api/v1"""
import argparse

import httpx

DEMO = [
    {"text": "మా బడి దగ్గర కరెంటు తీగ తెగి రోడ్డు మీద పడింది, పిల్లలు అటు వెళ్తున్నారు, Kukatpally", "ui_lang": "te"},
    {"text": "Miyapur X roads lo pedda gunta undi", "ui_lang": "te", "location": {"lat": 17.498, "lng": 78.3622, "source": "gps"}},
    {"text": "ہمارے محلے میں نلوں میں گدلا پانی آ رہا ہے، Charminar", "ui_lang": "ur"},
    {"text": "गली की स्ट्रीट लाइट महीने भर से बंद है, Ameerpet", "ui_lang": "hi"},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000/api/v1")
    base = ap.parse_args().base
    with httpx.Client(timeout=90) as c:
        for d in DEMO:
            r = c.post(f"{base}/chat/turn", json={**d, "input_mode": "voice"}).json()
            if r.get("stage") == "emergency":
                r = c.post(f"{base}/chat/turn", json={"session_id": r["session_id"], "text": "school daggara",
                                                       "action": "continue_after_emergency", "ui_lang": d["ui_lang"]}).json()
            print(f"{r.get('stage'):>12}  {r.get('detected_language')}  {(r.get('draft') or {}).get('category')}  {d['text'][:40]}")
        for q in ("Which department handles mosquitoes?", "How does verification work?"):
            c.post(f"{base}/guide/ask", json={"question": q, "ui_lang": "en"})
    print("cache warmed (analysis, second opinion, localization, guide)")


if __name__ == "__main__":
    main()
