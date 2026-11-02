# Prompts — Laptop B (AI Engine, Backend, Data, ML)

**Branch:** `feat/ai-engine` · **Specs:** `docs/specs/00-MASTER-SPEC.md` + `docs/specs/02-SPEC-B-AI-ENGINE.md`

## How to use
1. Open Claude Code in the repo root.
2. Paste one phase prompt at a time and let it finish.
3. Do the **Human checks**, then continue.
4. **No merges until H30.** At the end of every phase, push to `feat/ai-engine` and **redeploy the Hugging Face Space from your branch**. That deployment is how A and C use your work. Post the API URL (once) and the list of newly live endpoints (every phase) in the team chat.
5. If you hit the usage limit, start a new session with the **Resume prompt**.

**Before P1 (human):** have the Supabase URL, keys, Session pooler URI, Gemini and Groq keys ready in `services/api/.env`. Never commit `.env`.

## Resume prompt
```
You are Laptop B on the JanaVaani hackathon project (branch feat/ai-engine).
Read docs/specs/00-MASTER-SPEC.md, docs/specs/02-SPEC-B-AI-ENGINE.md and docs/progress/B.md (and CLAUDE.md if present).
Summarize in 5 bullets where we are and what remains in the current phase, then continue.
Rules: only edit services/, ml/, data/, supabase/, scripts/ and B's docs files; never edit apps/ or packages/contracts; never merge or pull another branch before the H30 integration merge; commit after each task and push to feat/ai-engine.
```

---

## P1 — Foundation: API skeleton, database, AI gateway, data, deploy (H0–H6)
```
You are Laptop B on JanaVaani, a 48-hour hackathon project (Neural Storm, JNTUH, problem HI-02: multilingual citizen grievance platform). You own the AI engine, backend, database, ML model and seed data.
Read docs/specs/00-MASTER-SPEC.md fully and docs/specs/02-SPEC-B-AI-ENGINE.md fully.
Create branch feat/ai-engine from main if it doesn't exist.

Phase 1 tasks, commit after each:
1. services/api skeleton per Spec B §2.1: FastAPI app, config (pydantic-settings), async psycopg pool using DATABASE_URL (Supabase Session pooler), Supabase JWT verification via JWKS with fallback, require_role, virtual clock, slowapi, CORS, structured errors (ApiError shape), /health.
2. app/schemas.py: Pydantic v2 mirror of EVERY type in master §8 with identical snake_case names.
3. data/: departments.json (names in en/te/hi/ur, required fields with questions in 4 languages), geo/localities.json (Spec B §3.2), sla.json, emergency_contacts.json, emergency_keywords.json (starter lists from Spec B §3.3), knowledge/service_guide.md (~1500 words).
4. ml/build_wards.py → data/geo/wards.geojson (Voronoi, clipped bbox).
5. supabase/migrations: full schema, indexes, RLS + live_events realtime publication, storage bucket per Spec B §4; ml/apply_migrations.py to apply them. Run it against Supabase.
6. AI gateway (Spec B §5): Gemini + Groq providers, task registry with primary/fallback, timeouts, retry, JSON schema validation + one repair, diskcache, demo replay, ai_calls logging, FORCE_FAIL flags. Prompt templates in app/ai/prompts/ for every task.
7. ml/generate_dataset.py and START it (it runs in batches; respect free-tier limits with sleep/backoff; resumable via append-only jsonl). Include story clusters from master §15.
8. Dockerfile (CPU torch, pre-download EMBEDDING_MODEL) and deploy a first version to a Hugging Face Docker Space. Write the public API URL into docs/progress/B.md.
9. Implement the read-only meta endpoints now (#20–#24, #57) so frontends can integrate early.
Write pytest tests for PII masking, emergency keywords, and the gateway fallback (with FORCE_FAIL_GEMINI).
At the end: push to feat/ai-engine (no merge, no PR) and redeploy the Space from this branch. Update docs/progress/B.md with the API URL and the live endpoint list, and print a short message I can paste into the team chat.
```
**Human checks:**
- [ ] Hugging Face Space builds; `https://<space>.hf.space/api/v1/health` returns OK.
- [ ] Supabase table editor shows all tables; extensions enabled.
- [ ] Watch dataset generation for 429 errors.

---

## P2 — Model + core pipeline + chat/grievance endpoints (H6–H12)
```
Resume context: Laptop B, feat/ai-engine. Read Spec B §6, §7.
Phase 2, commit after each:
1. Finish dataset generation (600 rows + story rows). Create data/eval/human_test_template.jsonl. If the human test set isn't in yet, continue without it and leave a TODO.
2. ml/train_classifier.py with the e5-small vs LaBSE benchmark; ml/evaluate.py; save models/classifier.joblib, labels.json, metrics.json. Print the metrics table. If LaBSE wins clearly, switch the vector dimension to 768 in a migration BEFORE seeding.
3. ml/seed_db.py exactly per Spec B §7.6 (demo accounts from master §14 + ~35 officers, wards, 200 assets, grievances with realistic history, embeddings, real hash chains, story scenarios, model_versions v1). Run it.
4. Pipeline modules: safety, intake state machine, analyze, embeddings + classifier, routing vote, geo (Nominatim cached + PostGIS ward), duplicates, priority, sla/eta/delay risk, assignment, audit chain, notify + live_events.
5. Endpoints #1 /chat/turn (full state machine incl. split, duplicates, emergency, track_status, ask_info), #2 analyze, #3 create (incl. multi-label linked grievances), #4 check-duplicates, #5 support (incl. incident creation + priority recompute), #6 get grievance (with pin + internal filtering), #12 uploads (validation, EXIF GPS read then strip, WebP, quality check, signed URLs), #13 speech/transcribe.
6. Tests: routing vote, priority formula, duplicate scoring, hash chain, chat turn → confirm → grievance created; fallback with FORCE_FAIL_GEMINI and both providers failing.
7. Latency script: report p50/p95 for 10 submissions (target p50 < 5 s; parallelize with asyncio.gather).
Push to feat/ai-engine and redeploy the Space from this branch (A and C switch their frontends to hybrid mode against it at H13; no merge needed). Update docs/progress/B.md listing which endpoints are live, log any added optional fields in docs/contract-notes/B.md, and print a team-chat message with the newly live endpoints.
```
**Human checks:**
- [ ] Paste the team's human-written complaints into `data/eval/human_test.jsonl`, then rerun `evaluate.py`.
- [ ] Try 5 manual `/chat/turn` conversations in Telugu, Urdu and Tenglish via `/docs` (Swagger).

---

## P3 — Tracking, notifications, search, officer core (H12–H18)
```
Resume context: Laptop B, feat/ai-engine. Read master §9 and Spec B §6.1, §8, §10.
Phase 3 endpoints + tests, commit after each group:
1. Citizen: #7 me/grievances, #8 feedback (accept → close; reject → reopen + escalation + repeated_reopen alert), #9 reopen, #10 appeal, #11 citizen message, #14 speech/tts (501 if not configured), #15 translate (cached table), #16 search (pgvector across languages + keyword fallback + guide sections), #18–#19 notifications.
2. Officer core: #28 inbox (filters, sort: emergency, critical overdue, score, SLA), #29 review-queue (routing/emergency/disputed/appeal), #30 status (+ first_response_at, delay_reason localized), #31 notes (internal), #32 reassign (+ routing_corrections), #33 route-decision, #34 emergency confirm (SLA 4h), #41 officers with workload, #42 incidents + recurring detection.
3. RBAC per Spec B §10 (department/ward scoping, anonymous identity hiding, masked text for officers).
4. live_events on every state change with correct audiences; notifications localized to the citizen's preferred language.
Push to feat/ai-engine and redeploy the Space (no merge, no PR). Update docs/progress/B.md (live endpoints list) and print a team-chat message.
```

---

## P4 — Officer AI, resolution verification, escalation, admin analytics (H18–H24)
```
Resume context: Laptop B, feat/ai-engine. Read Spec B §8, §9.
Phase 4, commit after each:
1. #35 officer brief (similar resolved cases via pgvector, cached by updated_at), #36 draft-reply (Groq EN → Gemini localized), #37 officer message.
2. #38 resolve with full verification (distance check, phash duplicate check, Gemini vision, final verdict rules, alerts, verification_request notification), #39 appeal decision, #40 bulk (status/assign/merge with incident fan-out + community_update notifications in each citizen's language).
3. Scheduler (APScheduler) on the virtual clock: escalation levels, critical overdue, unconfirmed emergency, auto-close after 7 days, spike scan. #55 demo clock + #56 reset (DEMO_MODE only).
4. Admin analytics: #43 KPIs with deltas, #44 department performance (transparent score), #45 workload, #46 trends, #47 breakdown, #48 admin map, #49 alerts (all kinds incl. spike detection per Spec B §9).
5. Tests: resolve with the citizen's own photo → suspicious; clock +48h → escalations; spike detection finds the Charminar water story.
Push to feat/ai-engine and redeploy the Space (no merge, no PR). Update docs/progress/B.md and print a team-chat message.
```

---

## P5 — Insights, AI metrics/retrain, public, guide, assets, hardening (H24–H30)
```
Resume context: Laptop B, feat/ai-engine. Read Spec B §7.7, §9, §10, §11.
Phase 5, commit after each:
1. #50 insights with the numbers guard; #51 audit list; #52 audit verify; scripts/tamper_demo.py.
2. #53 AI metrics (metrics.json + live stats from ai_calls + agreement/needs-review rates + history) and #54 retrain (worker thread, corrections ×3, frozen test sets, hot-swap, new model_versions row).
3. Public: #25 stats (excluding private; recent_resolved rules), #26 map (75 m jitter, no ids/text), #27 nearby (public-safe fields). #17 guide/ask grounded on service_guide.md with section citations.
4. Rate limits on all routes per Spec B §10; spam check integration; friendly 429s.
5. scripts/record_demo.py: run the master §16 demo inputs to warm the AI cache (DEMO_MODE replay).
6. Performance: warm-up on startup, connection pool sizing, cache public endpoints 60 s, confirm p50 < 5 s.
Push to feat/ai-engine and redeploy the Space. Then prepare for the H30 integration merge: run the full pytest suite, and open PR feat/ai-engine → main titled "Integration: AI engine" (the integrator merges B first). Update docs/progress/B.md with the final endpoint table and any contract notes.
```
**Human checks:**
- [ ] Ask Laptop A and C humans to check that hybrid mode shows **zero** mock fallbacks on their main flows.

---

## P6 — Evaluation hardening and prompt tuning (H30–H36)
```
Resume context: Laptop B, feat/ai-engine. The H30 integration merge is done: run git merge origin/main into feat/ai-engine once now (the only time until H42). Redeploy the Space from main's version if the integrator hasn't.
Phase 6:
1. Run evaluate.py on synthetic and human test sets; per-language error analysis; improve via data augmentation (more Tenglish/Urdu samples), prompt few-shots, and threshold tuning (duplicate F1 on story clusters; routing-confidence bands vs accuracy). Retrain; record versions.
2. Prompt quality pass on intake_turn and localize_reply: natural Telugu/Hindi/Urdu, polite and simple; max 4 follow-ups; never re-ask known fields. Test 20 conversations, especially code-mixed.
3. Emergency keyword precision: run all seed rows; fix false positives/negatives.
4. Failure drills: FORCE_FAIL_GEMINI, FORCE_FAIL_GROQ, both — every citizen and officer flow still works. Fix gaps.
5. Full pytest suite green. Push and redeploy (no PR yet; next merge is at H42). Update docs/progress/B.md.
```

## P7 — Demo story, model notebook, docs (H36–H42)
```
Resume context: Laptop B, feat/ai-engine (no merging until H42).
Phase 7:
1. Re-seed with final story placement (master §15) relative to the demo time; verify each story surfaces in the UI endpoints (incident with 32 supporters, Charminar spike alert, suspicious streetlight verification, Malakpet repeated reopen).
2. notebooks/model_report.ipynb: dataset distribution, per-language accuracy, confusion matrix, sample predictions, retrain history — export as HTML too.
3. docs/architecture.md: mermaid diagrams of the system and the per-complaint AI pipeline, gateway fallback table, free-tier list, privacy measures.
4. Stretch from Spec B §13 in order, only if all above is done.
At H42 open PR feat/ai-engine → main titled "Final: AI engine". Update docs/progress/B.md.
```

## P8 — Final deploy and warm-up (H42–H46)
```
Resume context: Laptop B.
Phase 8: after the integrator merges the final PRs, switch the Space secrets to the FRESH demo API keys, redeploy from main, run seed_db (story placement), run scripts/record_demo.py to warm the cache, verify /health, run the latency script, run the tamper demo once and restore. Write a one-page "If something breaks during the demo" runbook in docs/runbook.md (reset demo, reseed, toggle DEMO_MODE, restart Space).
```
**Human checks before judging:**
- [ ] Open the Space URL 10 minutes before the demo (wakes it up).
- [ ] Reset the demo clock.
