# JanaVaani — Claude Code instructions

Multilingual citizen grievance platform (Neural Storm · JNTUH · HI-02). 48-hour, 3-laptop build.

## Read first, every session
1. `docs/specs/00-MASTER-SPEC.md` (contract §8, endpoints §9, design §11)
2. Your part spec: A → `01-SPEC-A-CITIZEN.md` · B → `02-SPEC-B-AI-ENGINE.md` · C → `03-SPEC-C-GOV-PORTALS.md`
3. Your progress file: `docs/progress/<A|B|C>.md`

## Golden rules
- **Stay in your folders** (table below). Shared folders are additive-only after `v0-scaffold`.
- **Contract is law.** `packages/contracts/src/types.ts` = master §8. Changes are additive and logged in `docs/contract-notes/<X>.md`. Extra types go in `portals/<yours>/types-ext.ts` until H30.
- **Never rename or remove** an export, prop, route or type in `src/app`, `src/lib`, `src/design`, `packages/contracts` that existed at `v0-scaffold`.
- **No merges and no pulls of other branches before H30.** Push only to your branch. Read others with `git show origin/<branch>:<file>`.
- snake_case in API payloads and contract types. No camelCase mapping layers.
- Every screen: loading skeleton, empty, error (with retry), success.
- **No hardcoded UI strings**: i18next namespaces `common`, `landing`, `citizen` (A) and `gov` (C).
- Accessibility: keyboard reachable, visible focus, labels, reduced motion, 44px targets (`touch-target`), logical Tailwind utilities only (`ms-`/`pe-`/`start-`), `rtl-flip` on directional icons.
- AI is advisory; indigo (`text-ai`/`bg-ai`/`AIBadge`) only for AI-generated content.
- Free tiers only. Synthetic data only.
- Commit after every task (`feat(citizen): …`), push at least every 45 min, end each phase by updating `docs/progress/<X>.md`.

## Ownership
| Path | Owner |
|---|---|
| `apps/web/src/{app,design,lib}`, `packages/contracts`, `portals/{landing,citizen}`, `locales/*/{common,landing,citizen}.json`, `e2e/citizen`, root configs, `CLAUDE.md`, `README.md` | **A** (`feat/citizen`) |
| `services/`, `ml/`, `data/`, `supabase/`, `scripts/` | **B** (`feat/ai-engine`) |
| `portals/{officer,admin,public,gov-shared}`, `locales/*/gov.json`, `e2e/gov` | **C** (`feat/gov-portals`) |

## How the frontend is wired
- Imports: `@/` → `apps/web/src`, `@contracts/` → `packages/contracts/src`, `@mocks/` → `packages/contracts/mocks`.
- Data: `api.<endpoint>()` + `qk.<key>` from `@/lib/api/endpoints`, used with TanStack Query. Never call `fetch` directly.
- Modes: `VITE_API_MODE=mock|hybrid|live`. Hybrid calls B's API and falls back to mocks on network error/404/501.
- Extra mock handlers: `registerMockHandler(method, pattern, fn)` from `@mocks/index` (C: put them in `gov-shared/mocks/`).
- Auth: `useAuth()` → `{ profile, status, demoLogin, signOut, … }`; guard routes with `<RequireRole roles={[…]} />`.
- Live updates: `useLiveEvent(cb)` for toasts; invalidation is automatic. Events are signals only.
- UI: shadcn primitives in `@/design/ui/*`, shared components from `@/design/components`, motion presets from `@/design/motion`.
- Theme per surface: `useSurfaceTheme('ink' | 'paper')` in layouts. Wrap pages in `<PageTransition>`.
- Each portal's `routes.tsx` renders its own `<Routes>` with paths relative to its mount point.

## Commands (repo root)
`npm run dev` · `npm run build` · `npm run lint` · `npm run test:e2e` (Playwright: chromium, msedge, mobile-chrome) · `npm run test:mocks`
