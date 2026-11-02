# Progress — Laptop A (foundation, landing, citizen portal)

## Current phase
**P0 — Hour-0 scaffold: DONE** (on `main`, tagged `v0-scaffold`). Next: **P1** on `feat/citizen`.

## Done (P0)
- **Tooling:** npm workspaces (`apps/web`, `packages/contracts`), Vite 8 + React 19 + TS strict, Tailwind v4, shadcn/ui (26 components in `src/design/ui`), ESLint + Prettier, every master §4 frontend dependency (incl. SheetJS from cdn.sheetjs.com and `react-router@7`, pinned below npm's v8).
- **Contracts:** `types.ts` (§8 verbatim) and `endpoints.md` (§9 verbatim).
- **Mocks:** a deterministic seeded dataset of ~80 grievances in te/hi/ur/en + Tenglish/Hinglish, the five demo narratives, hash-chained timelines, incidents, alerts, notifications, AI metrics, plus a handler for all 57 endpoints with in-memory state. Submit → track works. `npm run test:mocks` exercises every handler.
- **Design:** tokens (Ink/Paper/high-contrast/large-font/reduced-motion), per-script font stacks, motion presets, all master §11 shared components (+ `Logo`).
- **Lib:**
  - API client (mock | hybrid | live + fallback badge) and 57 typed endpoints + `qk`.
  - Auth (Supabase + mock, `demoLogin`, `RequireRole`, demo role switcher).
  - i18n (en/te/hi/ur, RTL) and `useLangFormat`.
  - Prefs store, `useLiveEvents`, `useSpeak`, `detectScript`, `pickLocalized`.
- **App:** providers, central router lazy-loading each portal's `routes.tsx`, ErrorBoundary, 404, `AnimatedOutlet`, `SmoothScroll` (landing).
- **Pages (P0 level):**
  - landing (cycling greeting, live stats, portal cards);
  - login (citizen / gov tabs + 7 demo accounts), onboarding (language);
  - citizen home, my complaints, complaint tracker (basic), guest `/track`, notifications, settings, nearby, QR entry;
  - placeholders for report / quick report / guide / print.
- **C stubs:** `officer` (+ `SupervisorRoutes`), `admin`, `public` and `gov-shared` routes + placeholder pages, `GovLayout`, `types-ext.ts`, `mocks/` hook example.
- **Quality:**
  - `npm run build`, `npm run lint` (0 errors / 0 warnings) and `npm run test:mocks` pass.
  - Playwright smoke: 21/21 pass on chromium, msedge and mobile-chrome (two consecutive full runs). It covers every top-level route in mock mode, guards, 404 and Urdu RTL. E2E runs against `vite preview` with 2 workers; more workers overloaded the single preview server on this machine.

## In progress
- Nothing.

## Next (P1, H1.5–H7, on `feat/citizen`)
- Landing: 3D City Pulse hero, scroll story, languages showcase, trust section (Spec A §5.1).
- Citizen shell polish, login + onboarding (consent, accessibility), home (simple mode), settings (Spec A §5.2, §5.3, §5.16).

## Blockers
- None. Supabase keys are not needed in mock mode.

## Contract notes
See `docs/contract-notes/A.md`. Requested from B: `GET /me`, `app_metadata.role` on demo users, ward/asset id formats.

## Handy for demos (mock mode)
- Demo ticket for guest tracking: `GRV-2026-000101`, PIN `647556` (live wire near a school, Lakshmi).
- Suspicious-closure streetlight (Ameerpet): `GRV-2026-000119`, PIN `936329`.

## Known issues / follow-ups
- The demo role switcher floats over page content at the bottom-start corner; make it more compact in P1.
- The error state offers "Try again" on 403s from the tracker; refine in P4.
