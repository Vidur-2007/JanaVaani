# If something breaks during the demo (Laptop B runbook)

**10 minutes before judging:** open `https://<space>.hf.space/api/v1/health` (wakes the Space). Expect `"status": "ok"` and `classifier: loaded`. Then Admin → Demo → reset the clock.

| Symptom | Fix (fastest first) |
|---|---|
| Space asleep / 502 | Open `/api/v1/health`, wait 30–60 s. Still down → HF Space → **Restart**. |
| `health.providers.gemini` or `groq` = `unavailable` | Check Space secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`). Keep going: every flow has a deterministic fallback; keep `DEMO_MODE=true` so cached demo answers replay instantly. |
| AI answers slow or rate-limited (429) | `DEMO_MODE=true` + run `python scripts/record_demo.py --base <url>/api/v1` beforehand. If live keys are exhausted, set `FORCE_FAIL_GEMINI=true` / `FORCE_FAIL_GROQ=true` to switch to fallbacks without waiting on timeouts. |
| Demo data messed up | Admin → Demo → **Reset** (`POST /admin/demo/reset`) or `python ml/seed_db.py`. Stories are re-placed relative to now. |
| Escalations needed for the time-travel moment | Admin → Demo → **+48h** (`POST /admin/demo/clock {"advance_hours": 48}`) — escalations run immediately. Reset sets the clock back to 0. |
| Audit tamper demo | `python scripts/tamper_demo.py GRV-… --restore-after 60` → show `/admin/audit/verify?grievance_id=…` turning red → it restores itself. |
| Login fails (Supabase down / not configured) | DEMO_MODE fallback: `POST /api/v1/auth/demo-login {"email": "admin@janavaani.test"}` returns a token. With Supabase configured it is closed: set `ALLOW_DEMO_LOGIN=true` in the Space secrets and restart, and set it back afterwards (it gives passwordless admin). |
| DB unreachable | Unset `DATABASE_URL` in the Space secrets → API falls back to the bundled SQLite file; run `python ml/seed_db.py` in the Space shell. |
| Wrong department on stage | Use the officer **Reassign** (logs a routing correction), then Admin → AI → **Retrain** to show learning. |

**Key URLs:** `/docs` (Swagger) · `/api/v1/health` · `/api/v1/admin/ai/metrics` · `/api/v1/admin/alerts`.
