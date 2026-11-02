# Progress — Laptop A (foundation, landing, citizen portal)

## Current phase
**P1 — Landing, citizen shell, login, onboarding, settings: DONE** (on `feat/citizen`). Human checks pending (below). Next: **P2** report assistant.

## Done (P1)
- **Landing (Spec A §5.1), all 7 sections:**
  - **City Pulse hero:** R3F point cloud of Hyderabad, with ward-sampled "fabric" points plus `/public/map` complaints colored by department. Ring pulses every 2–4 s, ~25% are green "resolved" flashes. Tilted plane, slow drift, mouse parallax (pointer devices only).
  - **Hero performance:** three.js is its own lazy chunk (~244 KB gz), loaded only after `load` + idle so it never competes with LCP. DPR ≤ 1.5; 8k points on desktop, 2k on mobile; rendering paused off-screen. The static gradient poster is the LCP and the fallback for reduced motion / no WebGL.
  - The multilingual headline crossfades so there's never an empty frame.
  - **How it works:** 4 pinned steps (Speak → AI understands → Officer acts → You verify) with live vignettes; stacked on mobile and under reduced motion.
  - **Live stats** from `/public/stats` with count-ups and department bars.
  - **Languages showcase:** the same pothole in te/hi/ur/en/Tenglish converging into one structured card.
  - **Trust:** 4 micro-animations.
  - **Portals:** cards with 3D tilt + glow.
  - **Footer:** stack strip and disclaimer.
  - **Mobile sticky CTA:** appears once the hero CTA scrolls away. Lenis smooth scroll on the landing only.
- **Login (§5.2):**
  - Brand panel plus citizen (magic link, guest) / government (email + password) tabs.
  - Demo accounts grouped into citizens and government.
  - Role-based redirect that honours `?next=`.
- **Onboarding (§5.2):** language tiles (+ more languages) → consent (what we store, how AI is used, what humans decide, optional location/mic) → accessibility (large text, high contrast, simple mode, voice-first). First-run citizens are redirected through it.
- **Citizen shell:**
  - User menu, a prominent Report button on the desktop rail, and Nearby / Track / Guide links (hidden in simple mode).
  - Mobile bottom nav with a raised Report button and an unread count.
  - Live-notification toasts.
- **Home (§5.3):**
  - Greeting with the user's name; 4 tiles (voice tile widens in voice-first mode).
  - Active-complaints carousel with SLA countdowns.
  - "Is it fixed?" verification callout and an unread banner.
  - Nearby teaser with "Me too".
  - Simple mode keeps only the tiles + active list.
- **Settings (§5.16):**
  - Screen + reply language.
  - Display: theme auto/light/dark, large text, high contrast, motion phone/reduce/full, simple mode.
  - Easy mode (low literacy).
  - Voice: voice-first, autoplay, speech speed + test, per-language voice availability.
  - Privacy: anonymous default, live location/mic permission status.
  - AI transparency; rerun setup; reset. Everything persists via prefs and applies globally.
- **i18n:** `common`, `landing` and `citizen` are complete in en/te/hi/ur (key parity and `{{placeholder}}` parity checked).
- **Prefs (additive):** `reply_lang`, `voice_first`, `anonymous_default`, `consent_privacy`.
- **Quality:**
  - Build, lint (0/0) and `test:mocks` pass.
  - **Playwright 45/45 on chromium, msedge and mobile-chrome:** smoke, login demo buttons + role redirects, onboarding, guest flow, deep-link return, settings persistence, simple mode.
  - The overflow check now compares against the real viewport width. It caught and fixed two mobile overflows: the languages grid, and the header link at 412 px.

## Done (P0)
Scaffold on `main`, tag `v0-scaffold`: workspaces + all deps, contracts (§8/§9 verbatim), a deterministic mock layer for all 57 endpoints, design system, lib (api/auth/i18n/prefs/live/tts), app shell, portal stubs for C, CLAUDE.md, README and Playwright. P0 human checks passed on 2026-11-02.

## In progress
- Nothing.

## Human checks for P1 (to do)
- [ ] Landing on a real phone: `npm run dev -- --host`, same Wi-Fi.
- [ ] Lighthouse mobile on `/` (target ≥ 85 performance). Run it against `npm run build && npm run preview`, not the dev server.
- [ ] OS "reduce motion" on → the static hero shows (no 3D), and the scroll story is stacked, not pinned.

## Next (P2, H7–H13)
- Report assistant: text, photo, location, confirm, duplicates, emergency, submit (Spec A §5.4, §5.6, §5.7, §5.9).

## Blockers
- None. Supabase keys are not needed in mock mode.

## Notes for the team
- **Breakpoints follow master §11:** `sm` = 390 px, `md` = 768, `lg` = 1024 (not Tailwind's default 640 for `sm`). Use `md:` for "desktop".
- Branch state: C must run `git merge v0-scaffold` once. `feat/ai-engine` is untouched.

## Contract notes
See `docs/contract-notes/A.md`. Requested from B: `GET /me`, `app_metadata.role` on demo users, ward/asset id formats.

## Handy for demos (mock mode)
- Demo ticket for guest tracking: `GRV-2026-000101`, PIN `647556` (live wire near a school, Lakshmi).
- Suspicious-closure streetlight (Ameerpet): `GRV-2026-000119`, PIN `936329`.

## Known issues / follow-ups
- The error state offers "Try again" on 403s from the tracker; refine in P4.
- On the landing page at 360 px, the icon-only demo role switcher sits near the hero's "Track" button (demo mode only).
- The City Pulse chunk is large (~244 KB gz) because R3F pulls in all of three.js. It is lazy and idle-loaded, but trim it in P6 if Lighthouse complains.
