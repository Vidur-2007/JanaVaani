# Progress — Laptop C (Department, Admin, Public portals)

Branch: `feat/gov-portals` · Numbers like `#28` are endpoints from master §9.

## Status

- **Done:** P0 planning. P1: gov shell, P1 `gov-shared` components, inbox, incidents tab, en/te/hi `gov.json`, `e2e/gov/p1-inbox.spec.ts`. P2: case cockpit with actions panel, supervisor queues, My stats, gov mock handlers, `e2e/gov/p2-case.spec.ts`.
- **In progress:** nothing.
- **Next:** P3: connect to B's API in hybrid mode, then the admin pages.
- **Blockers:**
  - **CARTO tiles are watermarked "API KEY REQUIRED"** on every anonymous request, with or without a referrer. The URL is hardcoded in A's `MapViewImpl.tsx`, and CARTO is in the locked stack (master §4), so this needs a team decision. It affects every map, including landing and citizen. Proposed: A adds an optional tile URL/attribution prop to `MapView`.
  - A's `e2e/citizen/smoke.spec.ts` "gov routes render" test asserts the `gov-placeholder` and `inbox-stub` test ids on `/officer` and `/admin`, which P1 replaced. A should update it; C does not own that file.
  - Items B1–B3 below need B's human.
- **Contract notes:** see section 6. Copy the agreed ones to `docs/contract-notes/C.md`.

### P2 notes for later phases

- Disputed-closure buttons use #30 as a stopgap until B answers B3: "demand new proof" sets `in_progress`, "close as disputed" sets `closed`, each with a note. The closure type stays whatever B sets.
- Mock `/admin/audit/verify` allows officers, but the contract says admin-only (B2). "Verify chain" will show an error for officers on the live API until B changes it.
- My stats is computed client-side from up to 100 finished cases from #28 (G1), so it undercounts beyond that.
- The AI brief uses its own query key (`jv-brief`), outside `qk.officer`, so live events don't re-run the LLM.
- Mock resolve always returns `suspicious` for streetlights, to rehearse the Ameerpet story. The red "broken chain" state has no fixture until P4.
- `AuditChain` is the compact form; the full block view is P4.
- Shell commands over about 6 KB get truncated here. Put long scripts in a file with the Write tool.

### P1 notes for later phases

- `CommandCenterStub.tsx` is an interim page that exercises `KPIStatGov`, `GovMap`, `AlertCard` and `ChartCard`. P3 replaces it.
- `.touch-target` beats responsive `md:min-h-*` utilities. On dense gov controls use `min-h-11 min-w-11 md:min-h-9 md:min-w-0` instead.
- `DataTable` uses `content-visibility` for lists over 100 rows instead of a virtualizer, since data is server-paged. Revisit in P6 if needed.
- `@tanstack/react-table` is v9: the option is `features`, not v8's API.
- Mock `/officer/inbox` accepts a zone in `ward`; the live API may not (G7).

## 1. Pages, routes and endpoints

| Route | Page | Roles | Endpoints | Phase |
|---|---|---|---|---|
| (shell) | Sidebar, top bar, command palette, bell | gov | 6, 16, 18, 19, 20, 21, realtime | P1 |
| `/officer` | Inbox | officer+ | 28, 16, 40, 41 | P1 |
| `/officer/incidents` | Incidents tab | officer+ | 42, 12, 38 | P1 |
| `/officer/case/:id` | Case cockpit | officer+ | 6, 15, 24, 12, 30–32, 34 (supervisor), 35–38, 41, 52 | P2 |
| `/supervisor` | Queues, tabs via `?kind=` | supervisor+ | 29, 6, 30, 32, 33, 34, 39 | P2 |
| `/officer/stats` | My stats | officer+ | 28 (no stats endpoint, see G1) | P2 |
| `/admin` | Command Center | admin; supervisor read-only | 43, 22, 42, 47, 48, 49, 50, 44 | P3 |
| `/admin/map` | Full-screen map | admin | 48, 22, 42, 47, 6 | P3 |
| `/admin/departments` | Leaderboard + drawer | admin | 44, 45, 46, 28 | P3 |
| `/admin/officers` | Workload | admin | 45, 41 | P3 |
| `/admin/analytics` | Trends, breakdowns, delay risk | admin | 46, 47, 49, 28 | P3 |
| `/admin/alerts` | Alerts | admin, supervisor | 49, 6 | P4 |
| `/admin/audit` | Event explorer + chain | admin | 51, 52 | P4 |
| `/admin/ai` | AI model | admin | 53, 54 | P4 |
| `/admin/demo` | Demo controls (`VITE_DEMO_MODE` only) | admin | 55, 56, 57 | P4 |
| `/admin/reports` | Report builder | admin | 43, 44, 47, 49, 28 | P4 |
| `/public` | Transparency portal | none | 20, 22, 25, 26 | P5 |

## 2. `gov-shared` components

Page-only pieces (reply composer, AI brief card, inbox row, queue tabs) stay in their portal folder.

| Phase | Component | Notes |
|---|---|---|
| P1 | `GovShell`, `GovSidebar`, `TopBar`, `CommandPalette`, `NotificationsBell`, `GovGuard` | `layout/`; guard wraps `RequireRole` |
| P1 | `DataTable`, `FilterBar` | Cards under 768 px; filters synced to the URL |
| P1 | `KPIStatGov`, `ChartCard` | Wrap `KPIStat`; chart has formula tooltip, table view, PNG export |
| P1 | `GovMap` | Wraps `MapView`; heat, cluster, ward, incident, pulse layers |
| P1 | `PriorityFactorList`, `RoutingExplain`, `VerificationBadge`, `AlertCard` | |
| P1 | `SLACountdownGov` | Added to the spec list; wraps `SLACountdown` with amber under 25%, red on breach |
| P2 | `CaseHeader`, `TranslationSplit`, `EvidenceViewer` | Evidence viewer wraps `BeforeAfterSlider` |
| P2 → P4 | `AuditChain` | Compact per-case form in P2, full block view in P4 |
| P3 | `DeptLeaderboard` | Top-5 and full table modes |
| P4 | `ConfusionMatrix`, `ExportMenu` | CSV, Excel, PDF; raster PDF for Indic text |

Support files: `gov-shared/api.ts`, `gov-shared/types-ext.ts`, `gov-shared/mocks/`.

## 3. Mock data beyond the shared mocks

A's mocks give about 80 grievances and a handler for every endpoint, but nothing guarantees the demo stories or gov flows. Fixtures go in `gov-shared/mocks/`, served through a `gov-shared/api.ts` wrapper unless the scaffold has a hook.

| Fixture | Needed for | Phase |
|---|---|---|
| Inbox spread: emergency, critical overdue, reopened ×3, suspicious, each language | Sort order and flags | P1 |
| Incident with 32 members (Miyapur) and mixed languages | Incidents tab, bulk merge | P1 |
| 3 full cases with Telugu, Urdu and Tenglish originals, messages, internal notes, proof photos | Case cockpit | P2 |
| `OfficerBrief` per case; `DraftReply` per intent with Telugu/Urdu output | AI brief, composer | P2 |
| Stateful resolve: verified by default, suspicious for the Ameerpet streetlight | Resolve flow, e2e 2 | P2 |
| 2–3 cases per review-queue kind, plus appeals | Supervisor tabs and badges | P2 |
| Personal stats and streak | `/officer/stats` | P2 |
| ~600 `MapPoint`s with dates, Charminar and Miyapur clusters | Heatmap, 30-day replay | P3 |
| Ward polygons, if #22 mock is empty | Choropleth, ward click | P3 |
| Ward detail, sub-department rows, satisfaction histogram, open-by-priority per officer | Drawers and charts (G4, G5) | P3 |
| At least one overloaded officer; high-delay-risk cases | Workload, delay list | P3 |
| Spike detail: 28-day baseline, 24 h count, languages, examples | Spike mini-chart (G6) | P4 |
| Long audit chain, plus one tampered chain | Green and red verify states | P4 |
| Clock simulation that fires escalations and adds alerts | e2e 4 | P4 |
| Retrain that appends a version with higher accuracy | e2e 5 | P4 |
| Before/after images (local placeholders, no people) | Recently fixed cards | P5 |

## 4. Build plan

Each phase ends with: commit, push, update this file. Add `gov.json` keys as strings appear, not at the end.

**P0 follow-up (scaffold ready).** `feat/gov-portals` already exists on origin at the docs commit, so the `git checkout -b` in `PROMPTS-C.md` will fail. Use `git fetch origin --tags && git merge v0-scaffold` instead. This is the starting point, not a pre-H30 merge between laptops. Then check the items in section 5.

**P1 (H1.5–H7).**
1. Shell, role guards, command palette, bell.
2. `DataTable`, `FilterBar`, `KPIStatGov`, `ChartCard`.
3. `GovMap` and the small P1 components.
4. Inbox: summary strip, sort, rows, search, bulk actions.
5. Incidents tab, realtime slide-in.
6. `gov.json` en/te/hi.

**P2 (H7–H13).**
1. Case cockpit left and center columns.
2. Actions panel, shortcuts.
3. Supervisor queues.
4. My stats.
5. Realistic mocks; Playwright e2e 1–3.

**P3 (H13–H19).**
1. Switch to hybrid on B's URL, run inbox and case flows, log mismatches.
2. Command Center.
3. Map page with time slider.
4. Departments.
5. Officers.
6. Analytics.

**P4 (H19–H25).**
1. Alerts.
2. Audit + full `AuditChain`.
3. AI model page.
4. Demo controls.
5. Exports and report builder.
6. Playwright e2e 4–5.

**P5 (H25–H30).**
1. Public portal, with public copy in en/te/hi/ur.
2. Realtime across gov pages.
3. `gov.json` completeness.
4. Accessibility pass.
5. Build, lint, Playwright (e2e 6–7), then open PR "Integration: gov portals". No merging by C.

If time runs short, cut in this order: time slider, report builder, charts on the department drawer. Keep the demo-script moments (master §16 steps 4–7).

## 5. Check against the scaffold

Resolved at P1:

- **Supervisor routes:** mounted through the `SupervisorRoutes` named export. No change needed from A.
- **Mock hook:** `registerMockHandler` exists; use it from `gov-shared/mocks/` instead of an `api.ts` wrapper.
- **#22 mock:** returns real ward polygons.
- **Dependencies:** SheetJS is installed. `@tanstack/react-virtual` is not; see the `DataTable` note in Status.

## 6. Contract gaps

Found by comparing Spec C with master §8–9. Nothing below is agreed with B yet.

**Needs B (live API fails without these)**

| # | Gap | Ask |
|---|---|---|
| B1 | Supervisors get a read-only `/admin` overview, but #43, 44, 46–48 and 50 are admin-only. Hybrid falls back on network errors, 404 and 501, not 403, so the page breaks. | Allow supervisor on those GETs |
| B2 | Officers use "Verify chain" on the case page, but #52 is admin-only. | Allow officer+ when `grievance_id` is set |
| B3 | "Close as disputed" and "demand new proof" have no contract path: `ClosureType` has no disputed value. | Confirm how #30 should express them |

**C can work around (additive field would be better)**

| # | Gap | Workaround | Optional addition |
|---|---|---|---|
| G1 | No personal stats endpoint | Compute from #28 pages | `GET /officer/me/stats` |
| G2 | `MapPoint` has no date, so replay cannot bin by day | Replay in steps with `days=` | `created_at?` on #48 |
| G3 | `DemoClock` has no escalation count for the toast | Diff #49 before and after | `escalations_fired?` |
| G4 | `OfficerWorkload` has no open-by-priority | Stack critical vs other open | `open_by_priority?` |
| G5 | No satisfaction distribution or sub-department breakdown | Average per department; compute from #28 | Histogram; `by=sub_department` on #47 |
| G6 | `Alert` has no spike series | Detail stats from `detail_en` only | `spike?: {baseline, sigma, count_24h}` |
| G7 | #28 has no language, date, zone or delay-risk filters; `sort` values are undefined | Filter the fetched page; expand zone client-side | Extra params; default sort per Spec C §5.1 |
| G8 | Summary strip has no counts endpoint and no "due today" filter | Count from a fetched page | `counts?` on #28 |
| G9 | #51 has no actor or date filter | Filter the fetched page | Extra params |
| G10 | `human_test` has no macro-F1, though Spec C §6.8 wants both | Show accuracy only for the human set | `macro_f1?` |
| G11 | "Resolve all with one proof" has no endpoint | Call #38 per open member | `action: 'resolve'` on #40 |
| G12 | Bulk actions have no undo | Delay the POST 5 s behind the undo toast | None |
| G13 | Alert acknowledge has no endpoint (spec allows this) | Client-side store | None |
| G14 | Cluster → case list needs N calls to #6 | Cap at 20, link the rest to inbox | `ids` param on #28 |
| G15 | "#52 sample of 50" is undefined with no `grievance_id` | Assume it verifies a sample | Confirm with B |
| G16 | `escalation_level` allows 3; master defines 0–2 | Render 3 safely | None |
