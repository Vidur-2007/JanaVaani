# Progress — Laptop A (foundation, landing, citizen portal)

## Current phase
**P7 — wow polish: items 1–3 DONE; item 4 (human review of the top 40 te/hi/ur strings) WAITING on the human; item 5 (stretch) not started (only after 1–4). Final PR `feat/citizen` → `main` ("Final: citizen portal") at H42.**

### P7 item 4: waiting on the human
- `docs/progress/A-i18n-review.md` lists the 40 most visible strings in en/te/hi/ur. Reply with `NN te: <new text>`; Claude applies them to the locale files.

## Done (P7)
- **Micro-interactions:**
  - Every `Button` has a springy press: quick squash, overshoot release.
  - Chips, tiles, stars, filter and reason chips, and onboarding tiles use `.jv-press`.
  - Skeletons shimmer instead of pulsing (direction-aware; static under reduced motion or high contrast).
  - A canvas confetti burst on the submitted screen (`Confetti`, new export; brand colours, 1.8 s, off under reduced motion or high contrast).
  - "N people affected" counts up after support (`useCountUp`, new export; screen readers get the final number once).
  - The timeline check-draw, KPI count-ups and route transitions were already in place.
  - A global `MotionConfig` turns the OS setting or in-app reduced-motion toggle into "no transforms" for every motion component.
- **Landing final pass:**
  - Hero greetings use each script's display face (Anek Telugu, Anek Devanagari, Noto Nastaliq Urdu). The faces are warmed 3 s after load, off the critical path; data-saver/2G users keep Noto.
  - The headline box is fixed at 3em (mobile) / 1.6em (md+), so no jumps between scripts at 360/412/768/1280 (measured). Mobile keeps 36 px until `md`; the project's `sm` is 390 px, so a 412 px phone used to get 60 px and overflow.
  - Scroll story: 300vh (was 400vh) with a scroll-linked progress rail. Mobile steps reveal on scroll.
  - **Fix:** the boot shell flashed light→dark on the landing because the prefs store started at `surface_theme: 'paper'`. It now follows the URL.
  - Lighthouse mobile on `/` is 85–86 after these changes.
- **Demo kit** (`portals/citizen/demo/demoKit.tsx`, only with `VITE_DEMO_MODE=true`):
  - Chat chips pre-fill the exact §16 phrases (Telugu live wire, Tenglish pothole, Urdu water) plus their place. Nothing auto-sends.
  - Voice mode has a "Say the demo phrase" stage fallback (the room mic can fail): it sends the Telugu live-wire phrase as the voice turn → emergency → continue → confirmation, with no location question.
  - Quick report has "Use demo photo": a generated synthetic pothole photo (`public/demo/pothole-miyapur.jpg`) + Miyapur X Roads + the Tenglish line → duplicate sheet.
  - The demo Miyapur point sits within ~70 m of the seeded incident in both mocks and B's seed. **Against B's API it now returns `INC-2026-MYP001` (32 supporters)**, so the P6 "duplicate miss" was our test location.
  - The streetlight trust step needs no helper: Home's "Is it fixed?" callout links to Lakshmi's suspicious-closure case.
  - Rehearsed end to end against B's API (hybrid build): login → voice demo phrase → takeover → confirm → ticket + confetti; demo photo → confirm → duplicates.
- **Robustness fixes found along the way:**
  - Going offline before the Leaflet chunk had loaded crashed the confirm screen into the error boundary (this broke the offline-outbox flow). `MapView` and the new `MapChunkBoundary` now show a "Map not available right now" placeholder and retry when back online.
  - The toaster and demo switcher load via `IdleImport` (renders nothing on failure, retries on `online`).

## Done (P6)
- **Demo path vs B's API** (master §16 steps 1–3 and 5, citizen side). Bugs found and fixed:
  - **Auth without Supabase:** hybrid/live sessions now get a token from B's `POST /auth/demo-login`. Without one, user-scoped calls got 401 → error screens.
  - **Token-less 401** now falls back to mocks in hybrid, instead of a broken screen.
  - **`share_location` quick reply** (B) was sent back as text and looped. It now opens the location sheet, and the duplicate chip is gone.
  - **API-relative media URLs** (`/api/v1/uploads/…`) rendered as broken images. New `mediaUrl()` resolves them against the API origin.
  - **Image compression fetched its worker from jsDelivr at runtime** (stalls offline, or where the CDN is blocked). Now self-hosted, max 4 passes, 10 s cap.
  - **React Router warning** on every landing visit (nested `<Routes>` under the index route).
  - **No request timeouts:** a sleeping HF Space hung screens. Now 12 s GET / 25 s POST / 45 s uploads+speech, and hybrid falls back on timeout.
  - B-side findings are logged in `docs/contract-notes/A.md` (P6): English-only quick-reply labels, Tenglish→seeded-incident duplicate miss with lexical embeddings, no translation offline.
- **Voice (real bug, mostly Android):** Web Speech `audio-capture` (the mic is already held by our recorder; standard on Android Chrome) ended every turn at once and left the UI stuck on "Listening…". Now the recorder → `/speech/transcribe` path takes over, a failed recognizer never ends the turn, and a turn with no speech returns to "tap to speak".
- **Edge/Android:**
  - The photo input has no `capture`, so Android offers Camera *and* gallery. Empty-MIME images from some pickers are accepted. Non-images get a translated message.
  - Safe-area insets: report composer, bottom sheets, emergency + voice overlays, guide input, main padding.
  - TTS: sentence-by-sentence speech (Chrome's ~15 s cut-off), a watchdog for Android's missing `end` event, resume of a paused queue, and Edge "Natural" voices preferred.
  - The Android back button closes voice mode instead of leaving the report and losing the chat.
  - `dvh` everywhere (no `100vh`/`h-screen` in A's code).
- **Performance:**
  - **Static boot shell** in `index.html`: landing hero, or a localized splash for app routes; self-contained CSS; theme applied before first paint, so no light→dark flash.
  - A Vite plugin injects the entry, modulepreloads, CSS and 2 Latin font preloads one frame after first paint.
  - `app/boot.ts` swaps to React once the stylesheet has applied and no `RouteFallback` is showing (no skeleton flash, no fade from blank).
  - `app/preload.ts` fetches the route's chunks and i18n namespace in parallel at boot.
  - The first render runs in `startTransition` (time-sliced).
  - The demo switcher (Radix menu + floating-ui) and sonner load after idle.
  - Heavy Indic display fonts load only in their own UI language: landing fonts went from 817 KB to 411 KB.
  - On phones the 3D hero waits for the first interaction (or 8 s). Below-fold landing sections use `content-visibility`.
  - PWA precache went from 3.4 MB to 1.9 MB (3D/PDF chunks are runtime-cached instead).
  - Home CLS fix: banners no longer push the list down.
  - **Critical JS 153.5 KB gzipped** (budget 250 KB). See it with `npm run analyze -w apps/web` (dependency-free bundle report: gzip per chunk, contents, critical total).
  - **Lighthouse mobile** (simulated throttling, brotli server like Vercel, mock build):

    | Page | Before | After |
    |---|---|---|
    | `/` | 40–57 | **84–89** |
    | `/app` (signed in) | 74 | **90–93** |
    | `/app/report` | 68–80 | **93** |
    | `/login` | 72 | **94** |
    | `/track` | 70 | **97** |
- **States:** a hybrid resilience suite renders 9 pages with the API unreachable, 404/501, token-less 401, or hanging: no error boundary or error state anywhere. The submitted screen now shows a retryable error when ticket details fail to load. `ErrorState` has `data-testid="error-state"`.
- **Tests:**
  - New `e2e/citizen/landing.spec.ts` (Spec A §7.1: reduced-motion poster, no canvas, CTA navigates).
  - New `e2e/citizen/hybrid.spec.ts` (opt-in, `E2E_HYBRID=1`, run against a hybrid build).
  - New voice back-button test.
  - `playwright.config.ts` accepts `PW_CHROMIUM_PATH` for preinstalled Chromium builds.
  - The full Spec A §7 suite is covered (1 landing, 2 Telugu guest report, 3 emergency, 4 duplicate, 5 tracker reopen, 6 Urdu RTL 360 px, 7 keyboard-only).
- **Quality:**
  - Build, lint (0/0), `test:mocks`, `test:voice` (24), `test:i18n` pass.
  - **Playwright 215 passed, 0 failed, 65 skipped** (chromium + mobile-chrome; skips are the chromium-only theme matrices and the opt-in hybrid suite).
  - Hybrid suite 8/8 (chromium + mobile-chrome).
  - The report/voice/tracker specs ×3 on mobile-chrome: 69/69 (no flakes).

## Known issues / remaining (P6)
- **msedge project not run in this session:** no Edge in the cloud sandbox. Run `npm run test:e2e -- --project=msedge` on a laptop with Edge before H42. Nothing Edge-specific was found in code review: `color-mix`, `:has`, `content-visibility`, `dvh`, Web Speech and MediaRecorder opus are all supported in current Edge.
- **Not yet tested on real devices:** voice on a real Android phone (the recorder path after `audio-capture`), the camera/gallery chooser, safe areas on a gesture-nav phone, and Edge Natural voices for te/hi/ur.
- **Lighthouse:** the landing scores 84–89 across runs (target ≥ 85); it varies with TBT from React + motion. Measured on the mock build with a local brotli server; re-measure on the Vercel URL. Further wins would need motion's `LazyMotion` across the design system (a larger refactor, so it's a P7 candidate).
- **HEIC photos:** Chrome can't decode HEIC, so those upload uncompressed (≤ 8 MB) and depend on B accepting them.
- **B-side items** (see contract notes): localized quick-reply labels; the duplicate match for the Tenglish pothole against the seeded incident with real embeddings; translation needs keys.
- **Sandbox-only:** `cdn.sheetjs.com` is blocked here, so `npm ci` fails. For local testing only, `xlsx` was installed from npm; `package.json`/lockfile were left untouched.
- **Push blocked this session:** `git push` to `feat/citizen` returned 403 (GitHub access not linked for this session), so the commits are local until pushed.

## Done (P5)
- **QR asset entry (`/r/:assetId`):**
  - Asset card: type icon, label, id, ward · zone, mini-map, open/past issue counts, "last fixed".
  - "Already reported — add your support" lists the open issues on the asset (public-safe titles via `/public/nearby`) with "I'm affected too".
  - "Report a problem with this <asset>" opens the assistant with `asset_id` **and** the asset's location prefilled.
  - A visitor without a session is silently signed in as a guest. First-time visitors go through onboarding and come back via `?next=`.
  - A friendly not-found state for unknown codes.
- **Nearby (`/app/nearby`):**
  - Map + list. The start point is GPS (if allowed in onboarding), else the citizen's latest complaint, else the city center. "Use my location" button; panning the map moves the search.
  - Radius slider 250 m–2 km (keyboard-accessible, value spoken as "1.5 km"); the map zooms to fit the circle.
  - Dots are public-safe `/public/map` points coloured by department (no ids, no text).
  - "N open issues within X", "I'm affected too" on each item, a public-summary tracker link, and an empty state with hints.
- **Public-service guide (`/guide`):**
  - Chat-like Q&A over `POST /guide/ask`: answer in the UI language with AI badge, Listen and "See English"; source chips.
  - When a department is suggested, "Report this issue" opens `/app/report?dept=<id>` with that department's phrase in the composer (editable).
  - Suggested questions in the UI language, plus sample chips in the other three languages (from their bundles).
  - Mock: localized department/topic answers in all 4 languages; emergency questions always get the call-112 answer.
- **PWA:**
  - `vite-plugin-pwa` manifest: name, `start_url /app`, shortcuts (Report, Track), PNG 192/512 + maskable icons and an apple-touch icon generated from the logo.
  - Offline app shell (`navigateFallback`, never for `/api`); cache-first fonts, OSM tiles and images; network-first API (6 s).
  - Install button in Settings (new "App" section) and a dismissible home card; the iOS "Add to Home Screen" hint; `beforeinstallprompt` captured before React mounts.
- **Accessibility pass** (axe WCAG 2.1 A/AA on 14 pages × light / dark / high-contrast / large text: **all clean**):
  - Paper theme colours darkened to pass AA (white on primary 3.4 → 6.3); landing "how it works" no longer fades inactive steps to unreadable.
  - Label-in-name fixes: logo link, language switcher, demo switcher, user menu, priority popover. Icon-only department badges have `role="img"`.
  - 44 px targets: map zoom buttons, priority popover, slider thumb hit area, list links.
  - Keyboard-only report submission e2e (Spec A §7.7).
  - Friendly, translated error messages by HTTP status instead of raw server text.
- **i18n completeness:**
  - All P5 strings in te/hi/ur.
  - New `npm run test:i18n` scans A's code for hardcoded JSX text/labels, physical Tailwind utilities, directional icons without `rtl-flip` and `toLocale*` calls, and checks key/placeholder parity. Intentional literals carry an `i18n-ignore` comment.
  - New Urdu RTL e2e on 15 pages at 360 px (`dir=rtl`, `lang=ur`, Urdu UI, no horizontal overflow) in normal **and** large text. Fixes: icon-only language button below 390 px, tracker grid `min-w-0`, direction-aware slide-ins (landing showcase, onboarding).
  - Stale "© CARTO" credit removed from the landing footer.
- **Quality (integration prep):**
  - `npm run build`, `npm run lint` (0/0), `test:mocks` (59/59 handlers + guide checks), `test:voice` (24), `test:i18n` all pass.
  - **Playwright: 285 passed, 0 failed, 114 skipped** (the theme/large-text matrices run on chromium only) across chromium/msedge/mobile-chrome.
  - New specs: `a11y`, `rtl`, `pwa`, `discover`.

## Human checks for P5 (to do)
- [ ] Print a real QR for `/r/SL-KHB-0001` and scan it on a phone: the asset card, then "add your support", then report with the location filled in.
- [ ] Nearby on a phone with location allowed: "Use my location", drag the radius, pan the map.
- [ ] Guide in Urdu and Telugu: tap the suggested questions, then "Report this issue".
- [ ] Install the app from Chrome/Edge on Android or desktop (Settings → App → Install). Then go offline and reopen: the shell loads.
- [ ] Screen reader pass (NVDA or TalkBack) through: report → confirm → tracker.
- [ ] A human reviews the top 40 te/hi/ur strings (Spec A §6; P7).

## Done (P4)
- **Mocks** (additive):
  - `/search?scope=mine` matches across languages through the department classifier, so Telugu "వీధి లైట్" finds an English streetlight complaint.
  - Chat tracking intent ("what happened to my water complaint?", ఏమైంది, क्या हुआ, کیا ہوا…) → `stage: 'answered'` + `tracked[]` filtered by department.
  - Supporters are recorded; resolving a complaint sends them a `community_update`. Lakshmi has one seeded.
- **My complaints (`/app/complaints`):**
  - Filter chips (all / open / needs my action / closed), synced to `?filter=`.
  - Debounced cross-language search (`/search?scope=mine`).
  - On-demand title translation (`/translate`, cached forever per text and language), with "Show original".
- **Tracker (`/app/complaints/:id`):**
  - Header: Listen (spoken summary), translate, priority "why" popover, closure label (citizen-verified / auto-closed / rejected).
  - 7-step progress with animated checks: vertical on mobile, horizontal from `md`.
  - Full activity history, including transfer reasons.
  - Deadline panel: live countdown, ETA, delay reason, escalation level.
  - Office card.
  - Evidence with BeforeAfterSlider and the AI verification badge (verdict + reasons).
  - Message thread with reply (shows the original or English).
  - Receipt + full report downloads.
  - Owner actions also work with the guest PIN.
- **"Is it fixed?":**
  - Yes → 1–5 stars + comment → closed (citizen-verified).
  - No → reason chips + text/dictation + photo (`purpose: verification`) → reopened; the steps go back to "In progress".
  - After closure: "Problem came back?" reopen, and appeal filing with its own status card (filed / under review / upheld / dismissed).
- **"I'm affected too":**
  - Nearby rows link to the complaint and also have an inline support button.
  - A non-owner gets a 403 → public-safe card (no private details) with support → celebration.
- **Full status report PDF** (`/print/report/:id`): adds closure type + rating, priority factors, AI verification, appeal, and the message log to the receipt.
- **Guest `/track`:** ticket + PIN shows the full tracker. A wrong PIN shows an inline alert.
- **Notifications (`/app/notifications`):**
  - Grouped by day (Asia/Kolkata), with type icons and unread dots.
  - Tapping an item marks it read and deep-links to its tracker; mark all read.
  - Community updates ("The issue you supported is fixed").
  - Realtime toasts with a "View" deep link come from the shell's `useLiveEvent`.
- **Chat tracking:** the "answered" stage shows mini tracker cards (status, department, deadline, 7-segment step bar, office), plus "See all my complaints".
- **i18n:** all 120 new P4 strings in te/hi/ur; key parity is 0 missing across common/landing/citizen.
- **Quality:**
  - Build, lint (0/0) and `test:mocks` (59/59 handlers) pass.
  - **Playwright 111/111** on chromium/msedge/mobile-chrome.
  - New `e2e/citizen/tracker.spec.ts`: tracker → reject closure → reopen; accept with stars → appeal; message reply; guest PIN (wrong + right, then reopen with PIN); Nearby → affected too; filter chips + Telugu search; notifications (community update, mark all read, deep link); chat tracking for Imran's water complaint.

## Human checks for P4 (to do)
- [ ] As Lakshmi, open `GRV-2026-000119` (streetlight). The AI badge says "suspicious". Drag the before/after slider. Tap Listen in Telugu.
- [ ] "No, not fixed" with a real photo from the phone camera → reopened; the steps go back.
- [ ] Download the full report PDF from a closed complaint and check that the Telugu/Urdu text renders.
- [ ] Guest: `/track` with `GRV-2026-000119` + PIN `936329` on a phone.
- [ ] In the chat, ask "నా నీటి ఫిర్యాదు ఏమైంది?" (as Lakshmi) and "What happened to my water complaint?" (as Imran) → mini tracker cards.
- [ ] Leave the app open for 20+ s → a toast for new notifications (mock poll) and the unread count updates.

## Done (P3)
- **Voice Orb:** an R3F icosphere displaced by simplex noise that follows the live mic level, with colors per state (listening / thinking / speaking). Lazy three.js chunk; CSS orb under reduced motion or without WebGL.
- **Mic input** (`report/voice/useVoiceInput.ts`):
  - `getUserMedia` → AnalyserNode level.
  - Known language: Web Speech with live captions.
  - The recorder always runs alongside. If Web Speech stalls or fails, or the language is Auto-detect, the recording goes to `/speech/transcribe`. This matters because headless Chrome defines a recognizer that never answers.
  - A turn ends on 1.5 s of silence after speech, on a tap, or after 20 s.
- **Voice-to-voice loop** (`VoiceMode.tsx`):
  - listen → `/chat/turn` (`input_mode: 'voice'`) → speak the reply in its language via the new additive `speakText()` → listen again;
  - emergency, duplicates and submitted hand over to the normal UI;
  - opened by the mic button or `?mode=voice`, and by default for voice-first users (`?mode=text` overrides).
- **Voice confirm** (`voiceWords.ts`): the §5.5 yes/no words in Latin and native scripts. `npm run test:voice` checks 24 cases. "Yes" submits; "no" opens the card's editor.
- **Degradation:** mic pre-prompt, denied/unsupported screens with "Type instead", and a one-time "Voice not available on this device for <language>" tip.
- **Easy (low-literacy) mode:**
  - one question at a time ("Show earlier" for the rest);
  - icon-first category tiles whose phrases contain the department keywords (all 40 phrases verified to route correctly);
  - icon quick replies, a simplified confirmation card with big ✓/✗, bigger duplicate-sheet buttons;
  - auto TTS + voice by default.
- **i18n:** P3 strings in en/te/hi/ur, with key and placeholder parity checked.
- **Quality:**
  - Build, lint, `test:mocks` and `test:voice` pass.
  - **Playwright 87/87** on chromium/msedge/mobile-chrome, with fake-microphone launch flags. New `e2e/citizen/voice.spec.ts` covers the voice loop via MediaRecorder → transcribe, voice confirm → ticket, mic blocked, voice-first default, and easy mode end to end.

## Human checks for P3 (to do)
- [ ] Real mic in Chrome **and** Edge: voice mode in Telugu, Hindi and Urdu. Do the live captions appear (Web Speech), and does the turn end after a pause?
- [ ] In DevTools, `speechSynthesis.getVoices()`: which of te/hi/ur have voices on the demo laptops? Languages without one show the "voice not available" tip.
- [ ] Say "avunu" / "haan" at the confirmation step → it submits.
- [ ] Easy mode on a phone: are the tiles and buttons big enough, and is there one question at a time?

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

## Next (P6 / H30)
- H30 integration: the team reviews and merges the "Integration: citizen portal" PR (A does not merge). After that, pull `main` and run the full suite again.
- Hybrid run once B's API is reachable: the P3 Step 1 checklist, the P4 live flows, and the P5 `/guide/ask`, `/public/nearby` and `/meta/assets/{id}` endpoints.

## Blockers
- Hybrid/live testing needs B's API to be deployed (B's code is pushed in PR #1, but there is no public URL yet). Everything else works in mock mode.

## Notes for the team
- **Breakpoints follow master §11:** `sm` = 390 px, `md` = 768, `lg` = 1024 (not Tailwind's default 640 for `sm`). Use `md:` for "desktop".
- Branch state (2026-11-02): `feat/citizen` contains `main` and is ~47 commits ahead (PR open). `feat/ai-engine` has an open PR #1. `feat/gov-portals` is at C's admin command center (P3+).
- **Shared design/lib changes in P5 (all additive):** see `docs/contract-notes/A.md` → P5. The paper theme colours changed, `errorMessage()` is now friendly and translated, and `Slider` has a new `thumbProps` prop.

## Contract notes
See `docs/contract-notes/A.md`. Requested from B: `GET /me` (done by B), `app_metadata.role` on demo users (done by B), ward/asset id formats, a localized `/guide/ask` with `department_id`.

## Handy for demos (mock mode)
- Demo ticket for guest tracking: `GRV-2026-000101`, PIN `647556` (live wire near a school, Lakshmi).
- Suspicious-closure streetlight (Ameerpet): `GRV-2026-000119`, PIN `936329`.

## Known issues / follow-ups
- Fixed in P4: a 403 on the tracker now shows the "I'm affected too" card instead of an error.
- On the landing page at 360 px, the icon-only demo role switcher sits near the hero's "Track" button (demo mode only).
- QR scans by first-time visitors pass through the 3-step onboarding (language + consent) before the prefilled report. This is intentional, for consent; revisit if the demo needs a faster path.
- The City Pulse chunk is large (~244 KB gz) because R3F pulls in all of three.js. It is lazy and idle-loaded, but trim it in P6 if Lighthouse complains.
