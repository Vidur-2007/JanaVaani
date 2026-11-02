<!-- Master spec §9, copied verbatim. FROZEN until the H30 integration merge. -->

## 9. API endpoints (base `/api/v1`)

- **Auth header:** `Authorization: Bearer <supabase access token>`. Guests use a Supabase anonymous session; tracking by ticket also accepts `?pin=`.
- **Errors:** always `ApiError`.
- **Lists:** return `Paged<T>`, query `page`, `page_size` (default 20).

| # | Method & path | Auth | Request → Response | UI |
|---|---|---|---|---|
| 1 | `POST /chat/turn` | any (incl. guest) | `ChatTurnRequest` → `ChatTurnResponse` | A |
| 2 | `POST /grievances/analyze` | any | `{text, ui_lang, media_ids?, location?}` → `GrievanceDraft` (quick form) | A |
| 3 | `POST /grievances` | any | `{draft: GrievanceDraft, location, media_ids, asset_id?, is_anonymous, is_private}` → `{grievance: Grievance, guest_pin?: string, duplicates?: DuplicateMatch[]}` | A |
| 4 | `POST /grievances/check-duplicates` | any | `{text, location, category}` → `DuplicateMatch[]` | A |
| 5 | `POST /grievances/{id}/support` | any | `{}` → `{support_count, incident_id?}` | A |
| 6 | `GET /grievances/{id}` | owner / guest pin / gov | `?pin=&lang=` → `GrievanceDetail` (internal events hidden for citizens) | A, C |
| 7 | `GET /me/grievances` | citizen/guest | `?status=&q=&page=` → `Paged<Grievance>` | A |
| 8 | `POST /grievances/{id}/feedback` | owner | `{accepted: boolean, rating?: 1-5, comment?, media_ids?}` → `GrievanceDetail` | A |
| 9 | `POST /grievances/{id}/reopen` | owner | `{reason, media_ids?}` → `GrievanceDetail` | A |
| 10 | `POST /grievances/{id}/appeal` | owner | `{reason}` → `Appeal` | A |
| 11 | `POST /grievances/{id}/messages` | owner | `{text, ui_lang}` → `Message` | A |
| 12 | `POST /uploads` | any | multipart `file, purpose, grievance_id?, lat?, lng?` → `Media` | A, C |
| 13 | `POST /speech/transcribe` | any | multipart `audio, language?` → `{text, language: Lang, duration_s}` | A |
| 14 | `POST /speech/tts` | any | `{text, lang}` → `audio/wav` (501 if not configured) | A |
| 15 | `POST /translate` | any | `{text, target_lang}` → `{text, source_lang}` | A, C |
| 16 | `GET /search` | any | `?q=&scope=mine|public|gov&lang=` → `{grievances: Grievance[], guide: {title, snippet, anchor}[]}` | A, C |
| 17 | `POST /guide/ask` | public | `{question, ui_lang}` → `{answer: Localized, sources: {title, anchor}[], department_id?}` | A |
| 18 | `GET /notifications` | user | → `Paged<Notification>` | A, C |
| 19 | `POST /notifications/{id}/read` | user | → `{ok: true}` (`id=all` marks all) | A, C |
| 20 | `GET /meta/departments` | public | → `Department[]` | all |
| 21 | `GET /meta/wards` | public | → `Ward[]` | all |
| 22 | `GET /meta/wards.geojson` | public | → GeoJSON FeatureCollection | all |
| 23 | `GET /meta/emergency-contacts` | public | → `EmergencyContact[]` | A |
| 24 | `GET /meta/assets/{id}` | public | → `Asset` | A, C |
| 25 | `GET /public/stats` | public | → `PublicStats` | A (landing), C |
| 26 | `GET /public/map` | public | `?category=&days=` → `MapPoint[]` (jittered, no ids, no text) | A, C |
| 27 | `GET /public/nearby` | public | `?lat=&lng=&radius_m=` → `{title: Localized, category, status, distance_m, support_count, grievance_id}[]` (public-safe fields only) | A |
| 28 | `GET /officer/inbox` | officer+ | `?status=&priority=&category=&ward=&q=&sort=&overdue=&page=` → `Paged<Grievance>` | C |
| 29 | `GET /officer/review-queue` | supervisor+ | `?kind=routing|emergency|disputed|appeal` → `Paged<Grievance>` | C |
| 30 | `POST /officer/grievances/{id}/status` | officer+ | `{status, note?, delay_reason?}` → `GrievanceDetail` | C |
| 31 | `POST /officer/grievances/{id}/notes` | officer+ | `{text}` → `TimelineEvent` | C |
| 32 | `POST /officer/grievances/{id}/reassign` | officer+ | `{department_id?, officer_id?, reason}` → `GrievanceDetail` | C |
| 33 | `POST /officer/grievances/{id}/route-decision` | supervisor+ | `{department_id, sub_department?}` → `GrievanceDetail` | C |
| 34 | `POST /officer/grievances/{id}/emergency` | supervisor+ | `{confirmed: boolean, note?}` → `GrievanceDetail` | C |
| 35 | `POST /officer/grievances/{id}/brief` | officer+ | `{refresh?: boolean}` → `OfficerBrief` | C |
| 36 | `POST /officer/grievances/{id}/draft-reply` | officer+ | `{intent: ReplyIntent, extra_en?}` → `DraftReply` | C |
| 37 | `POST /officer/grievances/{id}/message` | officer+ | `{text_en}` → `Message` (translated to citizen language) | C |
| 38 | `POST /officer/grievances/{id}/resolve` | officer+ | `{media_ids, note, lat?, lng?}` → `GrievanceDetail` with `ai_verification` | C |
| 39 | `POST /officer/grievances/{id}/appeal-decision` | supervisor+ | `{decision: 'upheld'|'dismissed', note}` → `GrievanceDetail` | C |
| 40 | `POST /officer/bulk` | officer+ | `{ids, action: 'status'|'assign'|'merge', payload}` → `{updated: number}` | C |
| 41 | `GET /officer/officers` | officer+ | `?department=` → `Officer[]` | C |
| 42 | `GET /officer/incidents` | officer+ | `?ward=&category=` → `Incident[]` | C |
| 43 | `GET /admin/kpis` | admin | `?days=30` → `KPIs` | C |
| 44 | `GET /admin/departments/performance` | admin | `?days=` → `DepartmentPerformance[]` | C |
| 45 | `GET /admin/officers/workload` | admin | `?department=` → `OfficerWorkload[]` | C |
| 46 | `GET /admin/analytics/trends` | admin | `?days=&group=day|week` → `TrendPoint[]` | C |
| 47 | `GET /admin/analytics/breakdown` | admin | `?by=ward|zone|category&days=` → `BreakdownRow[]` | C |
| 48 | `GET /admin/map` | admin | `?category=&status=&priority=&days=` → `MapPoint[]` (with ids) | C |
| 49 | `GET /admin/alerts` | admin, supervisor | → `Alert[]` | C |
| 50 | `GET /admin/insights` | admin | `?days=&refresh=` → `InsightSummary` | C |
| 51 | `GET /admin/audit` | admin | `?grievance_id=&type=&page=` → `Paged<TimelineEvent>` | C |
| 52 | `GET /admin/audit/verify` | admin | `?grievance_id=` → `AuditVerification` | C |
| 53 | `GET /admin/ai/metrics` | admin | → `AIMetrics` | C |
| 54 | `POST /admin/ai/retrain` | admin | `{}` → `AIMetrics` | C |
| 55 | `GET /admin/demo/clock` · `POST /admin/demo/clock` | admin, DEMO_MODE | `{advance_hours}` → `DemoClock` | C |
| 56 | `POST /admin/demo/reset` | admin, DEMO_MODE | → `{ok: true}` | C |
| 57 | `GET /health` | public | → `{status, version, providers: {gemini, groq, db, embeddings}}` | all |

### Realtime
- **Purpose:** the frontend subscribes (Supabase Realtime, `postgres_changes` INSERT) to the `live_events` table. Row-level security limits each user to their audiences.
- **Events are signals only.** On an event, the frontend invalidates the relevant TanStack Query keys and refetches through the API. Never render realtime payloads directly.
- **Mock mode:** a 20-second polling fallback.

### Mock and hybrid modes (`apps/web/src/lib/api`)
- **`mock`:** every call resolves from `packages/contracts/mocks` with a 300–900 ms simulated latency.
- **`live`:** every call hits the API.
- **`hybrid` (default once B's API URL is live, from about H13):** call live; on network error, 404 or 501, fall back to the mock and log `console.info('[mock-fallback]', path)`. A small dev-only badge shows how many calls fell back.
