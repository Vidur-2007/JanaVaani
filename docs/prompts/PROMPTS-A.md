# Prompts — Laptop A (Foundation + Landing + Citizen Portal)

**Branch:** P0 on `main`, then `feat/citizen` · **Specs:** `docs/specs/00-MASTER-SPEC.md` + `docs/specs/01-SPEC-A-CITIZEN.md`

## How to use
1. Open Claude Code in the repo root.
2. Paste **one phase prompt** at a time. Let it finish completely.
3. Do the **Human checks** for that phase yourself (phone, Edge, voice), then paste the next prompt.
4. If you hit the usage limit or start a new session, paste the **Resume prompt** first.
5. **No merges until H30.** You push only to `feat/citizen`. You reach Laptop B's backend through its deployed URL, not through git.
6. You are also the **integrator**: you merge the three PRs into `main` at the H30 integration merge and the H42 final merge.

## Resume prompt (use at the start of every new session)
```
You are Laptop A on the JanaVaani hackathon project (branch feat/citizen; P0 was on main).
Read docs/specs/00-MASTER-SPEC.md, docs/specs/01-SPEC-A-CITIZEN.md, CLAUDE.md and docs/progress/A.md.
Summarize in 5 bullets where we are and what remains in the current phase, then continue the unfinished work.
Rules: only edit files Laptop A owns (master §5); never rename or remove shared exports that existed at v0-scaffold; never merge or pull another branch before the H30 integration merge; commit after each completed task and push to feat/citizen.
```

---

## P0 — Hour-0 scaffold on `main` (H0–H1.5)
```
You are Laptop A on JanaVaani, a 48-hour hackathon project (Neural Storm, JNTUH, problem HI-02 multilingual citizen grievance platform).
Read docs/specs/00-MASTER-SPEC.md fully, then docs/specs/01-SPEC-A-CITIZEN.md §1–§3.

Task: execute "Phase 0 — Hour-0 scaffold" exactly as specified in Spec A §3, working directly on the main branch.
- Install EVERY frontend dependency listed in master §4 now (others must rarely touch package.json later).
- Copy master §8 verbatim into packages/contracts/src/types.ts and master §9 into packages/contracts/src/endpoints.md.
- Build the deterministic mock dataset and a handler for every one of the 57 endpoints, with in-memory state so submit → track works.
- Build src/lib (api client with mock|hybrid|live + fallback badge, typed endpoints + query keys, auth with Supabase + mock role switcher + demo login, live events hook, i18n with en/te/hi/ur + RTL, prefs store, useSpeak TTS hook, detectScript).
- Build src/design (tokens.css for Ink/Paper/high-contrast/large-font, fonts per script, motion presets, and all shared components from master §11 in polished basic form).
- Build src/app (providers, routes.tsx lazily importing each portal's routes.tsx, brand.ts, ErrorBoundary, 404, PageTransition).
- Create placeholder routes.tsx + pages for officer/admin/public/gov-shared so Laptop C can start immediately.
- Create CLAUDE.md (≤60 lines: golden rules + spec pointers + ownership table), README skeleton, docs/progress/{A,B,C}.md, docs/contract-notes/{A,B,C}.md, .env.example, vercel.json (SPA rewrite), playwright.config.ts (chromium, msedge, mobile-chrome) with a smoke test, ESLint + Prettier.

Work in this order and commit after each step: (1) tooling + deps, (2) contracts + mocks, (3) design tokens + components, (4) lib, (5) app shell + routes + stubs, (6) docs files + tests.
Before finishing: npm run build, npm run lint and the Playwright smoke test must pass; every route must render in mock mode.
Then: git push origin main, create and push tag v0-scaffold, create branch feat/citizen and push it.
Update docs/progress/A.md. Finally print a short message I can send to Laptop C saying the scaffold is ready.
```
**Human checks:**
- [ ] Open `localhost:5173` in Chrome and Edge. Toggle Ink/Paper and Urdu (layout flips RTL).
- [ ] Tell Laptop C: "scaffold is on main, tag v0-scaffold".

---

## P1 — Landing, citizen shell, login, onboarding, settings (H1.5–H7)
```
Resume context: Laptop A, branch feat/citizen. Read master spec and Spec A (focus §5.1, §5.2, §5.3, §5.16, §6).
Load the frontend-design guidance if available to you.

Build Phase 1:
1. Landing page (Spec A §5.1) with all 7 sections. The City Pulse hero is the signature: R3F instanced points, department colors, ring pulses, resolved flashes, mouse parallax, lazy-loaded after first paint, mobile ≤2k points, static fallback for no-WebGL/reduced motion. Multilingual cycling headline. Scroll story with pinned steps. Live stats from GET /public/stats. Languages showcase. Portal cards with 3D tilt. Lenis smooth scroll on landing only.
2. Login + onboarding (Spec A §5.2) including the demo accounts panel and role-based redirect.
3. Citizen app shell: bottom nav on mobile, side rail on desktop, page transitions, notifications badge.
4. Citizen home (§5.3) with simple mode behaviour.
5. Settings (§5.16): all display/accessibility/voice/privacy/AI-transparency settings wired to the prefs store and applied globally.
6. landing.json + citizen.json + common.json translations for en/te/hi/ur.

Quality bar: Awwwards-level polish but fast. Respect reduced motion. 360px width with no horizontal scroll. Every screen has loading/empty/error states.
Commit after each numbered item; push. Run build + lint + add Playwright tests for landing load and login demo buttons.
Update docs/progress/A.md.
```
**Human checks:**
- [ ] Landing on a real phone (use the Vite `--host` URL on the same Wi-Fi).
- [ ] Lighthouse mobile on `/` (target ≥ 85 performance).
- [ ] Reduced motion in OS settings shows the static hero.

---

## P2 — Report assistant: text, photo, location, confirm, duplicates, emergency, submit (H7–H13)
```
Resume context: Laptop A, feat/citizen. Read master §7–§10 and Spec A §5.4, §5.6, §5.7, §5.9.

Build Phase 2, the hero feature, entirely driven by POST /chat/turn (mock mode for now):
1. /app/report chat UI: message list with aria-live, typing indicator, word-by-word reveal, language/code-mixed chip, quick replies, progress dots, ListenButton on bot messages.
2. Photo attach: compression, upload via /uploads, thumbnail + quality badge + retake prompt.
3. Location sheet: GPS with accuracy, map pin with ward overlay from /meta/wards.geojson and live ward name, typed landmark, AI location suggestion chip.
4. ConfirmationCard exactly as Spec A §5.4 (formal text in citizen language, English toggle, original words toggle, routing preview with officer + confidence + explanation, priority factors, SLA, anonymous/private toggles).
5. Multiple-issues split UI (drafts[]).
6. DuplicateSheet with support existing / file new, celebration micro-animation.
7. EmergencyTakeover: call buttons render first (tel: links), then the animation; continue registering.
8. Submitted screen with ticket ID, guest PIN, SLA due date; receipt via /print/receipt/:id using html-to-image + jsPDF (NOT jsPDF text — Indic shaping breaks) and window.print.
9. Quick photo-first report /app/report/quick (3 taps) using /grievances/analyze + /grievances.
10. Drafts + offline outbox in IndexedDB with resume prompt and auto-flush on reconnect.

Make the mock handlers for /chat/turn realistic: detect script, return Telugu/Hindi/Urdu replies, ask 1–2 follow-ups, return emergency when an emergency phrase is typed, return duplicates for "Miyapur" pothole text.
Commit per item; push. Playwright: guest Telugu report → ticket; emergency phrase → call buttons; duplicate → support.
Update docs/progress/A.md.
```
**Human checks:**
- [ ] Type in Telugu, Hindi, Urdu and Tenglish; verify the fonts render properly.
- [ ] Download the receipt PDF and confirm the Telugu text is NOT broken.
- [ ] Turn Wi-Fi off, submit, turn it back on, and confirm the outbox flushes.

---

## P3 — Connect to B's live API, then voice mode and low-literacy mode (H13–H19)
**Human, before pasting:** get Laptop B's API URL from the team chat.
```
Resume context: Laptop A, feat/citizen.
Step 1 (connect, NO merge): do not merge or pull any other branch. B's API URL is: <PASTE URL>.
Read-only check of B's notes: git fetch origin && git show origin/feat/ai-engine:docs/progress/B.md (and docs/contract-notes/B.md if it exists) to see which endpoints are live and any added fields.
In apps/web/.env.local set VITE_API_MODE=hybrid and VITE_API_BASE_URL=<that URL>/api/v1. Test the report flow end to end against the real API; fix contract mismatches on OUR side (extra types go in portals/citizen/types-ext.ts), and log any API-side mismatch in docs/contract-notes/A.md for B's human. Commit + push.

Step 2: Build Phase 3 — Voice mode (Spec A §5.5):
- Full-screen Voice Orb (R3F noise-displaced sphere driven by AnalyserNode volume; CSS fallback).
- Language chip with Auto-detect. Known language → Web Speech API with the correct lang code and live captions; Auto-detect or failure → MediaRecorder → POST /speech/transcribe.
- Silence detection (1.5 s), send to /chat/turn with input_mode 'voice', speak the reply via useSpeak in the detected language, then listen again (voice-to-voice loop).
- Voice confirmation words list from Spec A §5.5 for confirm/edit at the confirming stage.
- Graceful "voice not available for this language on this device" handling and mic permission pre-prompt.
Step 3: Low-literacy mode (Spec A §5.16): one question at a time, icon-first category tiles, auto TTS, voice default, big ✓/✗ buttons.
Commit per item; push; update docs/progress/A.md.
```
**Human checks:**
- [ ] Speak Telugu, Hindi and Urdu in **Chrome** and **Edge**. Note which work via Web Speech and which need the Whisper fallback.
- [ ] Test on an Android phone in Chrome.
- [ ] Confirm by voice: "avunu", "haan".

---

## P4 — Tracking, verification, reopen, appeals, messages, notifications (H19–H25)
```
Resume context: Laptop A, feat/citizen. Read Spec A §5.8, §5.10–§5.12.
Build Phase 4:
1. /app/complaints list with filter chips and cross-language search (/search?scope=mine), translated titles with on-demand /translate.
2. /app/complaints/:id tracker: header with Listen button, 7-step visual timeline with animated progression, full activity history incl. transfer reasons, SLA panel with live countdown + ETA + delay reason + escalation, office card, evidence + BeforeAfterSlider, AI verification badge, officer message thread with reply, closure label (citizen-verified vs auto-closed).
3. "Is it fixed?" flow: yes → stars + comment; no → reason chips/text/voice + photo → reopen. Appeal filing + separate appeal status.
4. "I'm affected too" support for non-owners.
5. Receipt + full status report PDF via the print routes.
6. /track guest tracking with ID + PIN.
7. /app/notifications with realtime toasts via useLiveEvents, deep links, mark all read, community updates.
8. Chat tracking: in /app/report, render stage 'answered' with tracked[] mini tracker cards ("What happened to my water complaint?").
Test in hybrid mode against the live API. Commit per item; push. Playwright: tracker → reject closure → reopen.
Update docs/progress/A.md.
```
**Human checks:**
- [ ] With Laptop C's human, run an officer reply and confirm the citizen sees it in Telugu with Listen working.
- [ ] Verify the realtime toast arrives within a few seconds.

---

## P5 — QR, nearby, guide, PWA, accessibility, i18n, then the integration merge (H25–H30)
```
Resume context: Laptop A, feat/citizen. Read Spec A §5.13–§5.17, §6.
Build Phase 5:
1. /r/:assetId QR entry with asset card, prefilled report, "already reported → support".
2. /app/nearby map + list with radius slider and support.
3. /guide public-service guide chat with sources and "Report this" CTA.
4. PWA via vite-plugin-pwa (manifest, icons, offline shell, caching strategy) + install button.
5. Accessibility pass on every citizen page: keyboard-only flows, focus order, aria labels, screen-reader names for icon buttons, contrast in both themes and high-contrast mode, large-font layout, 44px targets, friendly error messages.
6. i18n completeness: no hardcoded strings; Urdu RTL check on every page (logical utilities, mirrored icons); dates/numbers via Intl.
Then prepare for the integration merge (do NOT merge anything yourself): run build, lint and Playwright on feat/citizen, push, and open a PR feat/citizen → main titled "Integration: citizen portal". Update docs/progress/A.md.
```
**Integrator (human A) at H30, on a call with B and C:**
- [ ] Merge the PRs into `main` in this order: **B, then A, then C**. Fix conflicts together (`package-lock.json`: take `main`'s version, run `npm install`; shared files: A's version wins).
- [ ] Move any `types-ext.ts` additions from A and C into `packages/contracts`.
- [ ] Build, lint, Playwright on `main`. Deploy `apps/web` to Vercel with production env (`VITE_API_MODE=live`, API URL, Supabase keys).
- [ ] Share the Vercel URL in the team chat. Tell B and C to run `git merge origin/main` into their branches once.

---

## P6 — Integration QA, tests, performance (H30–H36)
```
Resume context: Laptop A, feat/citizen. The H30 integration merge is done: run git merge origin/main into feat/citizen once now (this is the only time until H42).
Phase 6 — make it bulletproof:
1. Run the full citizen demo path (master §16 steps 1–3, 5 citizen side) against the deployed API; list every bug, then fix them one by one.
2. Playwright: complete Spec A §7 suite across chromium, msedge, mobile-chrome; fix flakiness.
3. Performance: code-split per route, lazy three.js, image sizes, font subsetting/preload, check bundle with a visualizer; Lighthouse mobile ≥85 on / and ≥90 on /app.
4. Edge-specific and Android-specific issues (voice, file input, safe areas, 100dvh).
5. Error/empty/loading states everywhere; hybrid fallbacks must never show broken UI.
Commit per fix; push to feat/citizen (no PR yet; next merge is at H42). Update docs/progress/A.md with remaining known issues.
```

## P7 — Wow polish + stretch (H36–H42)
```
Resume context: Laptop A, feat/citizen (no merging until H42).
Phase 7 — polish for judges:
1. Micro-interactions: button press springs, chip selections, success confetti on submit (tasteful), timeline check-draw, count-ups, skeleton shimmer, smooth route transitions everywhere.
2. Landing final pass: hero timing, scroll story pacing, typography rhythm, Telugu/Urdu display fonts in hero.
3. Demo path rehearsal: make the exact demo inputs from master §16 flawless (pre-fill helpers hidden behind VITE_DEMO_MODE, e.g. a "demo photo" picker).
4. Ask me (the human) to review the top 40 Telugu/Hindi/Urdu UI strings; apply corrections I give you.
5. Only if all above is done: stretch items from Spec A §8 in order.
Commit + push; at H42 open PR feat/citizen → main titled "Final: citizen portal". Update docs/progress/A.md.
```

## P8 — Final merge, deploy, freeze (H42–H46)
```
Resume context: Laptop A (integrator), main branch.
Phase 8: merge the final PRs into main in this order: B, then A, then C; run build, lint, full Playwright suite against the deployed API; fix only blockers.
Deploy to Vercel production. Write README.md: project pitch, features by portal, architecture diagram (mermaid), AI workflow, tech stack (free tier list), demo accounts, local setup, team. Tag v1.0-submission.
From H44 only bug fixes. Produce a checklist for the demo video recording (screen size, which accounts, which tabs pre-opened, demo clock reset).
```
