# JanaVaani — voice of the people

> A voice-first, multilingual grievance platform. A citizen speaks a complaint in Telugu, Hindi, Urdu, English or code-mixed Tenglish/Hinglish, and AI turns it into a structured, correctly routed, prioritized case. The case is tracked transparently until the citizen confirms it is fixed.

Neural Storm (JNTUH) · Problem statement HI-02 · Multilingual Citizen Grievance Chatbot.

## Surfaces
| Surface | Path | Users |
|---|---|---|
| Landing | `/` | Everyone |
| Citizen portal | `/app`, `/track`, `/r/:assetId`, `/guide` | Citizens, guests |
| Department portal | `/officer`, `/supervisor` | Officers, supervisors |
| Government admin | `/admin` | Admins |
| Public transparency | `/public` | Everyone |
| AI engine (API) | `services/api` | — |

## Quick start (frontend, mock mode)
```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # VITE_API_MODE=mock works with no backend
npm run dev                                     # http://localhost:5173
```
In mock mode every endpoint is served from a deterministic in-browser dataset (`packages/contracts/mocks`). Use the **Demo accounts** panel on `/login`, or the floating role switcher, to sign in as any of the seven demo personas.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build (`apps/web/dist`) |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright on Chromium, Edge and Pixel 7 (builds and serves the app itself) |
| `npm run test:mocks` | Exercises every mock endpoint and the submit → track flow |

### API modes (`VITE_API_MODE`)
- `mock`: everything from the mock layer (300–900 ms simulated latency).
- `hybrid`: calls the live API at `VITE_API_BASE_URL`, falls back to mocks on network error / 404 / 501. A badge shows the fallback count.
- `live`: API only.

## Repository layout
```
apps/web/            React 19 + Vite + Tailwind v4 frontend (all portals)
packages/contracts/  Shared API contract (types.ts, endpoints.md) and mock layer
services/api/        FastAPI backend (Laptop B)
ml/ data/ supabase/  Model training, seed data, migrations (Laptop B)
e2e/                 Playwright tests
docs/specs/          Build specs (start with 00-MASTER-SPEC.md)
```

## Tech
React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui · Motion · three.js · TanStack Query · i18next · Leaflet · Supabase · FastAPI · Gemini · Groq · sentence-transformers. Free tiers only.

## Demo accounts
All use password `Demo@2026` (see master spec §14). The `.test` domain never sends real email.

## Team sections
<!-- Laptop B: backend setup, deployment and API URL -->
<!-- Laptop C: gov portals notes -->

---
Demo data only. Ward boundaries are approximate. Basemaps © OpenStreetMap contributors © CARTO.
