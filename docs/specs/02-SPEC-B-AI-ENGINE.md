# Spec B — AI Intelligence Engine, Backend, Data & ML

> **Laptop B · branch `feat/ai-engine`**
> Read `00-MASTER-SPEC.md` first. B owns every API endpoint in master section 9, the database, the trained model and the seed data.

## 1. Mission
Build the brain:
- A FastAPI service that turns any citizen message (any language, any script, voice or photo) into a structured, routed, prioritized, de-duplicated, auditable case.
- Our **own trained department classifier**.
- A seeded city of realistic data that makes every dashboard tell a story.

**Never let a provider failure break the demo.**

## 2. Files B owns
- `services/api/**`, `ml/**`, `data/**`, `supabase/migrations/**`, `scripts/**`
- `docs/progress/B.md`, `docs/contract-notes/B.md`

**Never edit** `apps/**` or `packages/contracts/**`. If the contract must grow, add optional fields in Pydantic and log them in `docs/contract-notes/B.md` so A/C can add the TypeScript side.

### 2.1 Layout
```
services/api/
  app/main.py                  FastAPI app, CORS, routers, startup warm-up, /health
  app/core/config.py           pydantic-settings from env
  app/core/db.py               psycopg async pool (Session pooler), helpers
  app/core/security.py         Supabase JWT verification, current_user, require_role
  app/core/clock.py            virtual "now" (real now + demo offset)
  app/core/ratelimit.py        slowapi limiter
  app/schemas.py               Pydantic mirror of packages/contracts/src/types.ts
  app/ai/gateway.py            task registry, primary/fallback, retries, cache, demo replay, logging
  app/ai/providers/gemini.py   google-genai wrapper (text, JSON schema, multimodal, TTS)
  app/ai/providers/groq.py     groq wrapper (chat JSON mode, whisper)
  app/ai/prompts/*.md          prompt templates (one per task)
  app/ml/embeddings.py         sentence-transformers singleton (e5 prefixes)
  app/ml/classifier.py         load joblib model, predict_proba, hot-swap
  app/pipeline/safety.py       PII masking, emergency keywords, spam heuristics
  app/pipeline/intake.py       chat state machine
  app/pipeline/analyze.py      core analysis call
  app/pipeline/routing.py      vote + confidence + explanation
  app/pipeline/geo.py          geocode/reverse (Nominatim, cached), ward lookup (PostGIS)
  app/pipeline/duplicates.py   pgvector + distance + time
  app/pipeline/priority.py     explainable score
  app/pipeline/sla.py          SLA, ETA, delay risk
  app/pipeline/assignment.py   least-loaded officer
  app/pipeline/audit.py        hash-chained timeline events
  app/pipeline/notify.py       notifications + live_events
  app/pipeline/verification.py resolution verification
  app/pipeline/analytics.py    KPIs, performance, breakdowns, spikes, insights
  app/routers/*.py             chat, grievances, uploads, speech, search, guide, meta, public, notifications, officer, admin, health
  app/jobs/scheduler.py        APScheduler: escalation, auto-close, spike scan
  tests/
  Dockerfile, requirements.txt, README.md
ml/
  build_wards.py  generate_dataset.py  train_classifier.py  evaluate.py  seed_db.py  apply_migrations.py
  models/ (classifier.joblib, labels.json, metrics.json)  notebooks/model_report.ipynb
data/
  geo/localities.json  geo/wards.geojson  departments.json  sla.json  emergency_keywords.json
  emergency_contacts.json  knowledge/service_guide.md  seed/complaints.jsonl  seed/assets.json
  eval/human_test.jsonl  eval/human_test_template.jsonl
```

---

## 3. Reference data (`data/`)

### 3.1 `departments.json`
Master section 7 table, with names in en/te/hi/ur, `agency_en`, lucide icon, color, sub-departments, and **required fields**:

| Department | Required fields (key: question intent) |
|---|---|
| roads | `location_detail` (exact spot/landmark), `size` (small/large/very large), `duration`, `blocking_traffic` |
| sanitation | `location_detail`, `waste_type`, `duration`, `bin_overflow` |
| water | `issue_type` (no supply/leak/contamination/low pressure), `duration`, `households_affected` |
| streetlights | `location_detail`, `pole_number` (optional), `lights_count`, `duration` |
| power | `scope` (house/street/area), `duration`, `sparking_or_danger` |
| drainage | `location_detail`, `entering_homes`, `duration` |
| traffic | `junction`, `issue_type`, `time_of_day` |
| health | `facility_or_area`, `issue_type` |
| education | `school_name`, `issue_type` |
| town_planning | `address`, `issue_type` |

Each question exists in en/te/hi/ur.

### 3.2 `geo/localities.json` — 30 demo wards (approximate centroids)

| Zone | Localities (lat, lng) |
|---|---|
| Serilingampally | Gachibowli (17.4401, 78.3489), Kondapur (17.4699, 78.3578), Madhapur (17.4483, 78.3915), Miyapur (17.4968, 78.3614), Lingampally (17.4925, 78.3170) |
| Kukatpally | Kukatpally (17.4849, 78.4138), KPHB Colony (17.4935, 78.3990), Moosapet (17.4636, 78.4258), Kompally (17.5360, 78.4870) |
| Khairatabad | Jubilee Hills (17.4325, 78.4071), Banjara Hills (17.4156, 78.4347), Ameerpet (17.4375, 78.4482), Mehdipatnam (17.3959, 78.4312), Tolichowki (17.3986, 78.4140), Nampally (17.3890, 78.4680) |
| Secunderabad | Secunderabad (17.4399, 78.4983), Begumpet (17.4447, 78.4664), Tarnaka (17.4281, 78.5390), Malkajgiri (17.4530, 78.5280), Alwal (17.5030, 78.5090) |
| Charminar | Charminar (17.3616, 78.4747), Falaknuma (17.3313, 78.4730), Malakpet (17.3730, 78.5000), Attapur (17.3724, 78.4307), Abids (17.3920, 78.4760), Himayatnagar (17.4010, 78.4870) |
| LB Nagar | LB Nagar (17.3457, 78.5522), Dilsukhnagar (17.3688, 78.5247), Saroornagar (17.3530, 78.5320), Uppal (17.4058, 78.5591) |

**`ml/build_wards.py`:**
- Builds Voronoi polygons from these centroids (scipy) clipped to the bounding box [17.30, 78.29]–[17.56, 78.60].
- Writes `geo/wards.geojson` with properties `{id, name, zone}` and ids like `W-KKP-01`.
- If the team finds an open GHMC ward GeoJSON, it may replace this, but keep the same schema.
- UI must label boundaries **"Approximate demo boundaries"**.

### 3.3 Other files
- **`sla.json`:** the master section 7 priority table plus `emergency_confirmed_hours: 4` and `auto_close_days: 7`.
- **`emergency_contacts.json`:** 112 (all emergencies), 108 (ambulance), 101 (fire), 1912 (electricity complaints), with labels in 4 languages. Add local helplines (GHMC, HMWSSB) **only after verifying the numbers on official sites**.
- **`emergency_keywords.json`:** phrase lists per language. Starter set below; tune on the seed set to avoid false positives (never match a bare "current" or "danger"):
  - **en:** fire, smoke coming, electric shock, electrocuted, live wire, current wire, current shock, wire fell, sparking, transformer blast, gas leak, building collapse, wall collapse, roof collapse, flooding, water entering house, drowning, open manhole, child fell, tree fell on
  - **te:** మంటలు, అగ్ని ప్రమాదం, కరెంట్ షాక్, కరెంటు తీగ, తీగ తెగి, గ్యాస్ లీక్, కూలిపోయింది, వరద, మునిగిపోతున్నారు, మ్యాన్‌హోల్ తెరిచి
  - **hi:** आग, आग लगी, करंट लगा, बिजली का तार, तार टूटा, गैस लीक, इमारत गिर, दीवार गिर, बाढ़, डूब रहा, खुला मैनहोल
  - **ur:** آگ, آگ لگی, کرنٹ لگا, بجلی کا تار, گیس لیک, دیوار گر, عمارت گر, سیلاب, ڈوب رہا
  - **translit:** aag lagi, current shock, current teega, teega tegindi, mantalu, agni pramadam, gas leak, deewar gir, building gir gaya, varada, manhole open
- **`knowledge/service_guide.md`:** B writes about 1,500 words. One `##` section per department (what it handles, what to include, typical SLA, examples), plus sections on emergencies, appeals, privacy and anonymous reporting, and how verification works. Section anchors are used as citations.

---

## 4. Database (Supabase Postgres, `supabase/migrations/*.sql`, applied by `ml/apply_migrations.py`)

Extensions: `postgis`, `vector`, `pgcrypto`.

| Table | Key columns |
|---|---|
| `profiles` | `id uuid pk = auth.users.id`, `role`, `name`, `email`, `preferred_language`, `department_id`, `ward_ids text[]`, `designation`, `office_name`, `office_phone`, `is_active` |
| `departments` | `id`, `data jsonb` (Department) |
| `wards` | `id`, `name`, `zone`, `geom geometry(MultiPolygon,4326)`, `centroid geography(Point)` |
| `assets` | `id`, `type`, `label_en`, `ward_id`, `geom geography(Point)` |
| `grievances` | `id text pk` (GRV-2026-NNNNNN via sequence), `citizen_id uuid null`, `guest_pin_hash`, `language`, `script`, `is_code_mixed`, `description_original` (raw, restricted), `description_masked`, `description_en`, `title jsonb`, `formal_text jsonb`, `summary_en`, `category`, `sub_department`, `secondary_departments text[]`, `routing jsonb`, `status`, `closure_type`, `priority`, `priority_score int`, `priority_factors jsonb`, `is_emergency`, `emergency_confirmed bool null`, `hazards text[]`, `vulnerable text[]`, `sentiment`, `distress_score real`, `geom geography(Point)`, `location jsonb`, `ward_id`, `zone`, `asset_id`, `assigned_officer_id`, `escalation_level int`, `sla_hours int`, `sla_due_at`, `eta_at`, `delay_reason jsonb`, `incident_id`, `support_count int default 1`, `related_ids text[]`, `is_anonymous`, `is_private`, `rating`, `feedback_comment`, `reopen_count int`, `ai_verification jsonb`, `embedding vector(384)`, `first_response_at`, `created_at`, `updated_at`, `resolved_at`, `closed_at` |
| `grievance_supporters` | `grievance_id`, `user_id`, `created_at`, unique pair |
| `incidents` | `id`, `title_en`, `category`, `ward_id`, `centroid geography`, `status`, `created_at` |
| `media` | `id uuid`, `grievance_id`, `storage_path`, `uploaded_by_role`, `purpose`, `quality jsonb`, `ai jsonb`, `geo jsonb`, `phash`, `created_at` |
| `timeline_events` | `id uuid`, `grievance_id`, `seq int`, `type`, `actor_role`, `actor_id`, `actor_name`, `message_en`, `message jsonb`, `internal bool`, `payload jsonb`, `created_at`, `prev_hash`, `hash` |
| `messages` | `id`, `grievance_id`, `session_id`, `sender`, `sender_name`, `text jsonb`, `created_at` |
| `chat_sessions` | `id uuid`, `user_id`, `state jsonb` (stage, language, collected fields, drafts, pending duplicates), `messages jsonb`, `created_at`, `updated_at` |
| `appeals` | `id`, `grievance_id`, `reason jsonb`, `status`, `decision_note jsonb`, `decided_by`, `created_at`, `decided_at` |
| `notifications` | `id`, `user_id`, `grievance_id`, `type`, `title jsonb`, `body jsonb`, `read bool`, `created_at` |
| `live_events` | `id bigserial`, `audience text`, `kind`, `grievance_id`, `created_at` — **in the `supabase_realtime` publication** |
| `routing_corrections` | `grievance_id`, `from_department`, `to_department`, `text_original`, `by_user`, `created_at` |
| `ai_calls` | `id`, `task`, `provider`, `model`, `latency_ms`, `ok`, `fallback_used`, `error_code`, `created_at` |
| `model_versions` | `version`, `metrics jsonb`, `corrections_used`, `trained_at`, `is_active` |
| `translations` | `hash`, `target_lang`, `text`, pk(`hash`,`target_lang`) |
| `settings` | `key`, `value jsonb` (e.g. `demo_clock_offset_minutes`) |

**Indexes:**
- GIST on `grievances.geom` and `wards.geom`.
- HNSW (`vector_cosine_ops`) on `grievances.embedding`.
- B-tree on `(status, priority)`, `(category, ward_id, created_at)`, `assigned_officer_id`.

**Row-level security:**
- Enable on all tables. The backend uses the service role, which bypasses it.
- Policies needed only for frontend realtime: `live_events` SELECT where `audience = 'user:' || auth.uid()`, or `audience = 'public'`, or (`audience like 'dept:%'` and the caller's profile role is officer/supervisor/admin and the department matches), or (`audience = 'role:admin'` and role is admin/supervisor).
- Deny everything else to anon/authenticated.

**Storage:**
- Private bucket `evidence`. The API returns signed URLs (24-hour expiry) inside `Media.url`.
- Paths `evidence/{yyyy}/{mm}/{uuid}.webp`.

**Embedding dimension 384** (e5-small). If LaBSE wins the benchmark (section 7), change it to 768 **before** seeding.

---

## 5. AI gateway (`app/ai/gateway.py`)

`await ai.run(task, inputs, schema=PydanticModel | None, images=[...])` returns `(result, meta)`, where `meta = {provider, model, latency_ms, cached, fallback_used}`.

| Task | Primary | Fallback | Output |
|---|---|---|---|
| `intake_turn` | Gemini MAIN | Groq MAIN | `IntakeTurn` JSON |
| `analyze_complaint` | Gemini MAIN (multimodal) | Groq MAIN (text only, image ignored) | `Analysis` JSON |
| `route_second_opinion` | Groq MAIN | Gemini LITE | `{department, sub_department, confidence}` |
| `spam_check` | Gemini LITE | Groq SMALL | `{spam_likelihood, reason}` |
| `translate` | Gemini MAIN | Groq MAIN | `{text}` (cache in `translations`) |
| `localize_reply` | Gemini MAIN | Groq MAIN | `Localized` |
| `officer_brief` | Groq MAIN | Gemini LITE | `OfficerBrief` |
| `draft_reply` | Groq MAIN | Gemini LITE | `{draft_en}` |
| `verify_resolution` | Gemini MAIN (vision) | Groq VISION if configured, else `unclear` | `AIVerificationLLM` |
| `insights_summary` | Groq MAIN | Gemini LITE → template | `{bullets_en[]}` |
| `guide_answer` | Gemini LITE | Groq MAIN | `{answer_original, answer_en, sources[], department_id}` |
| `transcribe` | Groq Whisper turbo | Groq whisper-large-v3 | `{text, language}` |
| `tts` | Gemini TTS model (if set) | none → 501 | wav bytes |
| `generate_seed` (offline) | Gemini MAIN | Groq MAIN | dataset batches |

**Rules:**
- **Timeouts:** 12 seconds (vision 20 seconds).
- **Retries:** on 429/5xx/timeout, retry once with backoff (0.8 s, jitter), then use the fallback.
- **JSON:** Gemini uses `response_mime_type="application/json"` + `response_schema`; Groq uses `response_format={"type":"json_object"}` with the schema embedded in the prompt. Validate with Pydantic; on failure make **one** repair call ("Fix this JSON to match schema"), then fall back.
- **Cache:** `diskcache` keyed by `sha256(task + model + normalized inputs + image hashes)`, TTL 24 hours. Always on for `translate`, `guide_answer`, `officer_brief` (key includes `updated_at`).
- **Demo replay:** with `DEMO_MODE=true`, any cache hit returns instantly. `scripts/record_demo.py` runs the scripted demo inputs once to warm the cache before judging.
- **Logging:** log every call to `ai_calls`, which powers the `AIMetrics.live` numbers.
- **Failure injection:** `FORCE_FAIL_GEMINI` / `FORCE_FAIL_GROQ` simulate outages.
- **Never send raw text:** only `description_masked` goes to providers.
- Prompt templates live in `app/ai/prompts/<task>.md` with `{{placeholders}}`. Every prompt states "Respond with JSON only" and includes 2 short few-shot examples (one Telugu, one Tenglish).

### 5.1 Core analysis schema (`Analysis`)
```json
{
  "language": "te|hi|ur|en|ta|kn|ml|mr|bn|gu|other",
  "script": "native|latin|mixed",
  "is_code_mixed": true,
  "cleaned_original": "same language, spelling/grammar fixed, meaning unchanged",
  "text_en": "faithful English translation",
  "title": {"original": "...", "en": "..."},
  "summary_en": "1-2 sentences",
  "formal_text": {"original": "formal complaint in citizen language", "en": "formal complaint in English"},
  "issues": [{"summary_en": "...", "category": "roads|...|other"}],
  "category": "roads|sanitation|water|streetlights|power|drainage|traffic|health|education|town_planning|other",
  "sub_department": "string",
  "secondary_categories": [],
  "category_evidence": ["short phrases from the text"],
  "location_mentions": ["Miyapur X roads", "near ZPHS school"],
  "fields": {"duration": "3 days"},
  "urgency": "critical|high|medium|low",
  "hazards": ["live_wire", "near_school"],
  "vulnerable": ["children"],
  "sentiment": "calm|concerned|frustrated|angry|distressed",
  "distress_score": 0.0,
  "is_emergency": false,
  "image": {"present": true, "category": "roads", "severity": "high", "description_en": "...", "matches_text": true},
  "spam_likelihood": 0.0
}
```
**Prompt instructions:**
- Never invent facts.
- `cleaned_original` must preserve meaning.
- For Latin-script Telugu/Hindi, set `script: "latin"` and `is_code_mixed: true` when it mixes in English.
- `formal_text` is polite and government-style, ≤ 120 words, and contains only facts present in the input.
- If several distinct problems exist, list them all in `issues`.

### 5.2 Intake turn (`IntakeTurn`)
Input: session state (language, collected fields, draft so far, last 8 messages), the department's required fields, the user's new message.

Output:
```json
{
  "intent": "new_complaint|track_status|ask_info|smalltalk",
  "language": "te",
  "is_code_mixed": false,
  "reply": {"original": "...", "en": "..."},
  "updated_fields": {"duration": "3 days"},
  "missing_fields": ["location_detail"],
  "ready_to_confirm": false,
  "quick_replies": [{"label": "...", "value": "..."}],
  "track_query": "water complaint"
}
```
**Rules:**
- Ask **one** question at a time, in the citizen's language and register (simple words, polite).
- Never ask for anything already given.
- Location counts as given if GPS/pin was sent.
- Photos are optional; ask for one once if none (high value for roads, sanitation, drainage, streetlights).
- Maximum 4 follow-up questions, then `ready_to_confirm=true` with what's known.

---

## 6. The pipeline (per chat turn and per submission)

`POST /chat/turn` state machine (`app/pipeline/intake.py`):

1. **Load or create** the `chat_session`. Handle `action` first:
   - `confirm` → step 9
   - `split_confirm` → step 9 for each selected draft
   - `edit` → back to collecting with "what would you like to change?"
   - `cancel` → reset
   - `support_existing` → add a supporter, return `submitted` (the supported id)
   - `file_new_anyway` → create
   - `continue_after_emergency` → collecting with an emergency flag kept
2. **Safety (deterministic, < 20 ms):**
   - **PII masking** regexes: Aadhaar `\b\d{4}\s?\d{4}\s?\d{4}\b`, Indian mobile `(\+91[\s-]?)?[6-9]\d{9}\b`, email, PAN `[A-Z]{5}\d{4}[A-Z]`. Replace with `[AADHAAR]`, `[PHONE]`, etc.
   - **Emergency keywords:** normalized lowercase, NFC, phrase match per language plus transliteration list. On a hit, return stage `emergency` immediately with contacts, the matched terms and a localized message (Gemini `localize_reply`, cached per language). Keep `is_emergency=true` in the session.
   - **Spam heuristics:** empty or repeated text, > 5 sessions per minute from one IP, gibberish ratio. Borderline cases → `spam_check` task.
3. **Intent and conversation:** `intake_turn`.
   - `track_status`: look up the user's grievances, rank by `track_query` similarity, return `stage: answered` with `tracked`.
   - `ask_info`: `guide_answer`.
   - Otherwise merge fields.
4. When `ready_to_confirm`, or when the user says "that's all", run `analyze_complaint` (with images from `media_ids`, fetched from storage).
5. **In parallel (`asyncio.gather`):**
   - (a) embed the text and run the classifier on `cleaned_original`;
   - (b) `route_second_opinion` on `summary_en`;
   - (c) geo: GPS/pin → reverse geocode + ward lookup (`ST_Contains`); or geocode the first `location_mentions` item (Nominatim, bounded to Hyderabad, cached) → ward;
   - (d) duplicate candidate search.
6. **Routing vote** (`routing.py`):
   - Label = majority of {classifier top-1, Gemini category, Groq category}. If all differ: the classifier if p ≥ 0.6, else Gemini.
   - `confidence = 0.5·p_classifier(label) + 0.25·[gemini==label] + 0.25·[groq==label]`.
   - ≥ 0.75 → `auto`; 0.50–0.75 → `auto_flagged`; < 0.50 or label `other` → `needs_review`.
   - **Explanation:** "Routed to Water Supply: our model (0.91), Gemini and Groq all agree; key phrases: 'neellu raavadam ledu', 'pipeline'."
   - `secondary_departments` from `secondary_categories` (multi-label, features 43, 44): on submission, create a **linked grievance** for each secondary department with `related_ids` cross-filled.
7. **Priority** (`priority.py`): the master section 7 formula, returning `priority_factors` with human-readable labels.
8. Return stage `confirming` with `draft` (or `drafts[]` if `issues.length > 1`; analyze each issue separately). Include `routing_preview` with the officer who *would* be assigned and `priority_preview`.
9. **On confirm:**
   - (a) Duplicate check (section 6.1). If strong matches exist and the user hasn't chosen yet, return `duplicate_check`.
   - (b) **Create:** allocate id, compute SLA/ETA, assign officer (section 6.2), save, write timeline events `registered` → `classified` → `assigned` (or `routing_review`), notify the officer (`dept:<id>` live event), notify the citizen.
   - (c) Generate a guest PIN (6 digits, stored hashed) for guests.
   - (d) Return `submitted`.
10. **Every reply** is localized via `Localized` (`original` in the citizen's language, `en`).

`POST /grievances/analyze` (quick form) runs steps 2, 4, 5, 6, 7 and returns a `GrievanceDraft`. `POST /grievances` runs step 9 and returns duplicates in the response if found.

### 6.1 Duplicates (`duplicates.py`)
- **Candidates:** not `rejected`/`merged`, same or related category, within 500 m, created in the last 30 virtual days, closed less than 7 days ago allowed.
- **Score:** `0.6·cosine + 0.25·(1 − distance/500) + 0.15·[same category]`. Strong match ≥ 0.78 (tune on seeded clusters in P6); return the top 3.
- **Embedding text:** `"passage: " + (description_en or cleaned_original)`. Queries use the `"query: "` prefix. Cross-language matching works because the embeddings are multilingual and we prefer English text.
- **Support:** inserts a supporter row, increments `support_count`, recomputes priority (feature 66), adds a `support_added` event and notifies the owner.
- **Incidents:** if ≥ 3 strong-match grievances exist and none has an incident, create an `incidents` row (title from the top grievance, centroid = mean) and set `incident_id` on all. Officers can bulk-merge (`/officer/bulk` with `merge`) → status `merged` for children; the parent stays active.
- **Resolution fan-out:** resolving an incident's parent updates every member and sends `community_update` notifications in each citizen's language (feature 105).

### 6.2 SLA, ETA, assignment
- `sla_hours` from `sla.json`; a **confirmed** emergency gets 4 hours. `sla_due_at = created_at + sla_hours`.
- **ETA:** median resolution hours for (category, ward) over closed seed data with ≥ 5 samples, else the category median. Label it "historical estimate".
- **Delay risk:** `elapsed / sla` > 0.8 or officer overdue load ≥ 3 → high; > 0.5 → medium.
- **Assignment:**
  - Eligible = active officers with the department and the grievance ward in `ward_ids`.
  - Pick the minimum weighted open load (critical 4, high 3, medium 2, low 1); tie-break by fewer overdue.
  - None eligible → the department's zone-level fallback officer → else `needs_review` (feature 50, cheap).

### 6.3 Audit chain (`audit.py`, features 124, 242, 258)
- `hash = sha256(prev_hash + canonical_json({grievance_id, seq, type, actor_role, actor_id, message_en, payload, created_at}))`.
- `prev_hash` is the previous event in the same grievance (null for the first).
- `GET /admin/audit/verify` recomputes the chain and returns the first broken event.
- Add an admin-only debug script `scripts/tamper_demo.py` that edits one event so the demo can show detection, then restores it.

---

## 7. ML: training workflow (`ml/`)

1. **`generate_dataset.py`:** Gemini `generate_seed` in batches of 20 → `data/seed/complaints.jsonl`. Target **600 rows**:
   - **Departments:** roads 90, sanitation 80, water 80, streetlights 60, power 60, drainage 70, traffic 40, health 40, education 30, town_planning 30, other 20.
   - **Language mix:** te 30%, en 25%, hi 20%, ur 10%, Latin-script code-mixed (Tenglish/Hinglish) 10%, other Indian 5%.
   - **Urgency:** critical 5%, high 20%, medium 45%, low 30%.
   - **Each row:** `text_original`, `language`, `script`, `text_en`, `category`, `sub_department`, `urgency`, `hazards`, `locality` (one of the 30), `landmark`.
   - Prompt for variety: different lengths (8–90 words), typos, emotion levels, Hyderabad landmarks, local words (e.g. "gunta", "neellu", "current poyindi", "galli", "nala").
   - Deduplicate near-identical rows.
   - **Story clusters** (master section 15): the 32-report pothole cluster, 35 contaminated-water reports, the streetlight case, the reopened drainage case. They are written in the same file with `story` tags.
2. **`human_test.jsonl`:** the team's 48 human-written complaints with labels (template file provided). **Never used for training.**
3. **`train_classifier.py`:**
   - Embed with `EMBEDDING_MODEL` (`"query: "` prefix for e5).
   - Augment training with each row's `text_en` as an extra sample, so the model is robust to both.
   - Stratified 80/20 split by category × language.
   - `LogisticRegression(class_weight="balanced", max_iter=2000)` wrapped in `CalibratedClassifierCV(cv=3)`.
   - Save `models/classifier.joblib`, `labels.json`, `metrics.json` (`AIMetrics` shape minus `live`).
   - **Benchmark** `intfloat/multilingual-e5-small` vs `sentence-transformers/LaBSE` on the test split; keep the better one (log both).
4. **`evaluate.py`:** accuracy, macro-F1, per-language accuracy (including a `code_mixed` bucket), confusion matrix, on both the synthetic test set and the human test set. Writes `metrics.json` and prints a table.
5. **Threshold tuning (P6):** choose the duplicate threshold maximizing F1 on known story clusters; check routing-confidence bands against accuracy.
6. **`seed_db.py`:**
   - Wipes demo tables.
   - Inserts departments, wards, assets (200 assets, e.g. `SL-KKP-0042`, spread across wards, some linked to seed grievances), auth users + profiles for the 7 demo accounts plus about 35 more officers (≥ 1 per department per zone) via the Supabase admin API (`email_confirm: true`).
   - **Grievances from the dataset:**
     - Timestamps over the last 180 days with a monsoon bump (July–September for drainage/water ×1.8).
     - Statuses: closed 60% (85% citizen-verified), in progress 15%, assigned 12%, pending verification 6%, registered/needs_review 4%, reopened 3%.
     - Resolution hours log-normal per department; ratings skewed 3–5; locations = random points inside the locality's ward polygon.
     - Embeddings computed; timelines with real hash chains; story scenarios placed exactly (spike in the **last 48 hours**).
   - Inserts a `model_versions` v1 row. Idempotent.
7. **Retrain loop (features 52, 201):** `POST /admin/ai/retrain` runs training in a worker thread using seed + `routing_corrections` (corrections weighted ×3), evaluates on the same frozen test sets, writes a new version, hot-swaps the classifier, and returns `AIMetrics` with history.
8. **`notebooks/model_report.ipynb`** (P7): dataset charts, per-language accuracy, confusion matrix, example predictions, for judges.

---

## 8. Officer, resolution and escalation

- **Brief** (`officer_brief`): input = summary, fields, AI image descriptions, last 10 timeline events, the 3 most similar *resolved* grievances (pgvector) with their resolution notes. Output `OfficerBrief`. Cache by `(id, updated_at)`.
- **Draft reply:** `draft_reply(intent, case facts, extra_en)` returns English ≤ 80 words, polite, with no promises beyond the SLA. Then `localize_reply` produces `draft_citizen`. On send (`/message`), store both and notify the citizen.
- **Status changes:**
  - Setting `in_progress` records `first_response_at` if empty.
  - `delay_reason` (select list: awaiting material, contractor scheduled, inter-department dependency, weather, access issue, other + text) is localized and shown to the citizen (feature 84).
- **Resolve** (`/resolve`, features 115, 116, 140, 253, 275):
  1. **Checks:**
     - `distance_m` between the proof photo geo (device GPS from the request, or EXIF GPS) and the grievance location.
     - **Perceptual hash** (`imagehash.phash`) distance to every citizen photo; distance < 8 → `duplicate_photo=true`.
  2. **`verify_resolution` with Gemini vision** on the citizen photo(s) + proof photo + summary → `{verdict, confidence, reasons_en[], same_location, issue_resolved_visible}`.
  3. **Final verdict:**
     - `duplicate_photo` or `distance_m > 500` → `suspicious` regardless.
     - Otherwise Gemini's verdict; provider unavailable → `unclear`.
  4. Status → `resolved_pending_verification`. Events `resolution_submitted` + `ai_verification`. Notify the citizen with a `verification_request`. If `suspicious`, create an alert and notify the supervisor.
- **Citizen feedback:**
  - Accepted → `closed` (`citizen_verified`) with rating.
  - Rejected → `reopened`, `reopen_count += 1`, escalation +1. `reopen_count ≥ 2` → `repeated_reopen` alert; a dispute goes to `review-queue?kind=disputed` (feature 123).
- **Appeals:** filed by the citizen; decided by a supervisor; tracked separately (features 113, 114).
- **Scheduler** (APScheduler, every 2 minutes, plus immediately after a clock advance), using the virtual clock:
  - SLA breach → escalation level 1 (supervisor notified, `escalated` event).
  - Breach + 50% of the SLA → level 2 (admin).
  - Critical 2 hours overdue → level 2 + `overdue_critical` alert.
  - Emergency unconfirmed after 30 minutes → `emergency_unconfirmed` alert.
  - `resolved_pending_verification` older than 7 days → `closed` (`auto_closed_unverified`).
  - Spike scan every 10 minutes.
- **Virtual clock:** `clock.now()` = UTC now + `settings.demo_clock_offset_minutes`. `POST /admin/demo/clock {advance_hours}` and `/admin/demo/reset` (re-runs `seed_db` story placement quickly, or restores a snapshot) only work when `DEMO_MODE=true`.

## 9. Analytics (`analytics.py`)
- **KPIs over `days`:**
  - total, open, resolved, overdue (open and past due), critical open, needs review;
  - average resolution hours (closed);
  - average first response hours;
  - SLA compliance = resolved within SLA / resolved;
  - satisfaction average; reopened %;
  - deltas vs the previous equal period.
- **Department score (transparent, shown in the UI):** `0.4·SLA% + 0.3·(satisfaction/5·100) + 0.2·(100 − reopen%) + 0.1·speed_index`, where `speed_index = 100·clamp(median_all/median_dept, 0, 1)`. Rank descending.
- **Spikes (features 185, 192, 265):**
  - For each (category, ward): daily counts for the 28 days before the last 24 hours → μ, σ. Spike if `count_24h ≥ max(5, μ + 3σ)`.
  - Same check citywide per category.
  - The alert includes the languages seen and 3 example grievance ids.
- **Recurring problems (feature 99):** assets or 100 m grid cells with ≥ 3 grievances in 90 days in the same category → returned on the incidents endpoint and as `repeated` flags.
- **Insights (feature 194):**
  - Compute a stats dict, then `insights_summary` writes 4–5 bullets **using only the given numbers**.
  - **Numbers guard:** every number in the output must appear in the input (regex check). If not, retry once, then fall back to template sentences. Set `numbers_verified`.
- **Public endpoints:**
  - Aggregates only; map points jittered by up to 75 m with no ids or text.
  - Exclude `is_private` grievances entirely.
  - `recent_resolved` only uses grievances whose citizen gave a 4–5 rating, and **never** shows citizen photos of people. Use proof photos only.

## 10. Security and limits
- **Auth:** verify Supabase JWTs with the project JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached 10 minutes). Fall back to `GET /auth/v1/user` for legacy HS256 projects.
- **Roles:** load the role from `profiles`. Officers see only their department (and wards, unless supervisor/admin). Citizens see only their own grievances; guests see theirs via session or PIN.
- **Rate limits (slowapi):** `/chat/turn` 30/min per IP, `POST /grievances` 10/hour per user/IP, `/uploads` 30/hour, `/speech/*` 30/hour, public endpoints 120/min. Return friendly 429 messages.
- **Uploads:**
  - Images only (`jpeg/png/webp`), ≤ 8 MB. Re-encode to WebP ≤ 1600 px.
  - Read EXIF GPS **then strip all EXIF**.
  - Local quality check: Laplacian-variance blur and mean brightness → `quality {ok, issue}`.
- **Officer views:** see `description_masked`; only admins can request the original. Anonymous grievances hide citizen identity from officers.
- **CORS** from `ALLOWED_ORIGINS`; never log tokens or raw complaint text.

## 11. Deployment
- **Dockerfile** (python:3.11-slim):
  - Install CPU torch from the PyTorch CPU index, then `requirements.txt`.
  - **Pre-download the embedding model at build time.**
  - Copy `ml/models` and `data`. Expose 7860; `uvicorn app.main:app --host 0.0.0.0 --port 7860`.
- **Hugging Face Space:** Docker SDK, secrets for env vars. Startup warm-up: load embeddings + classifier, run one dummy embed.
- **`/health`:** reports provider reachability (cached 60 seconds).
- **Early deploy:** in P1, deploy a hello-world to the Space so the URL exists early. Record the URL in `docs/progress/B.md` and have B's human post it in the team chat.
- **Deploy from the branch:** until the H30 integration merge, deploy straight from `feat/ai-engine` after every phase. This is how A and C use the backend without merging.

## 12. Testing (`services/api/tests`)
- **Unit:** PII masking, emergency keywords (true and false positives), priority formula, routing vote, SLA math, hash chain verify/tamper, duplicate scoring, numbers guard.
- **Integration (against a test schema or the dev DB):**
  - chat turn → confirm → grievance created with timeline;
  - support existing;
  - resolve with the same photo → `suspicious`;
  - reopen;
  - clock advance → escalation;
  - retrain.
- **Fallback tests:** `FORCE_FAIL_GEMINI=true` still produces a grievance (Groq path); both failing still produces a grievance (classifier + rules, English text = original).
- **Latency check script:** 10 sequential chat submissions, report p50/p95 (target p50 < 5 s).

## 13. Stretch for B
- S1 Surge Mode: endpoint flags a citywide spike in flooding/drainage → `incident_mode` + aggregated incident board data.
- S2 Root-cause graph: link incidents within 300 m across categories in 72 hours (e.g. water leak → road damage → flooding) → `GET /admin/root-cause`.
- S3 Overpass near-school/hospital factor.
- S4 phash similarity across citizen photos for duplicates.
- S5 document photo field extraction.
- S6 monthly report.
- S7 seasonal forecast (per category: same month last year × trend).
- S10 Telegram bot (free Bot API) reusing `/chat/turn`.
