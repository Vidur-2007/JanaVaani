# Contract notes — Laptop B

Additive changes to the shared contract (new optional fields, new endpoints). Newest first.

- **2026-11-02 (Fix Phase 1)** `POST /auth/demo-login` now returns 403 `demo_login_disabled` when `SUPABASE_URL` is set, unless `ALLOW_DEMO_LOGIN=true`. App-issued tokens are accepted only while `DEMO_MODE=true`. Frontends that sign in through Supabase are unaffected.

- **2026-11-02 (P2)** Additive optional fields: `DuplicateMatch.signals` (text_cosine, distance_m, same_category, age_days, embedding_mode); `AIVerification.assessment` (`verified|likely_resolved|needs_human_review|rejected_evidence`). New endpoint (DEMO_MODE only): `POST /api/v1/auth/demo-login {email}` → `{access_token, profile}` for seeded `@janavaani.test` accounts when Supabase Auth is not configured. Media URLs are `/api/v1/uploads/{id}` in offline mode (Supabase signed URLs when Storage is configured).

- **2026-11-02 (requests from A, `docs/contract-notes/A.md`)**
  - New additive endpoint `GET /api/v1/me` (any signed-in user incl. guest) → `{id, role, name, email, preferred_language, department_id}`; 401 without a token.
  - `ml/seed_db.py` now sets `app_metadata.role` and `user_metadata.{name, role}` on every seeded Supabase user (created via the admin API; re-seeding updates existing users).
  - Ward ids follow `W-<ZONE>-NN` with zone codes **SLP, KKP, KHB, SEC, CHR, LBN** (Charminar changed from CHM → CHR to match A's mocks). Kukatpally = `W-KKP-01`, Miyapur = `W-SLP-04`.
  - Asset ids `<TYPE>-<ZONE>-NNNN` with TYPE ∈ SL, DR, WP, BN, RD, TS (e.g. `SL-KHB-0001`).
  - Guest PIN: returned only on submit; `GET /grievances/{id}?pin=` works with no auth header (covered by tests).
