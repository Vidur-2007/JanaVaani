"""Citizen chat regressions: emergency continue, AI-flagged emergency, multi-issue split, edit, incident support, keyword precision.
LLM paths use fake provider responses (never live services)."""
import json

import pytest

from app.ai import gateway
from app.core.config import DATA_DIR
from app.core.ratelimit import limiter
from app.pipeline.safety import detect_emergency
from app.refdata import ward_by_mention, wards

from .conftest import token

CHAT = "/api/v1/chat/turn"


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    limiter.reset()     # these tests make more chat turns per minute than a citizen is allowed


def turn(client, headers=None, **body):
    r = client.post(CHAT, json={"ui_lang": "en", "input_mode": "text", **body}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


def analysis(**kw):
    d = {"language": "en", "script": "latin", "is_code_mixed": False, "cleaned_original": "x", "text_en": "x",
         "title": {"original": "Parent title", "en": "Parent title"}, "summary_en": "parent summary",
         "formal_text": {"original": "Parent formal", "en": "Parent formal"}, "issues": [], "category": "streetlights",
         "sub_department": "", "secondary_categories": [], "category_evidence": [], "location_mentions": ["Ameerpet"], "fields": {},
         "urgency": "medium", "hazards": [], "vulnerable": [], "sentiment": "concerned", "distress_score": 0.2,
         "is_emergency": False, "spam_likelihood": 0.0}
    return {**d, **kw}


@pytest.fixture
def fake_llm(monkeypatch):
    """Providers answer with `state['analysis']`; `state['calls']` counts analysis calls."""
    state = {"analysis": analysis(), "calls": 0}

    def answer(prompt):
        if "Session state:" in prompt:              # intake_turn
            return json.dumps(state.get("intake", {}))
        if "formal_text" in prompt:
            state["calls"] += 1
            return json.dumps(state["analysis"])
        if prompt.startswith("Rewrite this message"):
            return json.dumps({"original": "localized", "en": "localized"})
        return json.dumps({"department": state["analysis"]["category"], "sub_department": "", "confidence": 0.9})

    monkeypatch.setattr(gateway, "provider_available", lambda p: True)
    monkeypatch.setattr(gateway, "_call_gemini", lambda m, prompt, images, t: answer(prompt))
    monkeypatch.setattr(gateway, "_call_groq", lambda m, prompt, t: answer(prompt))
    return state


def test_continue_after_emergency_goes_to_the_draft_without_retyping(client, seeded):
    r = turn(client, text="మా బడి దగ్గర కరెంటు తీగ తెగి పడింది, కూకట్‌పల్లి")
    assert r["stage"] == "emergency"
    r2 = turn(client, session_id=r["session_id"], action="continue_after_emergency")
    assert r2["stage"] == "collecting"                       # back to collecting with the emergency kept (Spec B §6)
    r2 = turn(client, session_id=r["session_id"], text="that's all")
    assert r2["stage"] == "confirming" and r2["draft"]["priority_preview"]["score"] >= 80
    assert r2["draft"]["location"]["ward_name"] == "Kukatpally"


def test_continue_after_emergency_still_asks_for_a_missing_location(client, seeded):
    r = turn(client, text="Gas leak in our building, please help")
    turn(client, session_id=r["session_id"], action="continue_after_emergency")
    r2 = turn(client, session_id=r["session_id"], text="that's all")
    assert r2["stage"] == "collecting" and "location_detail" in r2["missing_fields"]
    r3 = turn(client, session_id=r["session_id"], text="Near Ameerpet metro")
    assert r3["stage"] == "confirming" and r3["draft"]["location"]["ward_name"] == "Ameerpet"


def test_emergency_flagged_only_by_the_llm_shows_the_screen_once(client, seeded, fake_llm):
    fake_llm["analysis"] = analysis(is_emergency=True, urgency="critical", hazards=["live_wire"], category="power")
    fake_llm["intake"] = {"intent": "new_complaint", "is_emergency": True, "hazards": ["live_wire"]}
    r = turn(client, text="Bare cable dangling on our school gate in Ameerpet, children touching")
    assert r["stage"] == "emergency" and r["emergency"]["contacts"] and r["emergency"]["matched_terms"] == ["live_wire"]
    assert fake_llm["calls"] == 0                                    # flagged by the intake turn, before any analysis
    assert turn(client, session_id=r["session_id"], action="continue_after_emergency")["stage"] == "collecting"
    r2 = turn(client, session_id=r["session_id"], text="that's all")
    assert r2["stage"] == "confirming" and fake_llm["calls"] == 1    # the emergency screen is not shown twice
    # AI is advisory: without a keyword rule hit there is no rule floor; humans confirm in the emergency queue
    assert all(f["key"] != "emergency_rule" for f in r2["draft"]["priority_preview"]["factors"])
    r3 = turn(client, session_id=r["session_id"], action="confirm")
    if r3["stage"] == "duplicate_check":
        r3 = turn(client, session_id=r["session_id"], action="file_new_anyway")
    sub = r3["submitted"][0]
    assert client.get(f"/api/v1/grievances/{sub['grievance_id']}?pin={sub['guest_pin']}").json()["is_emergency"]


def test_split_confirm_creates_one_linked_grievance_per_selected_draft(client, seeded, fake_llm):
    lak = token(client, "lakshmi@janavaani.test")
    fake_llm["analysis"] = analysis(issues=[{"summary_en": "Street light is broken", "category": "streetlights"},
                                            {"summary_en": "Garbage is not collected", "category": "sanitation"},
                                            {"summary_en": "Big pothole on the road", "category": "roads"}])
    r = turn(client, lak, text="Split test: street light broken, garbage not collected and a pothole in Ameerpet")
    r = turn(client, lak, session_id=r["session_id"], text="that's all")
    drafts = r["drafts"]
    assert [d["category"] for d in drafts] == ["streetlights", "sanitation", "roads"]
    assert len({d["draft_id"] for d in drafts}) == 3
    assert drafts[1]["summary_en"] == "Garbage is not collected" and drafts[1]["title"]["en"] == "Garbage is not collected"
    assert drafts[1]["routing_preview"]["department"] == "sanitation"

    r2 = turn(client, lak, session_id=r["session_id"], action="split_confirm",
              action_payload={"draft_ids": [drafts[0]["draft_id"], drafts[1]["draft_id"]]})
    assert r2["stage"] == "submitted" and len(r2["submitted"]) == 2       # the unticked pothole is not filed
    a, b = [client.get(f"/api/v1/grievances/{s['grievance_id']}", headers=lak).json() for s in r2["submitted"]]
    assert {a["category"], b["category"]} == {"streetlights", "sanitation"}
    assert a["related_ids"] == [b["id"]] and b["related_ids"] == [a["id"]]
    assert a["summary_en"] != b["summary_en"]


def test_split_confirm_rejects_ids_from_another_session(client, seeded, fake_llm):
    fake_llm["analysis"] = analysis(issues=[{"summary_en": "Light broken", "category": "streetlights"},
                                            {"summary_en": "Garbage piled", "category": "sanitation"}])
    r = turn(client, text="Split guard test: light broken and garbage piled in Ameerpet")
    res = client.post(CHAT, json={"ui_lang": "en", "input_mode": "text", "session_id": r["session_id"], "action": "split_confirm",
                                  "action_payload": {"draft_ids": ["not-a-draft"]}})
    assert res.status_code == 409


def test_edit_with_text_replaces_the_complaint_and_edit_with_location_updates_it(client, seeded):
    r = turn(client, text="Garbage not collected for a week in Uppal")
    r = turn(client, session_id=r["session_id"], text="that's all")
    assert r["draft"]["category"] == "sanitation"
    r2 = turn(client, session_id=r["session_id"], action="edit", action_payload={"text": "Big pothole on the main road in Ameerpet"})
    assert r2["stage"] == "confirming" and r2["draft"]["category"] == "roads" and r2["draft"]["location"]["ward_name"] == "Ameerpet"
    r3 = turn(client, session_id=r["session_id"], action="edit", location={"lat": 17.4968, "lng": 78.3614, "source": "pin"})
    assert r3["stage"] == "confirming" and r3["draft"]["location"]["ward_name"] == "Miyapur" and r3["draft"]["category"] == "roads"
    r4 = turn(client, session_id=r["session_id"], action="edit")
    assert r4["stage"] == "collecting"


def test_support_by_incident_id_lands_on_a_member_and_reports_the_total(client, seeded):
    lak = token(client, "lakshmi@janavaani.test")
    officer = token(client, "supervisor@janavaani.test")
    inc = max(client.get("/api/v1/officer/incidents", headers=officer).json(), key=lambda i: i["support_count"])
    r = client.post(f"/api/v1/grievances/{inc['id']}/support", json={}, headers=lak)
    assert r.status_code == 200, r.text
    assert r.json()["incident_id"] == inc["id"] and r.json()["support_count"] > 1
    r2 = turn(client, lak, action="support_existing", action_payload={"incident_id": inc["id"]})
    assert r2["stage"] == "submitted" and r2["submitted"][0]["grievance_id"] in inc["grievance_ids"]
    assert client.post("/api/v1/grievances/INC-NOPE/support", json={}, headers=lak).status_code == 404


def test_check_duplicates_titles_are_localized_objects(client, seeded):
    loc = {"lat": 17.4968, "lng": 78.3614, "source": "gps"}
    r = client.post("/api/v1/grievances/check-duplicates", json={"text": "pothole on the road at Miyapur X Roads", "location": loc, "category": "roads"})
    assert r.json() and all({"original", "en", "lang"} <= set(m["title"]) for m in r.json())


@pytest.mark.parametrize("text,ward", [
    ("మియాపూర్‌లో రోడ్డు మీద గుంత", "Miyapur"), ("మియాపూర్లో రోడ్డు", "Miyapur"), ("కూకట్‌పల్లి బస్ స్టాప్", "Kukatpally"),
    ("अमीरपेट में बत्ती खराब", "Ameerpet"), ("چارمینار کے پاس گندا پانی", "Charminar"), ("KPHB bus stop", "KPHB Colony"),
    ("Miyapur lo gunta", "Miyapur"), ("اپلوڈ نہیں ہوا", None), ("no place named here", None),
])
def test_ward_mentions_in_any_script(text, ward):
    w = ward_by_mention(text)
    assert (w and w["name"]) == ward


def test_every_ward_has_native_script_names():
    aliases = json.loads((DATA_DIR / "geo" / "locality_aliases.json").read_text(encoding="utf-8"))
    assert {w["name"] for w in wards()} <= set(aliases)


@pytest.mark.parametrize("text", [
    "A live electric wire has fallen on the road near the school, sparks everywhere",
    "sparks coming from the pole in our street", "transformer exploded in our colony", "కరెంట్ తీగ పడింది",
    "చెట్టు మీద నిప్పురవ్వలు వస్తున్నాయి", "तार गिर गया है", "चिंगारी निकल रही है", "आग लग गई", "सड़क पर आग।", "تار گر گیا", "آگ لگ گئی",
    "wire tegi road meeda padindi", "bijli ka taar gir gaya", "aag lag gayi",
])
def test_emergency_phrases(text):
    assert detect_emergency(text)["is_emergency"], text


@pytest.mark.parametrize("text", [
    "सड़क आगे से टूटी हुई है", "आगे वाली गली में कचरा है", "आगरा रोड पर गड्ढा", "آگے والی گلی میں کچرا ہے",
    "The fire station road has potholes", "fire the officer who ignored me", "no current since morning",
    "current bill is too high", "wire is needed for the new lights", "sparkling clean road needed",
])
def test_not_emergencies(text):
    r = detect_emergency(text)
    assert not r["is_emergency"] and not r["hazards"], (text, r)
