# Spec C — Department Portal, Government Admin Portal & Public Transparency Portal

> **Laptop C · branch `feat/gov-portals`**
> Read `00-MASTER-SPEC.md` first. C builds everything government users and the public see.

## 1. Mission
Make officers fast and admins all-seeing:
- **Department portal:** an officer clears a case in under a minute with AI help. Supervisors handle the decisions that need a human.
- **Admin portal:** a command center that makes the city's problems, performance and AI behaviour visible at a glance, with tamper-evident trust built in.
- **Public transparency portal:** proves accountability without exposing anyone.

Design mood: **a calm, dark "Ink" command center**. Dense but breathable, with motion used for meaning (new items, changes, alerts), never decoration.

## 2. Files C owns
- `apps/web/src/portals/officer/**`, `portals/admin/**`, `portals/public/**`, `portals/gov-shared/**`
- `apps/web/src/i18n/locales/*/gov.json`
- `e2e/gov/**`
- `docs/progress/C.md`, `docs/contract-notes/C.md`

**Use but never edit:** `src/app`, `src/lib`, `src/design`, `packages/contracts`. Until the H30 integration merge you build against the `v0-scaffold` version of these; never pull A's branch to get newer versions. Extra contract types go in `portals/gov-shared/types-ext.ts`.
- To extend a shared component, wrap it in `gov-shared/`.
- Extra mock data goes in `gov-shared/mocks/` and is registered through a small additive hook. If the mock layer has no hook, put it in a `gov-shared/api.ts` wrapper that falls back to local fixtures.

## 3. Gov shell (`gov-shared/layout`)
- **Sidebar:** collapsible to icons; on mobile a bottom sheet nav.
  - Logo, role badge, department or "All departments".
  - Nav items by role.
  - `LiveIndicator`, theme toggle (default Ink), language switch (en/te/hi; Urdu optional), user menu.
- **Top bar:** breadcrumb, global search, **command palette** (`cmdk`, Ctrl/Cmd+K): jump to ticket by ID, open pages, quick filters ("critical overdue in my zone").
- **Notifications bell:** gov notifications via `/notifications` + `useLiveEvents` (escalations, assignments, alerts).
- **Role guards:**
  - officer → `/officer/*`
  - supervisor → `/officer/*` + `/supervisor/*` + read-only `/admin` overview
  - admin → everything
- Page transitions via the shared `PageTransition`. Respect reduced motion.

## 4. Gov components (`gov-shared/components`)
- **`DataTable`:** TanStack Table with sticky header, column visibility, row selection, keyboard row navigation (j/k, Enter), virtualized when > 100 rows; becomes cards under 768 px.
- **`FilterBar`:** department, priority, status, ward/zone, date range, overdue-only, language, search. URL-synced (query params) so views are shareable.
- **`KPIStatGov`:** count-up, delta arrow and color, sparkline, click-through to a filtered list.
- **`ChartCard`:** title, info tooltip explaining the metric formula, Recharts body, empty/error states, "export PNG" (html-to-image).
- **`GovMap`:** wraps `MapView`, with layer toggles:
  - heatmap (`leaflet.heat`)
  - clusters (`leaflet.markercluster`)
  - ward choropleth (from `/meta/wards.geojson` + breakdown)
  - incidents (sized by support count)
  - critical pulses (CSS-animated markers)

  Plus a legend, a filter sync with `FilterBar`, and the "Approximate demo boundaries" note. Basemaps: CARTO `dark_all` (Ink) / `light_all` (Paper) with "© OpenStreetMap contributors © CARTO" attribution.
- **`CaseHeader`, `TranslationSplit`, `EvidenceViewer`, `AuditChain`, `AlertCard`, `ConfusionMatrix`, `DeptLeaderboard`, `ExportMenu`, `PriorityFactorList`, `RoutingExplain`, `VerificationBadge`.**

---

## 5. Department Portal (officer)

### 5.1 Inbox (`/officer`) (features 126–131, 143)
- **Header summary strip:** My open · Critical · Overdue · Due today · Pending verification (all clickable filters).
- **Default sort:** emergency first, then critical overdue, then priority score descending, then SLA remaining ascending (feature 129).
- **Row content:**
  - Priority chip with score, ticket id (mono), title (English; original-language badge), department/sub-department, ward;
  - **SLA countdown** (turns amber under 25% remaining, red when breached);
  - support count (people icon), status chip, escalation level dots;
  - flags: emergency, needs review, suspicious closure, reopened ×N.
- **Search** (feature 131): ID exact match, or semantic `/search?scope=gov` (any language).
- **Bulk actions** (feature 143), with a confirmation dialog showing the count and an undo toast:
  - set status;
  - assign to an officer;
  - **merge into incident** (only when all rows share an `incident_id` suggestion).
- **Incidents tab:** `/officer/incidents`, cards with member count, languages reported, a mini-map, and "Resolve all with one proof".
- **Realtime:** new assigned cases slide in at the right position with a subtle glow and a toast.

### 5.2 Case detail (`/officer/case/:id`) — the officer's cockpit
Three-column layout on desktop (stacked on mobile):

**Left — Citizen's words** (features 133, 257):
- `TranslationSplit`: the original-language text (correct font, RTL for Urdu) next to the English translation.
- Toggle the formal complaint version; badges for language, code-mixed, detected sentiment.
- Location mini-map with ward and landmark; asset link (if QR).
- Citizen display name, or "Anonymous citizen".

**Center — Case work:**
- **AI Brief card** (`POST /officer/grievances/{id}/brief`, feature 132/259), marked with the indigo **AI** style:
  - situation, evidence, risks, suggested next steps (checklist), missing info ("Ask citizen for pole number");
  - "Similar resolved cases" with their resolution notes;
  - refresh button.
- **Evidence viewer** (feature 134): gallery + lightbox; AI image description and quality badge; **BeforeAfterSlider** once proof exists.
- **Timeline / audit** (features 75, 124): all events including internal notes, with actor and time. A small chain-link icon per event; "Verify chain" calls `/admin/audit/verify?grievance_id=` and animates the links green, or red at the break.
- **Messages:** thread with the citizen (English view, original available).

**Right — Actions panel:**
- **Status control** (feature 135): Assigned → In progress → (Resolve). Selecting "delay" requires a `delay_reason` select.
- **Reply composer** (features 141, 142):
  - Intent chips (Acknowledge, Request info, Schedule visit, Work started, Delay update, Resolved, Transfer).
  - "Draft with AI" → editable English draft + a preview of what the citizen will see (`draft_citizen.original`, with a Listen button).
  - Send → `/message`. Shows "Will be delivered in Telugu".
- **Notes** (feature 136): internal only, clearly marked "Not visible to citizen".
- **Reassign** (features 47, 137): department and/or officer select (with workload counts from `/officer/officers`) + required reason. Shows a warning that this trains the model ("This correction improves future routing").
- **Resolve** (features 140, 275, 253):
  - Proof photo upload (camera on mobile) with device GPS captured (permission prompt) + action-taken note.
  - Submit, then show the **AI verification result** inline: verdict badge, confidence, reasons, checks (distance, same-photo check).
  - If `suspicious`: a red banner "Supervisor has been notified".
- **Routing card:** department, confidence meter, the three votes (classifier/Gemini/Groq with agree/disagree icons), explanation (features 45, 48, 199).
- **Priority card:** score + factor list (feature 70); for supervisors, an emergency confirm/deny control (feature 69).
- **SLA card:** due, remaining, ETA, escalation level, delay risk.

**Keyboard shortcuts:** `r` reply, `n` note, `s` status, `v` verify chain, `Esc` back to inbox.

### 5.3 Supervisor queues (`/supervisor`) (features 46, 63, 69, 113, 114, 123)
Tabs from `/officer/review-queue?kind=`:
- **Routing review:** low-confidence cases. Show the votes and text, then choose a department (`route-decision`); the correction is logged.
- **Emergency confirmations:** unconfirmed emergencies with a countdown since report. Confirm sets SLA 4 hours and alerts; deny drops to normal priority with a reason.
- **Disputed closures:** reopened or rejected closures with before/after photos and the AI verdict. Actions: reassign, demand new proof, close as disputed.
- **Appeals:** reason (translated), history. Uphold or dismiss with a note (`appeal-decision`).
- **Badge counts** on tabs. **Empty states celebrate** ("Queue clear ✓").

### 5.4 My stats (`/officer/stats`)
- Personal: resolved this week, average resolution time, SLA %, average rating, a small trend chart.
- Light gamification: a "streak" of SLA-met cases.

---

## 6. Government Admin Portal

### 6.1 Command Center (`/admin`) (features 144, 145, 146, 149, 161, 265)
- **Row 1, KPI cards:** Total · Open · Resolved · Overdue · Critical open · SLA compliance % · Avg resolution time · Satisfaction. Each counts up with a delta vs the previous period.
- **Row 2:**
  - **Live city map** (large): heatmap default, toggles for clusters, wards and incidents. Critical pulses.
  - **Alerts rail:** `AlertCard`s from `/admin/alerts` (spike, overdue critical, repeated reopen, suspicious closure, routing backlog, unconfirmed emergency), each linking to a filtered list or case.
- **Row 3:**
  - **AI Insights** card (`/admin/insights`, feature 194): 4–5 bullets with a "numbers verified ✓" badge and a regenerate button.
  - **Department leaderboard** (top 5 + "see all").
- **Date range selector:** 7/30/90 days. **Live updates** via `useLiveEvents` (KPI cards pulse softly when they change).

### 6.2 Map page (`/admin/map`) (features 165–167, 170–172, 174, 99)
- Full-screen `GovMap`; left filter panel.
- **Hotspot presets:** potholes, water leaks, garbage, drainage.
- Click a ward for a side panel with ward breakdown, top categories, open critical, recurring spots.
- Clusters expand into a case list.
- A **time slider** replays the last 30 days of complaints (animated heatmap) — a strong demo moment.

### 6.3 Departments (`/admin/departments`) (features 146–150, 157, 158)
- **Leaderboard table:** rank, score (with a formula tooltip from spec B, section 9), SLA %, average resolution, satisfaction, reopen rate, open, overdue.
- **Per-department drawer:** trend chart, sub-department breakdown, officers' workload, overdue list.
- **Charts:**
  - SLA compliance by department (bar);
  - average resolution vs SLA target (bullet-style bars);
  - satisfaction distribution;
  - **overdue leaderboard** (feature 158).

### 6.4 Officers (`/admin/officers`) (features 151, 49)
Workload table + stacked bar (open by priority per officer), highlight overloaded officers (≥ 1.5× the department median).

### 6.5 Analytics (`/admin/analytics`) (features 152, 154, 155, 182, 183)
- **Trends:** created vs resolved (area/line), by-category stacked view, day/week toggle. **Annotations** mark detected spikes.
- **Breakdown:** by ward/zone/category tables + bar charts; zone comparison (feature 153 via zones).
- **Prediction panel:** "Cases at high delay risk" list (from `sla.delay_risk`) and average ETA by category ("historical estimate" label).

### 6.6 Alerts (`/admin/alerts`) (features 67, 121, 185, 192, 265)
- A full list with severity filters.
- **Spike alerts:** mini chart (28-day baseline vs last 24 hours), languages seen, example complaints, "Open incident view".
- Acknowledge button (client-side state is fine; persist if B adds an endpoint).

### 6.7 Audit (`/admin/audit`) (features 124, 162, 242, 258)
- **Event explorer:** filter by type (escalations, reassignments, closures, emergency confirmations), actor, date; search by ticket.
- **Chain verification:** per grievance, or "Verify sample of 50". The `AuditChain` visualization shows blocks linked by hash, animating in sequence, green ✓ or red ✗ at the break. Show short hashes in mono.
- A "How this works" explainer popover (SHA-256 chain, tamper evident).

### 6.8 AI Model (`/admin/ai`) (features 52, 200, 201, 288)
- **Hero:** current model version, embedding model, accuracy and macro-F1 on synthetic test **and on the human-written test set** (the credibility point).
- **Per-language accuracy bars** (en, te, hi, ur, code_mixed, others).
- **Confusion matrix heatmap** with hover details.
- **Live ops:** auto-routed %, needs-review %, model/LLM agreement rate, average pipeline ms, fallback rate, calls in the last 24 hours.
- **Version history** line (accuracy per version), with corrections used.
- **Retrain button:** shows a progress state, then animates the metric change and adds a version to history.
- Explanation copy: "Three-way vote: our classifier + Gemini + Groq. Disagreement goes to humans. Human corrections retrain the model."

### 6.9 Reports and export (`/admin/reports`) (features 159 stretch, 164)
- **Export menu** on tables and pages:
  - **CSV:** generated client-side.
  - **Excel:** SheetJS, with sheets for KPIs, departments, grievances.
  - **PDF:** `jspdf` + `jspdf-autotable` for English-only tables. For any Indic text, use the `html-to-image` raster approach (see spec A, 5.9).
- **Report builder (light):** pick a date range and sections (KPIs, departments, top issues, alerts), then preview and export PDF.

### 6.10 Demo controls (`/admin/demo`, only when `VITE_DEMO_MODE`)
- **Virtual clock:** current virtual time, buttons +6h / +24h / +48h (`POST /admin/demo/clock`). After advancing, show a toast with the count of escalations fired and refresh everything.
- **Reset demo data** (with confirmation).
- **Provider health** (from `/health`).
- **Mode badge:** live/hybrid/mock and the mock-fallback counter.

---

## 7. Public Transparency Portal (`/public`) (features 240, 262)
No login, no personal data, light "Paper" theme by default, fully mobile.
- **Hero:** city resolution rate, average resolution time, total resolved (count-ups).
- **Anonymized heatmap:** `/public/map`, with category filter and an explanation of the anonymization ("locations blurred by ~75 m, no text or photos of people").
- **Department report cards:** resolution %, average time, trend sparkline.
- **Zone comparison:** bars by zone.
- **Recently fixed:** before/after slider cards (proof photos only).
- **Methodology and privacy** section in plain language (en/te/hi/ur via `gov.json`). Link to report an issue (`/app/report`).

---

## 8. Data visualization rules
- Use the **department color tokens** consistently. Priority colors are only for priority.
- **Every chart:** title, unit, info tooltip with the formula, accessible table fallback ("View as table"), empty and error states.
- **Number formatting:** `Intl` en-IN (lakh separators), tabular figures.
- **Motion:** charts animate in once (≤ 600 ms); live updates tween values, never re-mount.
- Never use 3D for data charts. Keep 3D for the landing.

## 9. i18n
- The `gov` namespace in en, te, hi (ur optional but appreciated): nav, statuses, actions, chart titles, empty states, public portal copy.
- Officer screens default to English. Citizen text is always shown in its original script with the correct font.

## 10. Testing (`e2e/gov`)
Run on `chromium`, `msedge`, `mobile-chrome` in mock mode, and hybrid when available:
1. Officer demo login → inbox sorted correctly → open case → draft reply → send.
2. Resolve with a photo → verification badge shown.
3. Supervisor routing review → decide department.
4. Admin command center renders KPIs/map/alerts → time travel → alert count changes (mock simulates).
5. AI model page → retrain → new version in history.
6. Public portal at 360 px, no horizontal scroll.
7. Keyboard-only: command palette opens a ticket.

## 11. Stretch for C (only after core)
- **S1 Disaster Surge Mode UI:** a red banner on admin; incident war-room page with live counts, map of affected wards, team assignment board.
- **S2 Root-cause graph:** a force-directed graph (SVG with Motion, or a small free library) linking complaints → incident → suspected root cause.
- **S8 Asset page:** `/admin/assets/:id` history timeline + printable **QR sheet** (`qrcode`) for a ward's streetlights.
- **S9 Field visit scheduling + subtasks** on the case; SLA policy editor; area civic scores.
- **S6 Monthly AI report:** a page rendering B's report with export.
