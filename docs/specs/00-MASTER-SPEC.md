# JanaVaani — Master Build Spec

> **Neural Storm (JNTUH) · Problem statement HI-02 · Multilingual Citizen Grievance Chatbot**
> Working name: **JanaVaani** ("voice of the people"). To rename, change `apps/web/src/app/brand.ts`, `README.md` and the FastAPI title.
>
> Every Claude Code session must read **this file first**, then its own part spec:
> - Laptop A → `docs/specs/01-SPEC-A-CITIZEN.md`
> - Laptop B → `docs/specs/02-SPEC-B-AI-ENGINE.md`
> - Laptop C → `docs/specs/03-SPEC-C-GOV-PORTALS.md`

---

## 0. Golden rules (apply to every laptop, every session)

1. **Stay in your folders.** Only edit files your laptop owns (section 5). Shared folders are additive-only after hour 0: you may add new files, never rewrite someone else's.
2. **The contract is law.** API shapes in section 8 and section 9 are frozen. Changes must be additive (new optional fields, new endpoints) and logged in `docs/contract-notes/<A|B|C>.md`.
3. **snake_case everywhere** in API payloads and TypeScript contract types. No camelCase mapping layers.
4. **Never block on another laptop, and never merge before H30.** Each laptop pushes only to its own branch until the integration merge (section 6). Frontends reach B's backend over HTTP, not through git: they point at B's deployed API and use `VITE_API_MODE=hybrid`, which falls back to the mock layer for any endpoint not built yet.
5. **Commit small, push often.** Commit after every completed task, push at least every 45 minutes. Conventional commits: `feat(citizen): …`, `fix(api): …`.
6. **Free only.** No paid APIs, no paid tiers, no credit card-gated services. No SMS, no WhatsApp Business, no paid maps.
7. **Every screen needs four states:** loading (skeleton), empty, error (with retry), success.
8. **No hardcoded UI strings.** Everything goes through i18next.
9. **Accessibility is not optional:** keyboard reachable, visible focus, labels, `prefers-reduced-motion` respected, 44px touch targets.
10. **AI is advisory; rules and humans decide** safety-critical outcomes (emergency, critical priority, low-confidence routing, disputed closures).
11. **Synthetic data only.** Never put real citizen data into free-tier AI APIs.
12. **End every phase** by updating `docs/progress/<A|B|C>.md` with: done, in progress, next, blockers, contract notes.

---

## 1. Product

**One-liner:** A voice-first, multilingual grievance platform where a citizen can speak a complaint in Telugu, Hindi, Urdu, English or code-mixed "Tenglish/Hinglish", and AI turns it into a structured, correctly routed, prioritized case. The case is tracked transparently until the citizen confirms it is actually fixed.

**Why it wins:**
- **Real-world fit:** built for Telangana and Hyderabad (GHMC-style wards and zones, Telugu and Urdu first).
- **More than a chatbot:** four connected portals plus an AI engine with its own trained model.
- **Trust layer:** AI verifies resolution photos, closures need citizen confirmation, and the audit trail is tamper-evident.

**The five surfaces:**

| Surface | Users | Purpose |
|---|---|---|
| Landing | Everyone | Immersive 3D story, live city stats, entry to all portals |
| Citizen Portal | Citizens, guests | Report (chat/voice/photo/QR), track, communicate, verify, appeal |
| AI Intelligence Engine | (backend) | Translate, classify, prioritize, detect duplicates, route, verify |
| Department Portal | Officers, supervisors | Inbox, case handling, AI briefs, replies, resolution proof, review queues |
| Government Admin Portal | Admins | KPIs, maps, department performance, alerts, audit, AI model monitoring |
| Public Transparency Portal | Everyone | Anonymized heatmap, resolution rates, trends |

---

## 2. Team and ownership

| Laptop | Branch | Owns | Core deliverable |
|---|---|---|---|
| **A** | `feat/citizen` | Hour-0 scaffold (on `main`), shared frontend foundation, landing, citizen portal | Everything a citizen sees |
| **B** | `feat/ai-engine` | `services/api`, `ml`, `data`, `supabase` | The AI engine, database, all API endpoints, trained model, seed data |
| **C** | `feat/gov-portals` | Officer, supervisor, admin and public portals | Everything a government user or the public sees |

**Integrator:** Laptop A's human merges PRs into `main` and resolves conflicts in shared files.

---

## 3. Timeline (48 hours)

Development is H0–H30. Fine-tuning, QA and presentation are H30–H48.

| Hours | Laptop A | Laptop B | Laptop C | Git |
|---|---|---|---|---|
| H0–H1.5 | **P0** scaffold on `main` | **P1** starts immediately | **P0** human setup (accounts, keys) + Claude reads specs | A pushes scaffold to `main`, tags `v0-scaffold`; C branches from it |
| H1.5–H7 | **P1** landing, citizen shell, login, settings | **P1** (to H6) API foundation, DB, AI gateway, dataset generation, deploy | **P1** gov shell, gov components, officer inbox | Own branches only. B posts its API URL in team chat by H6 |
| H7–H13 | **P2** report assistant (text, photo, location, submit) | **P2** (H6–H12) ML model + core pipeline + chat/grievance endpoints | **P2** officer case detail, supervisor queues | No merges |
| H13–H19 | **P3** switch to hybrid mode on B's URL, voice mode, low-literacy mode | **P3** (H12–H18) tracking, notifications, search, officer core | **P3** switch to hybrid mode on B's URL, admin command center, maps, analytics | No merges |
| H19–H25 | **P4** tracking, verification, appeals, notifications | **P4** (H18–H24) officer AI, verification, escalation, admin analytics | **P4** alerts, insights, audit, AI model page, demo controls, exports | No merges |
| H25–H30 | **P5** QR, nearby, guide, PWA, accessibility, i18n | **P5** (H24–H30) insights, metrics/retrain, public, guide, assets, hardening | **P5** public portal, realtime, gov i18n | **Integration merge at H30:** B → A → C into `main`, integrated deploy |
| H30–H36 | **P6** integration QA, tests, performance | **P6** evaluation hardening, prompt tuning, fallback tests | **P6** integration QA, tests, performance | Own branches again (each merged `main` in once) |
| H36–H42 | **P7** wow polish + stretch | **P7** demo data story, model notebook, docs | **P7** wow polish + stretch | **Final merge at H42:** B → A → C |
| H42–H46 | **P8** final deploy, freeze | **P8** final deploy, warm-up, demo keys | **P8** final QA, demo rehearsal | Code freeze at H44 (small fixes straight to `main`) |
| H46–H48 | Buffer, video, slides, submission | | | |

**Claude Pro usage limits:** each phase is sized for roughly one usage window. If you hit the limit mid-phase, wait for the reset, start a fresh session, and paste the **Resume prompt** from your prompts file. It continues from `docs/progress/<X>.md`.

---

## 4. Tech stack (locked at H0)

Use the latest stable versions at H0 unless noted.

### Frontend (`apps/web`)
- **Core:** React 19, Vite, TypeScript (strict)
- **Styling:** Tailwind CSS v4 (CSS-first `@theme` tokens, `@tailwindcss/vite`), shadcn/ui (Radix primitives), lucide-react icons
- **Motion and 3D:** `motion` (import from `motion/react`), `three`, `@react-three/fiber`, `@react-three/drei`, `lenis`
- **Routing and data:** `react-router` v7 (library mode), `@tanstack/react-query` v5, `zustand`
- **i18n:** `i18next`, `react-i18next`
- **Maps:** `leaflet`, `react-leaflet` (React 19 compatible), `leaflet.heat`, `leaflet.markercluster`, `@turf/turf` (only the functions needed)
- **Charts and tables:** `recharts`, `@tanstack/react-table`
- **Utilities:** `cmdk` (command palette), `sonner` (toasts), `idb-keyval` (offline drafts and outbox), `browser-image-compression`, `html-to-image` + `jspdf` (+ `jspdf-autotable`), `qrcode`, `date-fns`
- **Excel export:** SheetJS, installed per SheetJS docs from `cdn.sheetjs.com`, not the stale npm package
- **Backend services:** `@supabase/supabase-js` (auth and realtime only)
- **PWA:** `vite-plugin-pwa`
- **Testing:** Playwright (Chromium + `msedge` channel + mobile emulation), ESLint, Prettier

**All frontend dependencies are installed in P0** so later `package.json` edits are rare.

### Backend (`services/api`)
- **Core:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, `httpx`, `orjson`
- **Database:** `psycopg` v3 (async, pool), `pgvector` (Python adapter)
- **AI providers:** `google-genai` (Gemini SDK), `groq`
- **ML:** `sentence-transformers` (CPU torch), `scikit-learn`, `numpy`, `pandas`, `joblib`
- **Images and geo:** `shapely`, `scipy` (Voronoi wards), `Pillow`, `imagehash`, `exifread`
- **Platform:** `supabase` (storage + auth admin), `slowapi`, `apscheduler`, `PyJWT[crypto]`, `diskcache`, `python-multipart`
- **Testing:** `pytest`, `pytest-asyncio`

### Platform (all free tiers)

| Need | Service |
|---|---|
| Database, auth, storage, realtime | **Supabase** free project (Postgres + PostGIS + pgvector) |
| Frontend hosting | **Vercel** Hobby |
| Backend hosting | **Hugging Face Spaces** (Docker, free CPU) |
| LLMs | **Gemini API** free tier (Flash, Flash-Lite), **Groq** free tier |
| Speech | Browser Web Speech API + Groq Whisper fallback |
| Basemaps | CARTO basemaps (OpenStreetMap data) with attribution |
| Geocoding | Nominatim (server-side, cached, max 1 request/second, custom User-Agent) |

**Supabase gotcha:** the direct database connection is IPv6. From Hugging Face Spaces, use the **Session pooler** connection string (IPv4, port 5432) as `DATABASE_URL`.

### Gemini vs Groq rule of thumb
- **Gemini:** anything the citizen reads in an Indian language, and anything with an image.
- **Groq:** internal or English text, or anything that must be instant.
- Every AI task has a primary and a fallback provider (spec B, section 5).

### Environment variables

`apps/web/.env.example`:
```
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_API_MODE=mock            # mock | hybrid | live
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=       # anon / publishable key
VITE_DEMO_MODE=true           # shows demo login buttons and demo controls
```

`services/api/.env.example`:
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # service_role / secret key — backend only, never in frontend
DATABASE_URL=                 # Session pooler URI
GEMINI_API_KEY=
GEMINI_MODEL_MAIN=gemini-flash-latest        # confirm current free Flash model in AI Studio
GEMINI_MODEL_LITE=gemini-flash-lite-latest   # confirm in AI Studio
GEMINI_TTS_MODEL=                            # optional; leave empty if no free TTS model
GROQ_API_KEY=
GROQ_MODEL_MAIN=llama-3.3-70b-versatile      # confirm in Groq console; gpt-oss-120b also fine
GROQ_MODEL_SMALL=llama-3.1-8b-instant
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
GROQ_VISION_MODEL=                           # optional
EMBEDDING_MODEL=intfloat/multilingual-e5-small
ALLOWED_ORIGINS=http://localhost:5173,https://<vercel-app>.vercel.app
DEMO_MODE=true
AI_CACHE_DIR=.ai_cache
FORCE_FAIL_GEMINI=false       # test fallbacks
FORCE_FAIL_GROQ=false
```

**API keys:** each developer uses their own Gemini and Groq keys during development. Keep one fresh key pair, unused until H42, for the deployed demo.

---

## 5. Repository layout and ownership

```
janavaani/
├─ CLAUDE.md                         (A, P0) short pointer to these specs + golden rules
├─ README.md                         (A; others append their own section)
├─ docs/
│  ├─ specs/                         (frozen; humans only)
│  ├─ prompts/                       (frozen; humans only)
│  ├─ progress/A.md B.md C.md        (each laptop its own file)
│  └─ contract-notes/A.md B.md C.md  (each laptop its own file)
├─ packages/contracts/               (A in P0; frozen until the H30 integration merge, see section 6)
│  ├─ src/types.ts                   section 8 verbatim
│  ├─ src/endpoints.md               section 9 table
│  └─ mocks/                         deterministic mock data + mock handlers
├─ apps/web/                         React app
│  ├─ src/app/                       (A) router, providers, shells, brand.ts — frozen after P0
│  ├─ src/design/                    (A) tokens, ui/ (shadcn), shared components, motion presets, 3D primitives
│  ├─ src/lib/                       (A) api client, mock layer, auth, supabase, i18n, live events, hooks
│  ├─ src/i18n/locales/{en,te,hi,ur}/common.json, landing.json, citizen.json  (A)
│  ├─ src/i18n/locales/{en,te,hi,ur}/gov.json                                 (C)
│  ├─ src/portals/landing/           (A)
│  ├─ src/portals/citizen/           (A)
│  ├─ src/portals/officer/           (C)
│  ├─ src/portals/admin/             (C)
│  ├─ src/portals/public/            (C)
│  └─ src/portals/gov-shared/        (C) gov-only components, api additions, mock additions
├─ e2e/citizen/                      (A) Playwright
├─ e2e/gov/                          (C) Playwright
├─ services/api/                     (B) FastAPI
├─ ml/                               (B) training, evaluation, seeding scripts, notebook
├─ data/                             (B) geo, departments, keywords, knowledge, seed, eval
└─ supabase/migrations/              (B)
```

**Central router rule:** `apps/web/src/app/routes.tsx` (written in P0) lazy-imports `portals/<name>/routes.tsx` for every portal. A and C only edit their own `routes.tsx` files.

---

## 6. Git workflow

**Setup (H0, human A):**
1. Create GitHub repo `janavaani`.
2. Add the other two GitHub accounts as collaborators.
3. Commit `docs/specs/*` and `docs/prompts/*` to `main`.

**Branch creation:**
- **B** branches `feat/ai-engine` from `main` right after the docs commit.
- **A** runs P0 directly on `main`, pushes, tags `v0-scaffold`, then branches `feat/citizen`.
- **C** pulls `main` after `v0-scaffold` and branches `feat/gov-portals`.

**Isolated development (H0–H30): no merges at all.**
- Each laptop commits and pushes **only to its own branch**. Nobody merges `main` or another branch into theirs, and nobody opens a PR before H30.
- **How the frontends get the backend without merging:** B deploys straight from `feat/ai-engine` to the Hugging Face Space after every phase. A and C set `VITE_API_BASE_URL` to that URL and `VITE_API_MODE=hybrid`, which calls the live API and falls back to mocks for anything not built yet. B's human posts the URL, and the list of live endpoints after each phase, in the team chat.
- **Reading another branch without merging** (read-only, safe): `git fetch origin`, then `git show origin/feat/ai-engine:docs/progress/B.md` (or `docs/contract-notes/B.md`). Never `git merge` or `git pull` another laptop's branch before H30.
- **Shared frontend code is frozen after P0.** C builds against the `v0-scaffold` version of `src/app`, `src/lib`, `src/design` and `packages/contracts` until H30. A may fix bugs and add new exports there, but must never rename or remove an export, prop, route or type that existed at `v0-scaffold`.
- **Contract additions during isolation:** if B adds optional fields, A and C put any extra TypeScript types in their own portal folders (e.g. `portals/citizen/types-ext.ts`, `portals/gov-shared/types-ext.ts`), not in `packages/contracts`, so nothing can conflict. They move into `packages/contracts` at the integration merge.

**Integration merge (H30): the only point where the three branches meet.**
1. Each laptop runs build, lint and tests on its own branch and pushes.
2. Each opens a PR into `main`. The integrator merges in this order: **B, then A, then C**. B touches no frontend files, so it merges cleanly; A's shared code goes in before C's portals.
3. All three humans join a call to fix conflicts and breakages together. Then build, lint, run Playwright, and deploy the frontend to Vercel with `VITE_API_MODE=live`. B redeploys the Space from `main`.
4. Each laptop runs `git merge origin/main` into its own branch once, then continues working there.

**Final merge (H42):** B, then A, then C into `main` again, carrying the H30–H42 fixes and polish. Deploy.

**Freeze at H44:** after this, only small bug fixes, committed directly to `main` by the integrator.

**Conflict rules:**
- `package-lock.json`: take `main`'s version, run `npm install`, commit.
- Shared files in `src/app`, `src/lib`, `src/design`: A's version wins; C re-applies any needed change in its own folder.
- i18n JSON: namespaces are split by owner, so conflicts should not happen.
- `packages/contracts`: additive only. Keep both sides' additions.

---

## 7. Domain model

### Languages
- **Deep (demo quality, full UI translation, voice tested):** `en`, `te`, `hi`, `ur` (Urdu uses right-to-left layout).
- **Supported (AI understands and replies; UI falls back to English):** `ta`, `kn`, `ml`, `mr`, `bn`, `gu`.
- **Speech codes:** `en-IN`, `te-IN`, `hi-IN`, `ur-IN`, `ta-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `bn-IN`, `gu-IN`.

### Departments (illustrative; real deployment must follow official jurisdiction mapping)

| id | Name | Illustrative agency | Example sub-departments |
|---|---|---|---|
| `roads` | Roads & Municipal Engineering | GHMC Engineering | potholes, road damage, footpaths |
| `sanitation` | Sanitation & Solid Waste | GHMC SWM | garbage, bins, sweeping, dead animals |
| `water` | Water Supply | HMWSSB | no supply, leakage, contamination, low pressure |
| `streetlights` | Streetlights | GHMC Electrical | not working, damaged pole, daytime burning |
| `power` | Power Distribution | TGSPDCL | outage, voltage, transformer, sparking lines |
| `drainage` | Sewerage & Drainage | HMWSSB / GHMC SWD | overflow, blocked drain, open manhole |
| `traffic` | Traffic & Road Safety | Traffic Police | signal failure, dangerous junction, signage |
| `health` | Public Health | GHMC Health / Entomology | mosquitoes, hospital conditions, food safety |
| `education` | Government Schools | School Education Dept | building, toilets, drinking water |
| `town_planning` | Town Planning | GHMC Town Planning | encroachment, illegal construction |
| `other` | Other / Unclassified | — | always goes to human review |

Each department in `data/departments.json` has names in en/te/hi/ur, a lucide icon, a color, sub-departments and **required fields** (spec B, section 3).

### Wards and zones
- **30 demo wards** across 6 zones, built as Voronoi polygons from locality centroids (spec B).
- They must be labeled **"Approximate demo boundaries"** in the UI.
- **Zones:** Serilingampally, Kukatpally, Khairatabad, Secunderabad, Charminar, LB Nagar.

### Roles
`citizen`, `guest` (Supabase anonymous sign-in), `officer`, `supervisor`, `admin`.

### Status lifecycle

```
registered ─▶ needs_review (low-confidence routing) ─▶ assigned
registered ─▶ assigned ─▶ in_progress ─▶ resolved_pending_verification ─▶ closed (citizen_verified | auto_closed_unverified)
resolved_pending_verification ─▶ reopened ─▶ in_progress …
any open ─▶ merged (into an incident)   any ─▶ rejected (spam / out of scope)
```

**Citizen-facing timeline steps:**
1. Registered
2. Classified
3. Assigned
4. In progress
5. Resolution submitted
6. Citizen verification
7. Closed

### Priority

| Level | Score | SLA hours | Color token |
|---|---|---|---|
| critical | ≥ 80 | 24 (confirmed emergency: 4) | `--prio-critical` |
| high | 60–79 | 48 | `--prio-high` |
| medium | 35–59 | 96 | `--prio-medium` |
| low | < 35 | 168 | `--prio-low` |

**Score (0–100), shown to users as an explainable list of factors:**
- **LLM urgency base:** critical 70, high 50, medium 30, low 15
- **Hazards:** +10 each, maximum +20
- **Emergency keyword rule hit:** floor of 80
- **Distress:** +0 to +10
- **Vulnerable groups present:** +8
- **Community reports:** `min(15, round(5 × log2(1 + supporters)))`
- **(Stretch) within 200 m of a school or hospital:** +8

Safety rules can raise the score but nothing can lower it below a rule floor. **Critical requires human confirmation.**

### Escalation
- **Level 0:** assigned officer.
- **Level 1:** SLA breached → supervisor.
- **Level 2:** breach plus 50% of the SLA → admin.
- **Critical cases:** 2 hours overdue goes straight to Level 2 with an alert.

---

## 8. Shared contract (copy verbatim to `packages/contracts/src/types.ts`)

B mirrors these types exactly as Pydantic models in `services/api/app/schemas.py`.

```ts
// ===== Primitives =====
export type Lang = 'en' | 'te' | 'hi' | 'ur' | 'ta' | 'kn' | 'ml' | 'mr' | 'bn' | 'gu' | 'other';
export type DeepLang = 'en' | 'te' | 'hi' | 'ur';
export type Role = 'citizen' | 'guest' | 'officer' | 'supervisor' | 'admin';
export type DepartmentId =
  | 'roads' | 'sanitation' | 'water' | 'streetlights' | 'power' | 'drainage'
  | 'traffic' | 'health' | 'education' | 'town_planning' | 'other';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Status =
  | 'registered' | 'needs_review' | 'assigned' | 'in_progress'
  | 'resolved_pending_verification' | 'closed' | 'reopened' | 'rejected' | 'merged';
export type ClosureType = 'citizen_verified' | 'auto_closed_unverified' | 'rejected' | null;
export type LocationSource = 'gps' | 'pin' | 'text' | 'qr';
export type Hazard =
  | 'live_wire' | 'fire' | 'gas_leak' | 'collapse_risk' | 'flooding' | 'open_manhole'
  | 'contaminated_water' | 'sewage_overflow' | 'traffic_danger' | 'disease_risk'
  | 'near_school' | 'near_hospital';
export type Vulnerable = 'children' | 'elderly' | 'disabled' | 'pregnant';
export type Sentiment = 'calm' | 'concerned' | 'frustrated' | 'angry' | 'distressed';
export type ISODate = string; // UTC ISO-8601

export interface Localized { original: string; en: string; lang: Lang }
export interface GeoPoint { lat: number; lng: number }
export interface Location extends GeoPoint {
  address?: string; landmark?: string; ward_id?: string; ward_name?: string; zone?: string;
  source: LocationSource; accuracy_m?: number;
}
export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
export interface ApiError { error: { code: string; message: string; details?: unknown } }

// ===== Reference data =====
export interface RequiredField { key: string; label_en: string; question: Record<DeepLang, string> }
export interface Department {
  id: DepartmentId; name: Record<DeepLang, string>; agency_en: string;
  icon: string; color: string; sub_departments: string[]; required_fields: RequiredField[];
}
export interface Ward { id: string; name: string; zone: string; centroid: GeoPoint }
export interface EmergencyContact { number: string; label_en: string; label: Record<DeepLang, string> }
export interface Officer {
  id: string; name: string; designation: string; department_id: DepartmentId;
  ward_ids: string[]; office_name: string; office_phone?: string;
  open_cases?: number; overdue_cases?: number;
}
export interface Asset {
  id: string; type: 'streetlight' | 'drain' | 'water_pipe' | 'bin' | 'road_segment' | 'signal';
  label_en: string; ward_id: string; location: GeoPoint;
  open_grievance_ids: string[];
  history: { grievance_id: string; category: DepartmentId; created_at: ISODate; closed_at?: ISODate }[];
}

// ===== Grievance =====
export interface Media {
  id: string; url: string; kind: 'image';
  uploaded_by: 'citizen' | 'officer';
  purpose: 'evidence' | 'resolution_proof' | 'verification';
  quality?: { ok: boolean; issue?: 'blurry' | 'dark' | 'too_small' | 'none' };
  ai?: { category?: DepartmentId; severity?: Priority; description_en?: string; matches_text?: boolean };
  geo?: GeoPoint; created_at: ISODate;
}
export interface PriorityFactor { key: string; label_en: string; points: number }
export interface RoutingVote {
  source: 'classifier' | 'gemini' | 'groq' | 'rule' | 'human';
  department: DepartmentId; confidence?: number;
}
export interface Routing {
  department: DepartmentId; sub_department?: string; secondary_departments: DepartmentId[];
  confidence: number; votes: RoutingVote[]; explanation_en: string;
  needs_review: boolean; method: 'auto' | 'auto_flagged' | 'human';
}
export interface SLA {
  hours: number; due_at: ISODate; breached: boolean; remaining_minutes: number;
  eta_at?: ISODate; delay_risk: 'low' | 'medium' | 'high'; delay_reason?: Localized;
}
export type TimelineEventType =
  | 'registered' | 'classified' | 'routing_review' | 'assigned' | 'reassigned' | 'status_changed'
  | 'note' | 'message' | 'evidence_added' | 'priority_changed' | 'escalated'
  | 'emergency_flagged' | 'emergency_confirmed' | 'resolution_submitted' | 'ai_verification'
  | 'citizen_verified' | 'citizen_rejected' | 'reopened' | 'appeal_filed' | 'appeal_decided'
  | 'merged' | 'support_added' | 'closed';
export interface TimelineEvent {
  id: string; grievance_id: string; type: TimelineEventType;
  actor_role: Role | 'system' | 'ai'; actor_name?: string;
  message_en: string; message?: Localized; internal: boolean; // internal = officer-only (notes)
  payload?: Record<string, unknown>; created_at: ISODate;
  hash: string; prev_hash: string | null;
}
export interface Appeal {
  id: string; grievance_id: string; reason: Localized;
  status: 'filed' | 'under_review' | 'upheld' | 'dismissed';
  decision_note?: Localized; created_at: ISODate; decided_at?: ISODate;
}
export interface AIVerification {
  verdict: 'verified' | 'suspicious' | 'unclear'; confidence: number; reasons_en: string[];
  checks: { same_location: boolean | null; issue_resolved_visible: boolean | null; duplicate_photo: boolean; distance_m: number | null };
  created_at: ISODate;
}
export interface Grievance {
  id: string;                       // e.g. GRV-2026-000123
  title: Localized; summary_en: string; description: Localized; formal_text: Localized;
  language: Lang; script: 'native' | 'latin' | 'mixed'; is_code_mixed: boolean;
  category: DepartmentId; routing: Routing;
  status: Status; closure_type: ClosureType;
  priority: Priority; priority_score: number; priority_factors: PriorityFactor[];
  is_emergency: boolean; emergency_confirmed: boolean | null;
  hazards: Hazard[]; vulnerable: Vulnerable[]; sentiment: Sentiment; distress_score: number;
  location: Location; asset_id?: string; media: Media[];
  assigned_officer?: Officer; escalation_level: 0 | 1 | 2 | 3; sla: SLA;
  incident_id?: string; support_count: number; related_ids: string[];
  is_anonymous: boolean; is_private: boolean; citizen_display_name?: string;
  rating?: number; feedback_comment?: string; reopen_count: number;
  appeal?: Appeal; ai_verification?: AIVerification;
  created_at: ISODate; updated_at: ISODate; resolved_at?: ISODate; closed_at?: ISODate;
}
export interface Message {
  id: string; grievance_id?: string; session_id?: string;
  sender: 'citizen' | 'bot' | 'officer' | 'system'; sender_name?: string;
  text: Localized; created_at: ISODate;
}
export interface GrievanceDetail extends Grievance { timeline: TimelineEvent[]; messages: Message[] }
export interface Incident {
  id: string; title_en: string; category: DepartmentId; ward_id: string; centroid: GeoPoint;
  grievance_ids: string[]; support_count: number; languages: Lang[]; status: Status; created_at: ISODate;
}

// ===== Chat intake =====
export interface GrievanceDraft {
  draft_id: string; title: Localized; formal_text: Localized; summary_en: string;
  cleaned_original: string; category: DepartmentId; sub_department?: string;
  urgency: Priority; hazards: Hazard[]; location?: Location; media_ids: string[];
  fields: Record<string, string>; missing_fields: string[];
  routing_preview?: Routing & { officer_name?: string; office_name?: string };
  priority_preview?: { score: number; level: Priority; factors: PriorityFactor[]; sla_hours: number };
}
export interface DuplicateMatch {
  grievance_id?: string; incident_id?: string; title: Localized; similarity: number;
  distance_m: number; support_count: number; status: Status; created_at: ISODate; language: Lang;
}
export interface EmergencyInfo { matched_terms: string[]; contacts: EmergencyContact[]; message: Localized }
export interface ChatTurnRequest {
  session_id?: string; text?: string; input_mode: 'text' | 'voice';
  lang_hint?: Lang; ui_lang: DeepLang; media_ids?: string[]; location?: Location; asset_id?: string;
  action?: 'confirm' | 'edit' | 'cancel' | 'split_confirm' | 'support_existing' | 'file_new_anyway' | 'continue_after_emergency';
  action_payload?: Record<string, unknown>;
  submit_options?: { is_anonymous?: boolean; is_private?: boolean };
}
export interface ChatTurnResponse {
  session_id: string;
  intent: 'new_complaint' | 'track_status' | 'ask_info' | 'smalltalk' | 'emergency';
  stage: 'collecting' | 'confirming' | 'duplicate_check' | 'submitted' | 'emergency' | 'answered';
  detected_language: Lang; is_code_mixed: boolean;
  reply: Localized; quick_replies: { label: string; value: string }[];
  missing_fields: string[];
  draft?: GrievanceDraft; drafts?: GrievanceDraft[];          // drafts[] when multiple issues
  duplicates?: DuplicateMatch[]; emergency?: EmergencyInfo;
  submitted?: { grievance_id: string; guest_pin?: string }[];
  tracked?: Grievance[];
}

// ===== Notifications & live events =====
export interface Notification {
  id: string; grievance_id?: string;
  type: 'status' | 'message' | 'escalation' | 'community_update' | 'verification_request' | 'alert';
  title: Localized; body: Localized; read: boolean; created_at: ISODate;
}
export interface LiveEvent {
  id: string; audience: string;   // 'user:<uuid>' | 'dept:<id>' | 'role:admin' | 'public'
  kind: 'grievance_created' | 'grievance_updated' | 'notification' | 'alert';
  grievance_id?: string; created_at: ISODate;
}

// ===== Officer =====
export interface OfficerBrief {
  situation: string; evidence: string[]; risks: string[];
  suggested_next_steps: string[]; missing_info: string[];
  similar_resolved: { grievance_id: string; title_en: string; resolution_note: string }[];
  generated_by: 'groq' | 'gemini' | 'fallback'; created_at: ISODate;
}
export type ReplyIntent = 'acknowledge' | 'request_info' | 'schedule_visit' | 'work_started' | 'resolved' | 'delay_update' | 'transfer';
export interface DraftReply { intent: ReplyIntent; draft_en: string; draft_citizen: Localized }

// ===== Admin & analytics =====
export interface KPIs {
  total: number; open: number; resolved: number; overdue: number; critical_open: number;
  avg_resolution_hours: number; avg_first_response_hours: number; sla_compliance_pct: number;
  satisfaction_avg: number; reopened_pct: number; needs_review: number;
  deltas: Partial<Record<'total' | 'open' | 'resolved' | 'overdue' | 'sla_compliance_pct' | 'avg_resolution_hours', number>>;
}
export interface DepartmentPerformance {
  department_id: DepartmentId; total: number; open: number; resolved: number; overdue: number;
  avg_resolution_hours: number; sla_compliance_pct: number; satisfaction_avg: number;
  reopen_rate: number; score: number; rank: number;
}
export interface OfficerWorkload { officer: Officer; open: number; critical: number; overdue: number; resolved_7d: number }
export interface TrendPoint { date: string; created: number; resolved: number; by_category?: Partial<Record<DepartmentId, number>> }
export interface BreakdownRow { key: string; label: string; total: number; open: number; overdue: number; avg_resolution_hours: number }
export interface Alert {
  id: string; kind: 'spike' | 'overdue_critical' | 'repeated_reopen' | 'suspicious_closure' | 'routing_review_backlog' | 'emergency_unconfirmed';
  severity: 'info' | 'warning' | 'critical'; title_en: string; detail_en: string;
  ward_id?: string; category?: DepartmentId; grievance_ids: string[]; languages?: Lang[]; created_at: ISODate;
}
export interface MapPoint {
  id?: string;   // omitted on public endpoints
  lat: number; lng: number; category: DepartmentId; priority: Priority; status: Status; incident_id?: string;
}
export interface AIMetrics {
  model_version: string; trained_at: ISODate; embedding_model: string; n_train: number; n_test: number;
  accuracy: number; macro_f1: number;
  per_language: Partial<Record<Lang | 'code_mixed', { accuracy: number; n: number }>>;
  human_test?: { accuracy: number; n: number; per_language: Partial<Record<Lang | 'code_mixed', { accuracy: number; n: number }>> };
  confusion: { labels: DepartmentId[]; matrix: number[][] };
  live: { auto_routed_pct: number; needs_review_pct: number; agreement_rate: number; avg_pipeline_ms: number; fallback_rate: number; calls_24h: number };
  history: { model_version: string; accuracy: number; macro_f1: number; trained_at: ISODate; corrections_used: number }[];
}
export interface AuditVerification { grievance_id?: string; events_checked: number; valid: boolean; first_broken_event_id?: string }
export interface InsightSummary { bullets_en: string[]; generated_by: 'groq' | 'gemini' | 'template'; numbers_verified: boolean; created_at: ISODate }
export interface PublicStats {
  total: number; resolved: number; resolution_rate_pct: number; avg_resolution_hours: number;
  by_department: { department_id: DepartmentId; total: number; resolved_pct: number; avg_resolution_hours: number }[];
  by_zone: { zone: string; total: number; resolved_pct: number }[];
  trend: TrendPoint[]; recent_resolved: { title_en: string; category: DepartmentId; zone: string; before_url?: string; after_url?: string; resolved_at: ISODate }[];
}
export interface DemoClock { now: ISODate; offset_minutes: number }
```

---

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

---

## 10. AI engine summary (details in spec B)

**Per complaint:**
1. Safety and cleanup (deterministic): mask personal data, scan for emergency keywords, check spam.
2. Conversational intake (Gemini): fill the department's required fields one question at a time.
3. Core analysis: one Gemini JSON call.
4. In parallel: own classifier, Groq second opinion, geo ward lookup.
5. Routing vote.
6. Duplicate check (pgvector + PostGIS + time window).
7. Explainable priority score.
8. SLA and ETA, least-loaded officer assignment, hash-chained audit, live event, reply in the citizen's language.

**Target:** under 5 seconds from confirm to ticket ID. Everything degrades gracefully when an AI provider fails.

**Models we own:**
- Department classifier: multilingual embeddings + calibrated logistic regression, trained in seconds on CPU.
- Statistical spike detector.
- Historical ETA averages.
- A "retrain from human corrections" loop.

---

## 11. Design system

### Direction: "Civic Futurism"
Calm authority with a living pulse. Dark "Ink" for the immersive landing and the government command center; warm "Paper" (light) for the citizen app, because readability for elderly and low-literacy users comes first. Both themes are toggleable everywhere and share tokens.

**Signature moments:**
1. **City Pulse hero:** a 3D point-cloud of Hyderabad where complaints glow by category, rings pulse where new reports arrive, and green flashes where issues are resolved.
2. **Voice Orb:** an audio-reactive orb while the citizen speaks.
3. **Before/after reveal** of a resolved issue.
4. **Animated tamper-evident audit chain.**

### Tokens (`src/design/tokens.css`, Tailwind v4 `@theme`)

```
Ink (dark):   --bg #070A12  --surface #0D1220  --surface-2 #131A2C  --border rgba(148,163,184,.14)
              --text #EAF0FA  --text-muted #8C97AD
              --primary #FF7A1A (saffron flame)  --primary-fg #1A0B00
              --accent #22D3C5 (teal signal)    --ai #7C83FF (AI indigo — used ONLY for AI-generated content)
              --success #2BD67B  --warning #FFC23D  --danger #FF4D5E
Paper (light):--bg #F7F5F0  --surface #FFFFFF  --surface-2 #F0EDE6  --border #E3DED3
              --text #12141A  --text-muted #5B6272
              --primary #E8620C  --accent #0E9F94  --ai #4F56E8  (status colors darkened to pass AA)
Priority:     --prio-critical #FF4D5E  --prio-high #FF8A3D  --prio-medium #FFC23D  --prio-low #2BD67B
High contrast:#000/#FFF, focus #FFD400, no transparency, borders 2px
Radius:       sm 8, md 12, lg 18, xl 28, pill 999
Shadows/glow: glow-primary 0 0 40px -8px var(--primary); glass: surface @ 72% + backdrop-blur(16px) + 1px border
```

**Theme attributes:**
- `data-theme="ink|paper"` on `<html>`.
- `data-contrast="high"`, `data-font="large"` (root font size 20px instead of 16px), `data-motion="reduced"`.
- `dir="rtl"` for Urdu.

**Department colors** (charts and badges):
| roads | sanitation | water | streetlights | power | drainage | traffic | health | education | town_planning | other |
|---|---|---|---|---|---|---|---|---|---|---|
| #FF8A3D | #A3E635 | #38BDF8 | #FACC15 | #F472B6 | #2DD4BF | #FB7185 | #C084FC | #60A5FA | #F59E0B | #94A3B8 |

### Typography (self-host via Fontsource where available, else Google Fonts with `display=swap`)
- **Display:** **Anek Latin** (variable width; wide for heroes). Matching **Anek Telugu** and **Anek Devanagari** give one multi-script voice.
- **Body:** **Noto Sans**, **Noto Sans Telugu**, **Noto Sans Devanagari**. Urdu body: **Noto Naskh Arabic**; Urdu display: **Noto Nastaliq Urdu**.
- **Mono and numbers:** **JetBrains Mono**, with `tabular-nums` for IDs, KPIs and countdowns.
- **Font stacks** switch automatically by `lang` attribute.
- **Line height:** 1.6 for Indic scripts, 1.8 for Nastaliq.

### Motion
- **Durations:** 150 / 250 / 400 / 700 ms.
- **Easing:** `[0.16, 1, 0.3, 1]` (expo-out); springs for drag and press (`stiffness 400, damping 30`).
- **Page transitions:** opacity 0→1, y 12→0, blur 4→0 px, 350 ms, with `AnimatePresence` per route.
- **Lists:** stagger 40 ms, maximum 12 items animated.
- **Scroll reveals:** play once, with Lenis smooth scroll on the landing only.
- **Number count-ups:** 900 ms.
- **Only animate** transform, opacity and filter.
- **Reduced motion** (OS setting or in-app toggle): no parallax, no 3D auto-rotation, crossfades only.

### 3D rules
- `three` is lazy-loaded only on routes that use it.
- Device pixel ratio capped at 1.5; ≤ 8k points on desktop and ≤ 2k on mobile.
- Pause rendering when off-screen (`frameloop="demand"` or an IntersectionObserver).
- Static gradient fallback when WebGL is unavailable or motion is reduced.

### Shared components (A builds in P0, in `src/design/components`)
- **Status and labels:** `PriorityChip`, `StatusChip`, `DepartmentBadge`, `LangBadge`, `AIBadge` ("AI-suggested · human-approved" transparency marker)
- **Data display:** `KPIStat` (count-up), `Timeline` (basic), `SLACountdown` (basic), `BeforeAfterSlider` (basic)
- **States:** `EmptyState`, `ErrorState`, `Skeletons`, `LiveIndicator`
- **Maps:** `MapView` (Leaflet base, theme-aware CARTO tiles, attribution)
- **Controls:** `ListenButton` (TTS hook), `LanguageSwitcher`, `ThemeToggle`, `PageTransition`

Owners may wrap these in their own folders. **Only A edits the originals.**

### Accessibility and responsiveness
- **Contrast:** WCAG AA in both themes.
- **Focus:** visible ring (2px `--accent`, 2px offset).
- **Live regions:** `aria-live="polite"` for chat and status changes.
- **Images:** the AI image description is used as alt text.
- **Breakpoints:** 360 / 390 / 768 / 1024 / 1280 / 1536, mobile-first.
- **Citizen app:** bottom navigation on mobile, side rail on desktop.
- **Gov portals:** collapsible sidebar; tables become cards under 768px.
- **Performance budgets:** citizen routes ≤ 250 KB gzipped JS excluding lazy chunks; LCP < 2.5 s on throttled 4G.

---

## 12. Feature matrix (core)

Feature numbers come from the team's master list. 1–18 are the language features; 19+ are from the extended list.

| Group | Feature IDs | UI owner | Backend/AI |
|---|---|---|---|
| Language & conversation | 1–9, 12–18 (11 merged into 21) | A (chat, voice, history, search); C (133 translation view) | B |
| Registration | 19–26, 30–37, 227, 250, 251 | A | B |
| Routing | 38–49, 51, 53 | A (routing preview); C (review queue, reassign, explanation) | B |
| Priority & emergency | 56–63, 66–70, 103, 254 | A (emergency screen, factor view); C (confirm, alerts) | B |
| Tracking | 71–75, 79, 81–88, 263 | A | B |
| Duplicates & community | 89–91, 93–99, 101, 105, 106, 255 | A (suggest/support); C (incidents, clusters) | B |
| Feedback & escalation | 107–117, 121, 123, 124, 242, 253, 258 | A (citizen actions); C (reviews, audit) | B |
| Officer portal | 125–137, 140–143, 257, 259, 275 | C | B |
| Admin portal | 144–152, 154, 155, 157, 158, 161, 162, 164–167, 170–172, 174, 182, 183, 185, 192, 194, 265 | C | B |
| Public & trust | 175, 232, 236, 238, 240, 245, 247, 249, 262, 264 | A (175, 232, 236, 247, 249, 264); C (240, 262) | B |
| AI evaluation & learning | 52, 200, 201 | C | B |
| Accessibility | 202–207, 209, 210, 212, 213, 215, 216 | A (citizen); C (gov basics) | — |

### Stretch (only after core is done, in priority order)

| # | Feature | Owners |
|---|---|---|
| S1 | Disaster Surge Mode (260): auto-detected incident workspace | B + C |
| S2 | Root-cause graph (261): link complaints to one failure | B + C |
| S3 | Near school/hospital criticality via OpenStreetMap Overpass (65) | B |
| S4 | Image-similarity duplicates (92) | B |
| S5 | Text extraction from photographed documents via Gemini vision (29) | B + A |
| S6 | AI monthly department report (159, 196) | B + C |
| S7 | Seasonal forecasting / predictive maintenance (178, 186, 256) | B + C |
| S8 | Asset digital-twin history page + printable QR sheet (168, 169, 252) | C |
| S9 | Field visit scheduling, subtasks (138, 139); SLA policy editor (271); area civic scores (180) | C + B |
| S10 | Telegram bot (220), email notifications on a free tier (77), voice navigation (208) | B / A |

### Cut (do not build)
- **Costs money:** SMS, WhatsApp, IVR, missed-call callback, SMS OTP, native mobile apps.
- **Needs real government systems:** GIS/government integrations, SSO, kiosks, CSC, multi-tenancy, contractors, inventory, costs, workflow designer, backup/DR, malware scanning, session management, retention tooling.
- **Redundant or unprovable:** video/audio evidence, dialect recognition as a separate claim.

---

## 13. Non-functional requirements
- **Browsers:** latest Chrome and Edge (desktop + Android Chrome). Test both in Playwright (`channel: 'msedge'`).
- **Mobile:** fully usable at 360 px wide, no horizontal scroll.
- **Privacy:**
  - Mask personal data before AI calls and on officer screens.
  - Public data is aggregated or jittered (75 m), with no text and no ids.
  - Anonymous and private modes.
  - Consent prompts for location and microphone.
  - An AI transparency notice.
  - Privacy notice in en/te/hi/ur.
- **Security:**
  - Supabase JWT verified on every non-public route; role checks.
  - Row-level security for realtime.
  - Rate limiting.
  - Upload validation (images ≤ 8 MB, EXIF GPS read then stripped).
  - Service key only on the backend.
- **Reliability:** every AI task has a fallback; demo mode replays cached AI responses; `/health` shows provider status.

---

## 14. Demo accounts (seeded by B, shown as one-click buttons when `VITE_DEMO_MODE=true`)

All accounts use password `Demo@2026`. The `.test` domain is reserved, so no real email is ever sent.

| Role | Email | Persona |
|---|---|---|
| citizen | `lakshmi@janavaani.test` | Lakshmi Devi, Kukatpally, prefers Telugu |
| citizen | `imran@janavaani.test` | Imran Khan, Charminar, prefers Urdu |
| officer | `ravi.roads@janavaani.test` | Ravi Kumar, AE Roads, Kukatpally + Serilingampally zones |
| officer | `sunitha.electrical@janavaani.test` | Sunitha Reddy, AE Electrical (streetlights + power liaison) |
| officer | `farhan.water@janavaani.test` | Farhan Ali, Manager Water Supply, Charminar zone |
| supervisor | `supervisor@janavaani.test` | Deputy Commissioner, all departments |
| admin | `admin@janavaani.test` | Commissioner's Office |

Guests use "Continue as guest" (Supabase anonymous sign-in) and get a ticket ID plus a 6-digit PIN.

---

## 15. Demo data story (seeded by B)

About 600 synthetic complaints over the last 180 virtual days, plus these narratives:

1. **Live wire near a school (Kukatpally):** performed live in the demo by voice in Telugu. A seeded backup exists.
2. **Pothole cluster at Miyapur X Roads:** 32 reports in Telugu, Hindi, English and Tenglish, merged into one incident.
3. **Contaminated water spike (Charminar and Falaknuma):** 35 Urdu/Hindi complaints in the last 48 hours, which triggers a spike alert.
4. **Suspicious closure (streetlight, Ameerpet):** the officer uploaded the citizen's own photo as "proof", so the AI flags it.
5. **Repeated reopen (drainage, Malakpet):** reopened 3 times, which triggers a repeated-failure alert.
6. **Monsoon pattern:** drainage and water complaints rise in July–September in the history charts.

---

## 16. Demo script (4 minutes)

1. **(0:00) Landing:** City Pulse hero, live stats; "Every complaint, in every language."
2. **(0:25) Citizen, voice in Telugu:**
   - Lakshmi speaks about a live wire near a school.
   - Language auto-detected; the emergency screen appears with 112/108/1912.
   - She continues to register: formal complaint shown in Telugu and English, routed to Power with high confidence, priority 92 with reasons, SLA 4 hours.
3. **(1:10) Photo-to-grievance in Tenglish:** a pothole photo plus "Miyapur X roads lo pedda gunta undi". The system says "32 people already reported this", and she adds her support instead.
4. **(1:40) Officer:**
   - Ravi's inbox is priority-sorted. Opens the case: original Telugu next to the English translation, AI brief.
   - Drafts a reply in English, which the citizen receives in Telugu with a "Listen" button.
   - Resolves with a photo.
5. **(2:20) Trust:**
   - The streetlight case shows **AI verification: suspicious** (same photo as the citizen's).
   - The citizen rejects the closure and reopens; the audit chain verifies.
6. **(2:50) Admin:**
   - Heatmap, then a spike alert for contaminated water in Charminar with Urdu complaints.
   - Time-travel 48 hours and watch escalations fire.
   - Department leaderboard.
7. **(3:30) AI model page:** accuracy per language on the human-written test set, a routing correction, retrain, accuracy updates.
8. **(3:50) Close:** impact numbers, free and open stack, ready for GHMC-scale rollout.

---

## 17. Global definition of done
- Works in Chrome and Edge desktop and on a 360 px mobile viewport, with no console errors.
- Loading, empty and error states exist; strings are translated; keyboard accessible; reduced motion respected.
- Works in `mock` and `hybrid` modes.
- `npm run build` / `npm run lint` (frontend) or `pytest` (backend) pass.
- Committed and pushed; `docs/progress/<X>.md` updated.

---

## 18. Day-0 human checklist (before H0, or while A runs P0)
- [ ] GitHub repo created, three collaborators added, docs committed to `main`.
- [ ] Supabase project created, region closest to India:
  - [ ] Enable extensions `postgis` and `vector`.
  - [ ] Enable **anonymous sign-ins**.
  - [ ] Copy the URL, anon key, service key and Session pooler URI.
- [ ] Gemini API key per person (Google AI Studio). Note the free models and limits on the project's rate-limit page.
- [ ] Groq API key per person (console.groq.com). Note the model ids.
- [ ] Vercel and Hugging Face accounts created (one person each is enough).
- [ ] On each demo laptop, open Chrome and Edge and run `speechSynthesis.getVoices()` in DevTools. Note which have Telugu, Hindi and Urdu voices.
- [ ] Each team member writes 16 realistic complaints (4 each in Telugu, Hindi, Urdu or Tenglish, and English) for the human test set, and sends them to B's human by H10.
