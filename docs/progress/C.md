# Progress — Laptop C (Department, Admin, Public portals)

Branch: `feat/gov-portals` · Numbers like `#28` are endpoints from master §9.

## Status

- **Done:** P0 planning. P1: gov shell, P1 `gov-shared` components, inbox, incidents tab, en/te/hi `gov.json`, `e2e/gov/p1-inbox.spec.ts`. P2: case cockpit with actions panel, supervisor queues, My stats, gov mock handlers, `e2e/gov/p2-case.spec.ts`. P3 Step 2: Command Center, city map, departments, officers, analytics, `e2e/gov/p3-admin.spec.ts`. P4: alerts, audit explorer and block chain, AI model page, demo controls, CSV/Excel/PDF exports, report builder, `e2e/gov/p4-trust.spec.ts`. P5: public portal, realtime highlights, gov.json (en/te/hi complete; Urdu for the public portal, nav and charts), accessibility pass, `e2e/gov/p5-public.spec.ts`. P6 (except the merge and deployed API): §16 run on B's local API, bug fixes, `e2e/gov/p6-suite.spec.ts`, chart memoization, KPI tween, error-state gaps. P7: polish (alert cascade, staggered map pulses, audit walk timing, palette legend, skyline empty states), demo shortcuts, `e2e/gov/p7-demo.spec.ts`. P8 partly: `docs/demo-script.md` and `docs/slides-outline.md` drafted; the deployed click-through is not done. P3 Step 1 partly: gov API calls checked against B's code run locally; mismatches fixed or logged in `docs/contract-notes/C.md`.
- **In progress:** P3 Step 1 is unfinished: B has no deployed URL, so `.env.local` is not set and the UI has not run in hybrid mode.
- **Next:** open the gov PR. After the merge and deployment: click through every gov route in Chrome and Edge on desktop and phone, fill in the blanks in `docs/demo-script.md`, and do two full run-throughs.
- **Blockers:**
  - **The H30 merge has not happened.** `origin/main` is still the scaffold, PRs #1 (B) and #2 (A) are open, and there is no gov PR. `git merge origin/main` was a no-op, so this branch still has `v0-scaffold` shared code.
  - **B's API is not deployed** (needs Supabase project, keys and HF Space, per B's handover).
  - After the merge, two tests in A's `e2e/citizen/smoke.spec.ts` fail because they expect P0 placeholder test ids (`gov-placeholder`, `inbox-stub`). Fix at H30: assert the real pages instead.
  - Items B2 and B3 below need B's human. B1 is resolved: B allows supervisors on the admin GETs.
- **Contract notes:** see section 6 and `docs/contract-notes/C.md`.

### P8 rehearsal

No deployed site exists and `main` is still the scaffold, so the deployed click-through could not run. A throwaway clone merged B, A and C at their latest commits: no conflicts, typecheck and lint pass, Playwright on Chromium, Edge and mobile Chrome in mock mode gave 390 passed, 48 skipped, 6 failed. The Chromium failures are A's two stale smoke tests; the other 4 are expected to be the same two tests. No gov blockers were found. Real phones and the Edge and Chrome phone views of the deployed site remain unchecked.

### P7 rehearsal

UI in `live` mode on B's latest code, run locally with no AI keys. Times are one run on this laptop, and the deployed Space will be slower.

| Moment | Time |
|---|---|
| Suspicious case from the demo shortcut | 0.6 s |
| Spike alert | 1.0 s |
| Verify chain | 1.0 s |
| Command Center with heatmap | 1.5 s |
| Time travel +48 h | 2.9 s |
| Retrain | 3.5 s |
| Reset | 9.8 s |

- **Do not reset on stage.** Reset before the demo.
- **Retrain moves with corrections, but can go down.** 20 deliberately wrong corrections took synthetic accuracy from 77.8% to 69.4% and human-set accuracy from 75.0% to 79.2%. Step 7 needs genuine corrections, and the outcome of one real correction is untested. Rehearse the exact correction, or do not promise a rise.
- Stretch (Surge Mode, root-cause graph) was not built. B has no endpoints for them, and client-only versions would show invented data.

### Known issues (P6)

Found by driving the real UI in `live` mode against B's latest code running locally, with Playwright adding each role's token. Run again against the deployed API when there is one.

- **B: officers get 403 on "Verify chain".** The UI shows the error.
- **B: alert titles expose raw ward ids** ("Spike: 8 water complaints in 24 h (W-CHR-02)").
- **B: seeded disputed cases show the placeholder reason "Seeded history"** with a Verified badge. Only 1 of 17 is suspicious.
- **B: Ravi's inbox has 0 critical and 18 of 18 overdue**, which weakens demo step 4. The first case is English, not the Telugu case the script describes.
- **B: resolve returns `unclear`** with no vision provider, so the live "verified" path is unseen until keys exist.
- **Virtualization:** tables are server-paged (25–100 rows) and use `content-visibility`. No virtual-scroll library was added, to avoid a dependency change.
- **Bundle:** xlsx, jspdf, html2canvas, Recharts and Leaflet plugins load on demand. Largest always-needed chunks are about 97 KB gzipped.

### Integration rehearsal

Throwaway clone in the scratchpad, merged in the integrator's order (B, A, C), nothing pushed:

- No merge conflicts. Typecheck and lint pass.
- CARTO watermark: fixed by A's `MapView` (OpenStreetMap tiles). It still shows on this branch until the merge.
- Paper contrast, the language switcher name and the `DepartmentBadge` role are fixed by A's shared changes.

### P5 notes for later phases

- After the merge, `Slider` has `thumbProps`, but the replay control is a native range input, so nothing depends on it.
- `errorMessage` becomes friendly and translated after the merge; `common:errors.*` covers gov too.
- Realtime uses the existing `useLiveEvents`: lists refetch on invalidation, and `useFreshIds` plus `data-pulsing` add the highlights.
- `window.__jvMockDb` exists outside `live` mode so e2e can stage live events.
- Urdu covers the public portal, nav, charts and map. Other gov screens fall back to English; the gov language switcher stays en/te/hi.
- Bulk selection, keyboard flows and exports have no automated screen-reader test. axe found no table issues, but nobody has used a real screen reader yet.

### P4 notes for later phases

- "Hybrid" so far means a dead API: every call falls back to mocks and the counter rises. Real hybrid needs B's URL and a login.
- P4 endpoints were checked on B's local API with scripts: audit, verify, metrics, retrain, clock (+48 h gave 396 escalations, alerts 6 to 13), reset and health. No mismatches.
- Demo toast uses B's `escalations` stats, with an alert-count diff as fallback (`ClockResult` in `types-ext.ts`). G3 is resolved.
- Spike mini-chart uses citywide category counts from #46 (G6), so its baseline can differ from the ward-level figure in the alert text.
- "Verify all chains" checks every chain, not the sample of 50 in the spec, because #52 without an id does that.
- Human-set macro-F1 shows a dash: B computes it but #53 drops it (G10).
- Alert acknowledgement is stored per browser.
- Mock verify reports GRV-2026-000119 as tampered, to rehearse the red state. Real tampering needs B's `scripts/tamper_demo.py`.

### P3 notes for later phases

- Map replay diffs six `days=` windows by point id, because `MapPoint` has no date (G2). It gives 5-day frames.
- Spec departures forced by missing data: satisfaction shows averages, not a distribution (G5); officer bars stack critical against other open (G4); "resolution vs SLA target" uses a 96 h reference line, since there is no per-department target.
- `KPIStat` re-counts from 0 when a value changes, because it is A's component. Spec §8 asks for a tween; raise it with A or wrap it in P5.
- Insights uses its own query key, like the AI brief, so live events don't re-run the LLM.
- To rerun the API checks: `git archive origin/feat/ai-engine services ml data scripts supabase`, blank `.env`, `PYTHONUTF8=1`, `python ml/seed_db.py`, then uvicorn.

### P2 notes for later phases

- Disputed-closure buttons use #30 as a stopgap until B answers B3: "demand new proof" sets `reopened` (from pending) or `in_progress`, and "close as disputed" sets `closed`, only from pending, with a note. B leaves `closure_type` null.
- "Verify chain" returns 403 for officers on B's API until B2 is done. The mock is looser than B here.
- My stats is computed client-side from up to 100 finished cases from #28 (G1), so it undercounts beyond that.
- The AI brief uses its own query key (`jv-brief`), outside `qk.officer`, so live events don't re-run the LLM.
- Mock resolve always returns `suspicious` for streetlights, to rehearse the Ameerpet story. The red "broken chain" state has no fixture until P4.
- `AuditChain` is the compact form; the full block view is P4.
- Shell commands over about 6 KB get truncated here. Put long scripts in a file with the Write tool.

### P1 notes for later phases

- `.touch-target` beats responsive `md:min-h-*` utilities. On dense gov controls use `min-h-11 min-w-11 md:min-h-9 md:min-w-0` instead.
- `DataTable` uses `content-visibility` for lists over 100 rows instead of a virtualizer, since data is server-paged. Revisit in P6 if needed.
- `@tanstack/react-table` is v9: the option is `features`, not v8's API.

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
| G11 | "Resolve all with one proof" has no endpoint | Call #38 per resolvable member; B carries merged members with the parent | `action: 'resolve'` on #40 |
| G12 | Bulk actions have no undo | Delay the POST 5 s behind the undo toast | None |
| G13 | Alert acknowledge has no endpoint (spec allows this) | Client-side store | None |
| G14 | Cluster → case list needs N calls to #6 | Cap at 20, link the rest to inbox | `ids` param on #28 |
| G15 | "#52 sample of 50" is undefined with no `grievance_id` | Assume it verifies a sample | Confirm with B |
| G16 | `escalation_level` allows 3; master defines 0–2 | Render 3 safely | None |
