"""Conversational intake (Spec B §5.2) and persisted grievance fields: both the LLM turn and the deterministic rules.
Providers are faked: the intake prompt gets `state['intake']`, every other task fails over to the offline rules."""
import json

import pytest

from app.ai import gateway, prompts
from app.ai.providers.errors import ProviderError
from app.core.config import REPO_DIR
from app.core.ratelimit import limiter

from .conftest import token

CHAT = "/api/v1/chat/turn"


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    limiter.reset()


def turn(client, headers=None, **body):
    r = client.post(CHAT, json={"ui_lang": "en", "input_mode": "text", **body}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def llm(monkeypatch):
    state = {"intake": None, "prompts": []}

    def answer(prompt):
        if "Session state:" in prompt:
            state["prompts"].append(prompt)
            if state["intake"] is None:
                raise ProviderError("http_500", False)
            return json.dumps(state["intake"](prompt) if callable(state["intake"]) else state["intake"])
        raise ProviderError("http_500", False)
    monkeypatch.setattr(gateway, "provider_available", lambda p: True)
    monkeypatch.setattr(gateway, "_call_gemini", lambda m, prompt, images, t: answer(prompt))
    monkeypatch.setattr(gateway, "_call_groq", lambda m, prompt, t: answer(prompt))
    return state


# ---------- rules, with providers down
def test_rules_ask_one_question_at_a_time_and_never_what_is_given(client, seeded):
    r = turn(client, text="Big pothole on the main road in Ameerpet for 3 days")      # location + duration given
    asked = []
    while r["stage"] == "collecting":
        asked.append(r["reply"]["en"])
        assert r["reply"]["en"].count("?") == 1                       # one question per turn
        r = turn(client, session_id=r["session_id"], text="yes")
    assert r["stage"] == "confirming"
    assert not any("Where exactly" in q or "Since when" in q for q in asked)          # never re-asked
    assert asked[0].startswith("Could you add a photo") and len(asked) <= 4           # photo asked once, max 4
    assert r["draft"]["fields"]["blocking_traffic"] == "yes" and r["draft"]["fields"]["duration"]


def test_at_most_four_follow_ups_then_confirming(client, seeded):
    r = turn(client, text="Water problem in our street")          # water: issue_type, duration, households (no location)
    n = 0
    while r["stage"] == "collecting" and n < 10:
        n += 1
        r = turn(client, session_id=r["session_id"], text="not sure")
    assert n <= 4 + 1 and r["stage"] == "confirming"            # 4 intake questions, plus the location if still unknown


def test_gps_counts_as_location_and_the_photo_is_asked_only_once(client, seeded):
    r = turn(client, text="Garbage dumped on the corner", location={"lat": 17.4968, "lng": 78.3614, "source": "gps"})
    assert "location_detail" not in r["missing_fields"] and r["reply"]["en"].startswith("Could you add a photo")
    assert r["quick_replies"] == [{"label": "Skip", "value": "skip"}]
    r = turn(client, session_id=r["session_id"], text="skip")
    assert not r["reply"]["en"].startswith("Could you add a photo")


def test_a_photo_sent_mid_intake_is_not_asked_for(client, seeded):
    from .test_p4_admin import _png
    photo = client.post("/api/v1/uploads", files={"file": ("p.png", _png((90, 90, 30), 5), "image/png")},
                        data={"purpose": "evidence"}).json()["id"]
    r = turn(client, text="Garbage not cleared near Ameerpet market", media_ids=[photo])
    assert not r["reply"]["en"].startswith("Could you add a photo")


def test_questions_are_in_the_citizens_language(client, seeded):
    r = turn(client, text="అమీర్‌పేట్ లో రోడ్డు మీద పెద్ద గుంత ఉంది", ui_lang="te")
    assert r["stage"] == "collecting" and r["reply"]["lang"] == "te" and r["reply"]["original"] != r["reply"]["en"]


def test_greeting_is_smalltalk_and_not_a_complaint(client, seeded):
    r = turn(client, text="hello")
    assert (r["stage"], r["intent"]) == ("collecting", "smalltalk")
    r = turn(client, session_id=r["session_id"], text="Streetlight broken near Ameerpet metro")
    assert r["intent"] == "new_complaint"


def test_service_question_is_answered_from_the_guide(client, seeded):
    r = turn(client, text="How long does a streetlight repair take?")
    assert (r["stage"], r["intent"]) == ("answered", "ask_info") and r["reply"]["en"]


def test_confirm_during_intake_files_with_what_is_known(client, seeded):
    lak = token(client, "lakshmi@janavaani.test")
    r = turn(client, lak, text="Kukatpally lo road meeda gunta undi", ui_lang="te")
    assert r["stage"] == "collecting"
    r = turn(client, lak, session_id=r["session_id"], action="file_new_anyway")
    assert r["stage"] == "submitted"


# ---------- LLM turn, with the rules enforced on it
def test_llm_extracts_fields_and_asks_in_its_own_words(client, seeded, llm):
    llm["intake"] = {"intent": "new_complaint", "language": "en",
                     "reply": {"original": "Is the pothole blocking traffic right now?", "en": "Is the pothole blocking traffic right now?"},
                     "updated_fields": {"size": "very large", "duration": "2 weeks", "not_a_field": "x"},
                     "asking": "blocking_traffic"}
    r = turn(client, text="Huge pothole on the main road in Ameerpet since 2 weeks",
             media_ids=[], location={"lat": 17.4374, "lng": 78.4482, "source": "gps"})
    assert r["reply"]["en"] == "Is the pothole blocking traffic right now?"
    assert r["quick_replies"] == [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]
    assert set(r["missing_fields"]) == {"blocking_traffic"}
    prompt = llm["prompts"][-1]
    assert "Respond with JSON only" in prompt and "location_given" in prompt and "[PHONE]" not in prompt


def test_llm_question_about_something_already_given_is_replaced(client, seeded, llm):
    llm["intake"] = {"intent": "new_complaint", "reply": {"original": "Where is it?", "en": "Where is it?"},
                     "updated_fields": {}, "asking": "location_detail"}
    r = turn(client, text="Garbage pile near Ameerpet metro station", location={"lat": 17.4374, "lng": 78.4482, "source": "pin"})
    assert r["reply"]["en"] != "Where is it?" and r["stage"] == "collecting"


def test_llm_ready_to_confirm_goes_to_the_draft(client, seeded, llm):
    llm["intake"] = {"intent": "new_complaint", "ready_to_confirm": True, "updated_fields": {"issue_type": "no supply"}}
    r = turn(client, text="No water supply in Ameerpet since morning")
    assert r["stage"] == "confirming" and r["draft"]["fields"]["issue_type"] == "no supply"


def test_track_status_ranks_only_the_citizens_own_complaints(client, seeded, llm):
    lak = token(client, "lakshmi@janavaani.test")
    llm["intake"] = {"intent": "track_status", "track_query": "water complaint",
                     "reply": {"original": "x", "en": "Looking it up."}}
    r = turn(client, lak, text="what happened to my water complaint?")
    assert (r["stage"], r["intent"]) == ("answered", "track_status")
    lak_id = client.get("/api/v1/me", headers=lak).json()["id"]
    for g in r["tracked"]:
        assert client.get(f"/api/v1/grievances/{g['id']}", headers=lak).status_code == 200
    assert all(g["id"] for g in r["tracked"]) and lak_id


def test_someone_elses_ticket_number_is_not_shown(client, seeded):
    lak = token(client, "lakshmi@janavaani.test")
    imran = token(client, "imran@janavaani.test")
    mine = client.get("/api/v1/me/grievances", headers=lak).json()["items"][0]["id"]
    r = turn(client, imran, text=f"status of {mine}")
    assert r["intent"] == "track_status" and r["tracked"] == []


def test_llm_flagged_danger_shows_the_emergency_screen_before_any_question(client, seeded, llm):
    llm["intake"] = {"intent": "new_complaint", "is_emergency": True, "hazards": ["open_manhole"]}
    r = turn(client, text="The drain cover is gone outside the school in Ameerpet")
    assert r["stage"] == "emergency" and r["emergency"]["matched_terms"] == ["open_manhole"]


# ---------- fields persisted on the grievance (§8 brief input)
def test_collected_fields_are_stored_on_the_grievance_and_used_by_the_brief(client, seeded, monkeypatch):
    lak = token(client, "lakshmi@janavaani.test")
    r = turn(client, lak, text="Kukatpally lo road meeda pedda gunta undi 4 rojulu nunchi", ui_lang="te")
    while r["stage"] == "collecting":
        r = turn(client, lak, session_id=r["session_id"], text="yes")
    r = turn(client, lak, session_id=r["session_id"], action="file_new_anyway")
    gid = r["submitted"][0]["grievance_id"]
    g = client.get(f"/api/v1/grievances/{gid}", headers=lak).json()
    assert g["fields"].get("duration") and g["fields"].get("blocking_traffic") == "yes"
    seen = []
    monkeypatch.setattr(gateway, "run", lambda task, prompt, *a, **k: (seen.append(prompt), (None, {"provider": "none"}))[1])
    client.post(f"/api/v1/officer/grievances/{gid}/brief", headers=token(client, "ravi.roads@janavaani.test"), json={"refresh": True})
    assert '"blocking_traffic": "yes"' in seen[0]


def test_quick_form_fields_are_kept(client, seeded):
    lak = token(client, "lakshmi@janavaani.test")
    d = client.post("/api/v1/grievances/analyze", headers=lak, json={"text": "Streetlight not working near Ameerpet metro"}).json()
    d["fields"] = {**d["fields"], "pole_number": "SL-77"}
    r = client.post("/api/v1/grievances", headers=lak, json={"draft": d})
    assert r.status_code == 200 and r.json()["grievance"]["fields"]["pole_number"] == "SL-77"


def test_public_search_does_not_expose_fields(client, seeded):
    for g in client.get("/api/v1/search?q=road").json()["grievances"]:
        assert "fields" not in g


def test_migration_adds_the_column_idempotently():
    sql = (REPO_DIR / "supabase" / "migrations" / "0004_grievance_fields.sql").read_text()
    assert "add column if not exists fields jsonb not null default '{}'::jsonb" in sql


def test_intake_prompt_follows_the_prompt_rules():
    p = prompts.INTAKE
    assert "Respond with JSON only" in p and "Example (Telugu" in p and "Example (Tenglish" in p
    assert "ONE question at a time" in p and "Never ask for anything already given" in p
