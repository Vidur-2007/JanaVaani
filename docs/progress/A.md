# Progress — Laptop A (foundation, landing, citizen portal)

## Current phase
**P2 — Report assistant: DONE** (on `feat/citizen`, mock mode). Next: **P3**: switch to hybrid mode on B's URL, voice mode (Voice Orb), low-literacy mode.

## Done (P2)
- **Mock realism** (`packages/contracts/mocks`, additive):
  - Places named in text (Latin or te/hi/ur script) become a suggested location, so a text-only "Miyapur X roads lo pedda gunta undi" hits the pothole incident in the duplicate check.
  - Localized quick replies for follow-up questions.
  - Multi-issue split (`drafts[]` + `split_confirm`).
  - Small uploads → `quality.ok=false`.
- **Chat (`/app/report`):**
  - Message log with `aria-live`, typing indicator, and word-by-word reveal (off under reduced motion).
  - AI badge + Listen on every bot message, with autoplay in voice-first/easy mode; "Show in English" toggle.
  - Language chip (detected / Tenglish / Hinglish), progress dots, quick replies (big ✓/✗ in easy mode).
  - Composer: Enter sends, Shift+Enter adds a newline; browser-dictation mic.
  - QR `?asset=` is passed through.
- **Photo:** compressed (≤ 1600 px / ~200 KB) → `/uploads` → thumbnail + quality badge + retake prompt.
- **Location sheet:** GPS with accuracy circle, map pin with ward overlay and live ward name, typed landmark, and an AI "Did you mean …?" suggestion.
- **ConfirmationCard** per §5.4: formal / English / original text, routing preview with officer + confidence + explanation, priority factors, SLA, mini-map, photos, fields, anonymous/private toggles, edit/cancel.
- **Split UI** for several problems in one message.
- **DuplicateSheet:** add my support / file new, then a celebration.
- **EmergencyTakeover:** `tel:` buttons are rendered first and focused, then the pulse; "Continue registering".
- **Submitted screen:** animated ticket ID, guest PIN with copy + warning, SLA due date.
- **Receipt / report** (`/print/receipt/:id`, `/print/report/:id`): A4 HTML with QR code. The PDF is made with html-to-image + jsPDF `addImage` (no jsPDF text, so Indic shaping is preserved); Print uses `window.print`.
- **Quick report** (`/app/report/quick`): photo → auto GPS (with ward) → optional line → analyze → ConfirmationCard → duplicate check → submit (3 taps).
- **Drafts + outbox** (IndexedDB):
  - Resume prompt within 24 h; the session is rebuilt from the citizen's own words.
  - Confirming while offline queues the complaint; it is flushed on reconnect with a toast showing the ticket and PIN.
- **Shared fix:** keyless CARTO tiles are now watermarked "API KEY REQUIRED", so `MapView` uses OpenStreetMap tiles (Ink theme = CSS-darkened). `VITE_TILE_URL` overrides. Logged for C in `docs/contract-notes/A.md`.
- **i18n:** every P2 string is in en/te/hi/ur, with key and placeholder parity checked.
- **Quality:**
  - Build, lint (0/0) and `test:mocks` pass; the mock check now also covers the Miyapur duplicate and split paths.
  - **Playwright 72/72** on chromium/msedge/mobile-chrome. New `e2e/citizen/report.spec.ts` covers: guest Telugu → ticket + PIN, emergency → call buttons first, Miyapur → duplicate → support, split, GPS ward, quick photo report, offline outbox → flush, resume prompt, receipt QR.

## Human checks for P2 (to do)
- [ ] On a phone: report by text in Telugu, attach a real camera photo, use "My location", confirm, download the receipt PDF (check that Telugu renders correctly in the PDF).
- [ ] Emergency phrase (e.g. "current wire fell near school"): call buttons appear instantly and dial on a phone.
- [ ] Airplane mode at confirm → "will send when back online" → turn it off → toast with ticket.

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

## Human checks for P1 (still to do)
- [ ] Landing on a real phone: `npm run dev -- --host`, same Wi-Fi.
- [ ] Lighthouse mobile on `/` (target ≥ 85 performance). Run it against `npm run build && npm run preview`, not the dev server.
- [ ] OS "reduce motion" on → the static hero shows (no 3D), and the scroll story is stacked, not pinned.

## Next (P3, H13–H19)
- Read B's progress (`git show origin/feat/ai-engine:docs/progress/B.md`), set `VITE_API_BASE_URL` + `VITE_API_MODE=hybrid`, and verify chat/analyze/uploads against the live API.
- Voice mode (Spec A §5.5): Voice Orb, Web Speech + MediaRecorder fallback, voice confirm words; low-literacy mode polish.

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
