# Production seed plan (`ml/seed_db.py`) — not run

What `python ml/seed_db.py` would do to the production Supabase project, so it can be approved or refused.
Counts come from a run against a throwaway local SQLite file (2026-11-03, default `--n 600`), not against Supabase.

## Before running
1. Apply migrations `0001`–`0006` (`python ml/apply_migrations.py`; all are idempotent). **`0004` and `0005` must be applied
   before seeding or deploying the current API**: the code writes `grievances.fields` and `closure_type = 'disputed'`.
   On Postgres the API no longer creates tables at startup; the schema comes only from these migrations.
2. Run with the server's embedding mode: production reports `embeddings: lexical`, so seed with `USE_EMBEDDINGS=false`.
   Seeded vectors from another mode are skipped by duplicate matching, which would break the Miyapur demo step.
3. Set `DATABASE_URL` (Session pooler), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in the shell, never in the repo.

## 1. Deletes (destructive)
`wipe()` deletes every row in: `live_events`, `notifications`, `alerts`, `routing_corrections`, `ai_calls`, `appeals`, `messages`,
`chat_sessions`, `supporters`, `timeline_events`, `media`, `grievances`, `incidents`, `assets`, `model_versions`, `profiles`,
`settings`, and on Postgres `wards` and `departments`. The append-only trigger on `timeline_events` is bypassed for that
transaction only (`set local janavaani.allow_tamper = on`).

**Not deleted:** Supabase Auth users and Storage objects. Re-seeding updates the existing auth users' metadata.

## 2. Supabase Auth (admin API, service key)
61 users, all `@janavaani.test`, `email_confirm: true`, password **`Demo@2026`** (published in the repo and the frontend).
About 3 admin calls per user (create → if it exists, list and update metadata `role`, `name`).

| Role | Accounts |
|---|---|
| admin | `admin@janavaani.test` (Commissioner's Office) |
| supervisor | `supervisor@janavaani.test` (Deputy Commissioner, all departments) |
| officer (named) | `ravi.roads@` (roads; Kukatpally + Serilingampally), `sunitha.electrical@` (streetlights; Kukatpally, Khairatabad, Serilingampally), `farhan.water@` (water; Charminar) |
| officer (generated) | 54 accounts `<department>.<zone code>@janavaani.test`: one per department per zone not covered above |
| citizen | `lakshmi@janavaani.test` (te), `imran@janavaani.test` (ur) |

**Risk:** anyone who reads the repo can sign in to production as admin or supervisor with `Demo@2026`. That is fine for a
judged demo; for anything longer, change the admin and supervisor passwords in the Supabase dashboard after seeding.

## 3. Database rows written
| Table | Rows | Notes |
|---|---|---|
| `departments`, `wards` | 11, 30 | Postgres only; ward polygons from `data/geo/wards.geojson` |
| `profiles` | 61 | 1 admin, 1 supervisor, 57 officers, 2 citizens; ids = Supabase Auth user ids |
| `assets` | 200 | streetlights, drains, water pipes, bins, road segments, signals across the 30 wards |
| `grievances` | 646 | 600 history rows over the last 180 virtual days + 46 story rows. Status mix: closed 363, assigned 93, in progress 86, pending verification 51, needs review 30, reopened 14, merged 7, registered 2 |
| `timeline_events` | 3,561 | real hash chains |
| `incidents` | 1 | Miyapur X Roads pothole cluster (8 members, 7 merged) |
| `supporters` | 31 | `seed:<n>` keys on the Miyapur parent (32 reports in total) |
| `media` | 2 | the Ameerpet streetlight photo, as citizen evidence and as the re-used "proof" |
| `alerts` | 5 | 3 water spikes (24 citywide, 16 in W-CHR-01, 8 in W-CHR-02; every member id stored), 1 suspicious closure, 1 repeated reopen |
| `model_versions` | 1 | the shipped classifier's metrics |
| `settings` | 1 | `demo_clock_offset_minutes` |
| `live_events` | 3 | from the spike alerts |

No notifications, appeals, chat sessions, messages, routing corrections or AI-call rows are written.
`grievances.fields` stays `{}` for seeded rows.

## 4. Storage
One object: `evidence/seed/streetlight_citizen.webp` (generated image, about 4 KB) in the private `evidence` bucket.

## 5. Story placement
Stories are placed relative to the virtual clock at seeding time: live wire near a Kukatpally school (3 h old, critical,
unconfirmed emergency), Miyapur pothole incident (32 reports, te/hi/en/Tenglish), Charminar/Falaknuma water spike
(35 complaints, 24 in the last 24 h), Ameerpet suspicious streetlight closure, Malakpet drainage reopened 3 times.
Reseeding moves them back to "now", so seed shortly before a demo.
