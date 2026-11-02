# Laptop B handover — JanaVaani AI engine & backend

**Branch:** `feat/ai-engine` (8 phase commits on top of `v0-scaffold`, authored by gmur0844-eng). **Verdict: FUNCTIONALLY COMPLETE WITH LIMITATIONS** — every one of the 57 endpoints is implemented and tested in offline mode (41 automated tests pass); the live Supabase / Gemini / Groq / Hugging Face integrations are coded but untested because no credentials existed in the build session.

## 1. Architecture
See `docs/architecture.md`. FastAPI (`services/api`) → SQLAlchemy 2 (psycopg v3 on Supabase Postgres; SQLite offline mode) · AI gateway (Gemini/Groq REST, fallback chain, diskcache) · own TF-IDF + calibrated LR classifier · e5 embeddings with lexical fallback · APScheduler on a virtual clock · hash-chained audit.

## 2. P1–P8 compliance matrix (PROMPTS-B.md)
Status: ✅ done & tested · 🟡 done, untested against the live service / partial · ❌ not done (reason given)

| Phase | Requirement | Status | Evidence / limitation |
|---|---|---|---|
| P1 | API skeleton, config, JWT (JWKS + fallback), require_role, clock, slowapi, CORS, ApiError, /health | ✅ | test_p1 (health); JWKS path untested (no Supabase) |
| P1 | async psycopg pool | 🟡 | SQLAlchemy + psycopg v3 sync engine in threadpool (deviation, documented) |
| P1 | schemas.py mirrors every §8 type | ✅ | `app/schemas.py` |
| P1 | data/ files + service_guide.md | ✅ | test_p1 meta (4 languages verified); guide ≈1,250 words |
| P1 | build_wards.py Voronoi geojson | ✅ | 30 polygons |
| P1 | migrations, RLS, realtime, bucket, apply_migrations | 🟡 | SQL written; **not run against Supabase** (no project); PostGIS/pgvector unavailable in sandbox |
| P1 | AI gateway (all rules) | ✅ | test_p1 gateway tests with mocked providers; REST via httpx instead of SDKs |
| P1 | generate_dataset with Gemini + story clusters | 🟡 | offline phrase-bank generator (1,335 rows); stories placed by seed_db; LLM generation needs a key |
| P1 | Dockerfile + HF deploy | 🟡/❌ | Dockerfile written, not built; **HF Space not deployed** (needs team account) |
| P1 | meta endpoints #20–#24, #57 | ✅ | test_p1 |
| P2 | 600 rows + human_test_template | ✅ | 1,335 rows; template file; 48-row hand-written set (replace with team's) |
| P2 | train_classifier + e5 vs LaBSE benchmark + evaluate.py | 🟡 | trained + evaluated; `--features benchmark` coded, not runnable without model download |
| P2 | seed_db per §7.6 | ✅ | 646 grievances, 3.6k events, 200 assets, stories; Supabase auth users only when keys set |
| P2 | pipeline modules | ✅ | intake is deterministic (no LLM `intake_turn`); Nominatim not wired |
| P2 | endpoints #1–#6, #12, #13 | ✅ | test_p2 (13 transcribe returns 501 without Groq key) |
| P2 | tests + latency script | ✅ | p50 29 ms offline (no LLM latency included) |
| P3 | #7–#11, #14–#19, #28–#34, #41, #42, RBAC, live_events | ✅ | test_p3 (9 tests) |
| P4 | #35–#40, scheduler, #55–#56, #43–#49 | ✅ | test_p4 (7 tests) incl. own-photo → suspicious, +48 h → escalations, Charminar spike |
| P5 | #50–#54, tamper_demo, public #25–#27, #17, rate limits, spam, record_demo, warm-up, caching | ✅ | test_p5 (8 tests) |
| P5/P7 | PRs "Integration" / "Final: AI engine" | ❌ | push from build session refused (Claude GitHub App not installed); push from Cursor, then open PR |
| P6 | evaluate + error analysis, threshold tuning, emergency precision, failure drills | ✅ | `ml/models/tuning.json`; emergency recall 0.03→0.82 @ precision 1.0 |
| P6 | prompt quality pass (20 conversations), LLM data augmentation | ❌ | needs live Gemini/Groq keys |
| P7 | story verification, notebook (+HTML), architecture.md | ✅ | `ml/notebooks/`, `docs/architecture.md` |
| P7 | stretch §13 | ❌ | not started (optional) |
| P8 | fresh keys, redeploy, seed, record_demo, latency, tamper demo, runbook | 🟡 | `docs/runbook.md` written; deploy/warm-up steps need keys + HF account |

## 3. Model results (measured, `ml/models/metrics.json`)
Synthetic group-split test (n=392, unseen phrasings): **accuracy 0.778, macro-F1 0.782** · Human-written (n=48): **accuracy 0.750, macro-F1 0.776** · per-language synthetic: en 0.94, code-mixed 0.92, te 0.71, hi 0.69, ur 0.42 · confidence bands: auto 95.9 %, flagged 77 %, review 42.9 %. Data is template-generated → synthetic numbers are optimistic.

## 4. Startup (local, offline mode)
```bash
cd services/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # sentence-transformers optional offline; e5 downloads on first start if allowed
cp .env.example .env                     # leave DATABASE_URL/keys empty for offline mode
cd ../.. && python ml/seed_db.py         # demo city
cd services/api && uvicorn app.main:app --reload --port 8000
# Swagger: http://localhost:8000/docs   Tests: python -m pytest tests -q
```
**Live mode:** fill `.env` (Supabase Session pooler URI, keys) → `python ml/apply_migrations.py` → `python ml/seed_db.py` → start.

## 5. Deployment (Hugging Face Space, Docker SDK)
`docker build -f services/api/Dockerfile -t janavaani-api .` from the repo root; on HF set the `.env` values as Space secrets; port 7860. Then `python scripts/record_demo.py --base https://<space>.hf.space/api/v1`.

## 6. Integration — Laptop A and C
- Base URL `VITE_API_BASE_URL=<api>/api/v1`, `VITE_API_MODE=hybrid`. All paths/shapes follow master §8/§9; additive fields are in `docs/contract-notes/B.md`.
- Auth: Supabase access token as Bearer. Without Supabase (or with `ALLOW_DEMO_LOGIN=true`), `POST /api/v1/auth/demo-login {"email": "<demo>@janavaani.test"}` (DEMO_MODE) returns a token + profile.
- Media URLs are `/api/v1/uploads/{id}` (relative to the API host) in offline mode.
- Realtime: subscribe to `live_events` (audiences `user:<id>`, `dept:<id>`, `role:admin`, `public`); signals only.
- `/api/v1/translate` returns 503 `translation_unavailable` when providers are down — show the original text.

## 7. Demo
Follow master §16 with the seeded accounts (password `Demo@2026` when Supabase auth users are created). Troubleshooting: `docs/runbook.md`.
