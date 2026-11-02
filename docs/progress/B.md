# Progress — Laptop B (AI engine, backend, data, ML)

## Done
### P1 — Foundation
- `services/api` skeleton: FastAPI app, pydantic-settings config, CORS, ApiError envelope on every error, slowapi limiter, virtual clock, structured JSON logs, `/health` (cached 60 s).
- Auth: Bearer JWT verified against Supabase JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, 10 min cache) → legacy HS256 secret → DEMO_MODE app tokens; role loaded from `profiles`; `require(role)`.
- `app/schemas.py`: Pydantic v2 mirror of every master §8 type (identical snake_case).
- `data/`: departments (en/te/hi/ur names; required-field questions in 4 languages), 30 localities, SLA table, emergency contacts (112/108/101/1912), emergency keywords (spec starter lists + hazard map), `knowledge/service_guide.md`.
- `ml/build_wards.py` → `data/geo/wards.geojson` (scipy Voronoi, clipped to bbox, "Approximate demo boundaries").
- `supabase/migrations/0001_schema.sql` (all §4 tables, postgis/vector/pgcrypto, indexes incl. GIST + HNSW, append-only trigger on `timeline_events`) and `0002_rls_realtime_storage.sql` (RLS on all tables, `live_events` audience policies, realtime publication, private `evidence` bucket); `ml/apply_migrations.py`.
- AI gateway: Gemini + Groq providers (`app/ai/providers/`), task registry primary/fallback, 12 s / 20 s timeouts, one jittered retry on 429/5xx/timeout, Pydantic validation + one repair call, diskcache 24 h + DEMO_MODE replay, `ai_calls` logging, FORCE_FAIL flags, prompts in `app/ai/prompts/*.md`.
- Dataset: `ml/generate_dataset.py` (see limitation below), 1,335 rows.
- Dockerfile (CPU torch, pre-downloads EMBEDDING_MODEL), requirements, `.env.example`.
- Meta endpoints #20–#24 and #57 live.
- Tests: `tests/test_p1_foundation.py` — PII masking, emergency true/false positives, language ID, gateway fallback (FORCE_FAIL_GEMINI, Gemini→Groq, malformed JSON → repair → fallback), meta + health. **8 passed** (SQLite offline mode).

### P2 — Model + core pipeline + chat/grievance endpoints
- Department classifier (`ml/train_classifier.py`, `ml/evaluate.py`): TF-IDF char 2–5 + word 1–2 → LogisticRegression(balanced) + CalibratedClassifierCV(cv=3); text_en augmentation; **group split by phrase_id** (no phrase in both train and test); domain glossary augmentation with automatic removal of any term found in the human test set. `--features e5|labse|benchmark` runs the Spec B §7.3 embedding benchmark when sentence-transformers + model download are available (not available in the build sandbox).
- **Measured:** synthetic held-out (unseen phrasings, n=392) accuracy 0.778, macro-F1 0.782; human-written set (n=48) accuracy 0.750, macro-F1 0.776. Per-language (synthetic): en 0.94, code_mixed 0.92, te 0.71, hi 0.69, ur 0.42 (weakest). Models in `ml/models/`.
- `ml/seed_db.py`: 7 demo accounts + one officer per department per zone, 200 assets, 600 history grievances (monsoon bump, status mix, log-normal resolution, ratings 3–5, real hash chains, embeddings), stories: live wire (Kukatpally), Miyapur pothole incident (32 supporters), Charminar/Falaknuma contaminated-water spike (35 in 48 h → spike alerts), suspicious streetlight closure (same photo), Malakpet drainage reopened 3×; model_versions v1. Supabase auth users via admin API when configured.
- Pipeline: safety (PII, emergency, spam, language/script ID incl. Tenglish/Hinglish), analyze (Gemini→Groq→deterministic rules; rules can only add hazards/emergency), classifier + Groq second opinion, routing vote (§6 formula + thresholds + explanation), priority (master §7), SLA/ETA/delay risk, least-loaded assignment with zone fallback, duplicates (score formula, 500 m, 30 days, related categories, explainable signals), hash-chained audit, notifications + live_events, multi-label linked grievances.
- Endpoints live: #1 chat/turn (emergency, track_status, duplicate_check, support_existing, file_new_anyway, edit, cancel, split), #2 analyze, #3 create, #4 check-duplicates, #5 support (incident at ≥3, priority recompute), #6 get (pin + internal filtering), #12 uploads (type/size validation, EXIF GPS read then stripped, WebP ≤1600 px, blur/brightness quality), #13 transcribe (Groq Whisper; 501 without key).
- Tests `tests/test_p2_pipeline.py`: routing vote, priority formula + floor, hash chain tamper detection, classifier load/predict, chat → confirm → grievance with both providers down, emergency → continue → guest PIN, duplicates + support, analyze/create, upload EXIF strip. **P1+P2: 17 passed.**
- `scripts/latency.py`: 10 submissions, offline mode p50 29 ms / p95 34 ms (no LLM calls; with Gemini/Groq keys expect provider latency on top).

### P3 — Tracking, notifications, search, officer core
- Citizen: #7 me/grievances (paged, status/q filters), #8 feedback (accept → closed citizen_verified; reject → reopened, escalation +1, `repeated_reopen` alert at ≥2), #9 reopen, #10 appeal, #11 citizen message (PII-masked), #14 tts (501 when not configured), #15 translate (same-language passthrough; 503 `translation_unavailable` when providers are down — never fakes a translation), #16 search (embedding similarity + keyword boost + guide sections; public scope strips text), #17 guide/ask (LLM grounded on service_guide.md; offline keyword retrieval with stemming + section citations), #18–#19 notifications (localized title/body, `all` marks all read).
- Officer core: #28 inbox (dept/ward scoping, filters, sort: emergency → critical overdue → score → SLA), #29 review-queue (routing / emergency / disputed / appeal), #30 status (transition rules, first_response_at, localized delay_reason; reject/close supervisor-only), #31 internal notes, #32 reassign (+ routing_corrections, human vote), #33 route-decision, #34 emergency confirm (SLA 4 h, critical) / deny, #41 officers with open/overdue counts, #42 incidents + recurring detection (asset or ~100 m cell, ≥3 in 90 days).
- RBAC (Spec B §10): officers see only their department/wards; masked text for officers, raw only for admins; anonymous grievances hide the citizen name from gov users; citizens see only their own (or with ticket PIN); internal events hidden from citizens.
- live_events on create/update with `dept:<id>`, `user:<id>`, `role:admin`, `public` audiences.
- Tests `tests/test_p3_officer.py` (9). **P1–P3: 26 passed.**

### P4 — Officer AI, resolution verification, escalation, admin analytics
- #35 brief (similar resolved cases by embedding similarity, cached by updated_at; deterministic fallback brief labelled `generated_by: fallback`), #36 draft-reply (Groq EN → localized; template fallback), #37 officer message (localized, notifies citizen, sets first response).
- #38 resolve: distance check (request GPS or EXIF), perceptual-hash duplicate check (<8), Gemini vision when available, final rules (duplicate or >500 m → suspicious; no vision → `unclear` / `needs_human_review`, never "verified" by AI alone), suspicious alert, verification_request notification; incident fan-out with community_update notifications in each citizen's language. #39 appeal decision (upheld → reopen). #40 bulk status/assign/merge (incident creation, merged children).
- APScheduler (escalation + auto-close every 2 min, spike scan every 10 min) on the virtual clock; also runs immediately after a clock advance. Level 1 at SLA breach (supervisors notified), level 2 at breach + 50 % SLA or critical +2 h (admins, `overdue_critical` alert), `emergency_unconfirmed` after 30 min, auto-close after 7 days.
- #55 demo clock (GET/POST), #56 reset (DEMO_MODE only; re-seeds).
- Analytics from persisted rows only: #43 KPIs with deltas vs previous period, #44 department performance (0.4·SLA% + 0.3·satisfaction + 0.2·(100−reopen%) + 0.1·speed_index, ranked), #45 workload, #46 trends (day/week), #47 breakdown (ward/zone/category), #48 admin map (with ids), #49 alerts (spike μ+3σ per (category, ward) and citywide, overdue_critical, repeated_reopen, suspicious_closure, routing_review_backlog, emergency_unconfirmed).
- Fix found by tests: escalation notifications now reach city-wide supervisors.
- Tests `tests/test_p4_admin.py` (7): brief/draft/message, own-photo → suspicious, far-away → suspicious, new photo without vision → needs_human_review, appeal + bulk merge, clock +48 h → escalations, Charminar water spike detected (ur/hi), analytics. **P1–P4: 33 passed.**

## In progress
P5 — insights, AI metrics/retrain, public, guide, hardening.

## Next
P3 tracking/notifications/officer core → P4 officer AI/verification/escalation/analytics → P5 hardening.

## Blockers / deviations (honest list)
- **No Supabase project, Gemini or Groq keys were available in the build session.** The API runs in *offline mode* (SQLite file DB, deterministic AI fallbacks) until `services/api/.env` is filled. Migrations were NOT run against Supabase; run `python ml/apply_migrations.py` with `DATABASE_URL` set.
- DB access uses SQLAlchemy 2 with the psycopg v3 driver (sync engine in FastAPI's threadpool) instead of a raw async psycopg pool, so the same code runs on Supabase Postgres and the offline SQLite mode. Column types map to Postgres-native `uuid`, `text[]`, `jsonb`, `vector(384)`.
- Gemini/Groq are called over their REST APIs with `httpx` (same endpoints the `google-genai` / `groq` SDKs wrap).
- Dataset: generated offline from hand-written multilingual phrase banks (no Gemini key). `generate_dataset.py` records `phrase_id` so evaluation uses a leakage-free group split. LLM generation (`generate_seed`) not run.
- Nominatim geocoding not implemented: text locations resolve by ward/locality name match; GPS/pin by nearest ward centroid (= Voronoi cell). PostGIS `ST_Contains` path is in the schema but untested here (no PostGIS in the build sandbox).
- Hugging Face Space not deployed (needs the team's HF account) — no public API URL yet.

## API URL / live endpoints
- URL: _not deployed yet_ (local: `http://localhost:8000/api/v1`).
- Live after P4: #35–#40, #43–#49, #55, #56.
- Live after P3: #7–#11, #14–#19, #28–#34, #41, #42.
- Live after P2: #1–#6, #12, #13 (+ demo helper `POST /auth/demo-login` in DEMO_MODE).
- Live after P1: #20 `/meta/departments`, #21 `/meta/wards`, #22 `/meta/wards.geojson`, #23 `/meta/emergency-contacts`, #24 `/meta/assets/{id}`, #57 `/health`.

## Contract notes
See `docs/contract-notes/B.md`.
