# Contract notes — Laptop B

Additive changes to the shared contract (new optional fields, new endpoints). Newest first.

- **2026-11-02 (P2)** Additive optional fields: `DuplicateMatch.signals` (text_cosine, distance_m, same_category, age_days, embedding_mode); `AIVerification.assessment` (`verified|likely_resolved|needs_human_review|rejected_evidence`). New endpoint (DEMO_MODE only): `POST /api/v1/auth/demo-login {email}` → `{access_token, profile}` for seeded `@janavaani.test` accounts when Supabase Auth is not configured. Media URLs are `/api/v1/uploads/{id}` in offline mode (Supabase signed URLs when Storage is configured).
