# Prompts — Laptop C (Department, Admin & Public Portals)

**Branch:** `feat/gov-portals` · **Specs:** `docs/specs/00-MASTER-SPEC.md` + `docs/specs/03-SPEC-C-GOV-PORTALS.md`

## How to use
1. Open Claude Code in the repo root.
2. Paste one phase prompt at a time and let it finish.
3. Do the **Human checks**, then continue.
4. If you hit the usage limit, start a new session with the **Resume prompt**.
5. **No merges until H30.** You push only to `feat/gov-portals`. You build on the `v0-scaffold` version of the shared code and reach Laptop B's backend through its deployed URL, not through git.

## Resume prompt
```
You are Laptop C on the JanaVaani hackathon project (branch feat/gov-portals).
Read docs/specs/00-MASTER-SPEC.md, docs/specs/03-SPEC-C-GOV-PORTALS.md, CLAUDE.md and docs/progress/C.md.
Summarize in 5 bullets where we are and what remains in the current phase, then continue.
Rules: only edit apps/web/src/portals/{officer,admin,public,gov-shared}/**, gov.json locale files, e2e/gov/** and C's docs files. Use but never edit src/app, src/lib, src/design, packages/contracts (extra types go in portals/gov-shared/types-ext.ts). Never merge or pull another branch before the H30 integration merge. Commit after each task and push to feat/gov-portals.
```

---

## P0 — Setup while Laptop A scaffolds (H0–H1.5)
**Human:** do the master §18 day-0 checklist items assigned to you (Supabase project, Vercel account, voice tests on both browsers) and share keys with B privately.

**Claude Code (planning only; no code until the scaffold exists):**
```
You are Laptop C on JanaVaani, a 48-hour hackathon project (Neural Storm, JNTUH, problem HI-02). You build the Department (officer + supervisor), Government Admin, and Public Transparency portals.
Read docs/specs/00-MASTER-SPEC.md and docs/specs/03-SPEC-C-GOV-PORTALS.md fully. Do not write app code yet (Laptop A is creating the scaffold on main).
Produce docs/progress/C.md (create it if missing) containing: a page inventory with routes, a component inventory for gov-shared, which endpoints each page uses, the mock data I will need beyond the shared mocks, and an ordered build plan for P1–P5 matching the master timeline. Keep it concise.
```
**When A says the scaffold is ready:**
```
git pull origin main && git checkout -b feat/gov-portals && git push -u origin feat/gov-portals
```

---

## P1 — Gov shell, gov components, officer inbox (H1.5–H7)
```
Resume context: Laptop C, feat/gov-portals. Read Spec C §3, §4, §5.1, §8. Load the frontend-design guidance if available to you.
Phase 1, commit after each:
1. Gov shell (Spec C §3): collapsible sidebar / mobile bottom-sheet nav, role-based nav items, top bar with breadcrumb + global search + cmdk command palette (Ctrl/Cmd+K), notifications bell using useLiveEvents, theme (Ink default), language switch, role guards for /officer, /supervisor, /admin. Register routes only in our portals' routes.tsx files.
2. gov-shared components (Spec C §4): DataTable (TanStack, sticky header, selection, j/k keyboard nav, card layout <768px), URL-synced FilterBar, KPIStatGov, ChartCard (with formula tooltip + "view as table" + PNG export), GovMap with heat/cluster/ward/incident/critical-pulse layers and CARTO basemaps + attribution, PriorityFactorList, RoutingExplain, VerificationBadge, AlertCard.
3. Officer inbox /officer (Spec C §5.1): summary strip, correct default sort, rich rows with SLA countdown colors and flags, ID + semantic search, bulk actions with confirm + undo, incidents tab, realtime slide-in of new cases.
4. gov.json translations for en/te/hi for everything so far.
Work in mock mode. Quality: dense but calm command-center look, Awwwards-level polish, reduced-motion respected, 360px usable.
Push; update docs/progress/C.md.
```
**Human checks:**
- [ ] Log in with the demo officer, then demo admin; check that the nav changes by role.
- [ ] Check the inbox on a phone (cards layout).

---

## P2 — Officer case cockpit + supervisor queues (H7–H13)
```
Resume context: Laptop C, feat/gov-portals. Read Spec C §5.2–§5.4.
Phase 2, commit after each:
1. /officer/case/:id three-column cockpit: TranslationSplit (original script with correct font, RTL for Urdu, English side), AI Brief card (indigo AI styling, next-step checklist, missing info, similar resolved cases), EvidenceViewer with lightbox + BeforeAfterSlider, timeline with internal notes and per-case "Verify chain" animation, message thread.
2. Actions panel: status control with delay_reason, AI reply composer (intent chips → draft → editable EN → preview of citizen-language version with Listen → send), internal notes, reassign with workload-aware officer picker + reason + "this trains the model" note, resolve flow (proof photo + device GPS + note → inline AI verification result; suspicious banner), routing card with the 3 votes, priority card (+ emergency confirm for supervisors), SLA card. Keyboard shortcuts r/n/s/v/Esc.
3. /supervisor queues: routing review, emergency confirmations (with countdown), disputed closures (before/after + AI verdict), appeals (uphold/dismiss). Tab badges, celebratory empty states.
4. /officer/stats personal stats with streak.
Make the mock handlers in gov-shared/mocks realistic for these flows (Telugu/Urdu originals). Playwright: officer opens case → drafts reply → sends; resolve → verification badge; supervisor routing decision.
Push; update docs/progress/C.md.
```

---

## P3 — Connect to B's live API, admin command center, map, departments, analytics (H13–H19)
**Human, before pasting:** get Laptop B's API URL from the team chat.
```
Resume context: Laptop C, feat/gov-portals.
Step 1 (connect, NO merge): do not merge or pull any other branch. B's API URL is: <PASTE URL>.
Read-only check of B's notes: git fetch origin && git show origin/feat/ai-engine:docs/progress/B.md (and docs/contract-notes/B.md if it exists) to see which endpoints are live and any added fields.
In apps/web/.env.local set VITE_API_MODE=hybrid and VITE_API_BASE_URL=<that URL>/api/v1. Test inbox + case flows against the real API; fix mismatches on our side (extra types in portals/gov-shared/types-ext.ts), and log API-side ones in docs/contract-notes/C.md for B's human. Commit + push.
Step 2 — Phase 3 (Spec C §6.1–§6.5, §8):
1. /admin Command Center: 8 KPI cards with count-ups + deltas, large live map with layer toggles + critical pulses, alerts rail, AI insights card (numbers-verified badge, regenerate), department leaderboard top 5, date range selector, live refresh.
2. /admin/map full-screen with filter panel, hotspot presets, ward click side panel, cluster → case list, 30-day time-slider replay of the heatmap.
3. /admin/departments leaderboard with score formula tooltip + per-department drawer + SLA/resolution/satisfaction/overdue charts.
4. /admin/officers workload table + stacked bars + overload highlight.
5. /admin/analytics trends with spike annotations, breakdowns by ward/zone/category, delay-risk list and ETA by category.
Commit after each; push; update docs/progress/C.md.
```

---

## P4 — Alerts, audit chain, AI model page, demo controls, exports (H19–H25)
```
Resume context: Laptop C, feat/gov-portals. Read Spec C §6.6–§6.10.
Phase 4, commit after each:
1. /admin/alerts with severity filters, spike alert mini-chart (baseline vs 24h), languages seen, example complaints, acknowledge.
2. /admin/audit event explorer + AuditChain visualization (blocks linked by short hashes, sequential green check animation, red break), sample verification, "how this works" popover.
3. /admin/ai model page: version, accuracy + macro-F1 on synthetic AND human test sets, per-language bars, confusion matrix heatmap, live ops metrics, version history chart, retrain button with progress and animated metric change.
4. /admin/demo controls: virtual clock +6h/+24h/+48h with toast of fired escalations, reset with confirm, provider health, mode badge + fallback counter (VITE_DEMO_MODE only).
5. Exports: CSV, Excel (SheetJS installed per its docs from cdn.sheetjs.com), PDF (jspdf-autotable for English tables; html-to-image raster for anything with Indic text); light report builder on /admin/reports.
Test in hybrid mode. Playwright: retrain adds a version; time travel changes alert count.
Push; update docs/progress/C.md.
```

---

## P5 — Public transparency portal, realtime, i18n, then the integration merge (H25–H30)
```
Resume context: Laptop C, feat/gov-portals. Read Spec C §7, §9.
Phase 5:
1. /public portal (Paper theme default, no login): hero count-ups, anonymized heatmap with an explanation, department report cards with sparklines, zone comparison, recently fixed before/after cards, methodology & privacy section in en/te/hi/ur.
2. Realtime everywhere in gov portals via useLiveEvents (inbox, case, command center, alerts) with subtle highlight animations.
3. gov.json completeness (en/te/hi, Urdu where possible); citizen text always in original script with correct font.
4. Accessibility pass: keyboard-only flows, focus, labels, contrast in Ink/Paper/high-contrast, tables readable by screen readers.
Then prepare for the integration merge (do NOT merge anything yourself): run build, lint and Playwright on feat/gov-portals, push, and open PR feat/gov-portals → main titled "Integration: gov portals". The integrator merges B, then A, then C, on a call with all three humans. Update docs/progress/C.md.
```

---

## P6 — Integration QA, tests, performance (H30–H36)
```
Resume context: Laptop C, feat/gov-portals. The H30 integration merge is done: run git merge origin/main into feat/gov-portals once now (the only time until H42). From now on you have A's latest shared code.
Phase 6:
1. Run the officer, supervisor and admin parts of the master §16 demo against the deployed API; list every bug, then fix them.
2. Complete the Spec C §10 Playwright suite on chromium, msedge, mobile-chrome; fix flakiness.
3. Performance: virtualize big tables, memoize charts, lazy-load map plugins and admin pages, avoid re-mounting charts on live updates.
4. Edge and mobile issues; all loading/empty/error states.
Push to feat/gov-portals (no PR yet; next merge is at H42). Update docs/progress/C.md with known issues.
```

## P7 — Wow polish + stretch (H36–H42)
```
Resume context: Laptop C, feat/gov-portals (no merging until H42).
Phase 7:
1. Polish: KPI pulses on change, alert entrance animations, map pulse timing, audit chain animation timing, chart entrance choreography, command palette polish, empty-state illustrations (simple SVG, no copyrighted characters).
2. Demo rehearsal of master §16 steps 4–7: make sure the suspicious streetlight case, Charminar spike, time travel and retrain moments are smooth and fast; add demo shortcuts behind VITE_DEMO_MODE (e.g., "open demo case" buttons).
3. Stretch from Spec C §11 in order (Surge Mode UI and Root-cause graph first, coordinating with Laptop B's endpoints).
At H42 open PR feat/gov-portals → main titled "Final: gov portals". Update docs/progress/C.md.
```

## P8 — Final QA and demo prep (H42–H46)
```
Resume context: Laptop C, on main after the final merge.
Phase 8: full click-through of every gov route on the deployed site in Chrome and Edge, desktop and phone; fix blockers only. Then write docs/demo-script.md: exact clicks, accounts, URLs and fallback plan for master §16, with timings. Also draft slide content (problem, solution, 4 portals, AI pipeline, own model + metrics, trust layer, impact, tech stack all free, team) as docs/slides-outline.md.
```
