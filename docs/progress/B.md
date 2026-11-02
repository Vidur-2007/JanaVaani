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

## In progress
P2 — model + core pipeline + chat/grievance endpoints.

## Next
P3 tracking/notifications/officer core → P4 officer AI/verification/escalation/analytics → P5 hardening.

## Blockers / deviations (honest list)
- **No Supabase project, Gemini or Groq keys were available in the build session.** The API runs in *offline mode* (SQLite file DB, deterministic AI fallbacks) until `services/api/.env` is filled. Migrations were NOT run against Supabase; run `python ml/apply_migrations.py` with `DATABASE_URL` set.
- DB access uses SQLAlchemy 2 with the psycopg v3 driver (sync engine in FastAPI's threadpool) instead of a raw async psycopg pool, so the same code runs on Supabase Postgres and the offline SQLite mode. Column types map to Postgres-native `uuid`, `text[]`, `jsonb`, `vector(384)`.
- Gemini/Groq are called over their REST APIs with `httpx` (same endpoints the `google-genai` / `groq` SDKs wrap).
- Dataset: generated offline from hand-written multilingual phrase banks (no Gemini key). `generate_dataset.py` records `phrase_id` so evaluation uses a leakage-free group split. LLM generation (`generate_seed`) not run.
- Hugging Face Space not deployed (needs the team's HF account) — no public API URL yet.

## API URL / live endpoints
- URL: _not deployed yet_ (local: `http://localhost:8000/api/v1`).
- Live after P1: #20 `/meta/departments`, #21 `/meta/wards`, #22 `/meta/wards.geojson`, #23 `/meta/emergency-contacts`, #24 `/meta/assets/{id}`, #57 `/health`.

## Contract notes
See `docs/contract-notes/B.md`.
