# Spec A — Shared Frontend Foundation, Landing & Citizen Portal

> **Laptop A · branch `feat/citizen` (P0 runs on `main`)**
> Read `00-MASTER-SPEC.md` first. This spec covers only what Laptop A builds.

## 1. Mission
A owns two things:
1. **The frontend foundation everyone builds on:** the hour-0 scaffold, design system, API client, mock layer, auth, i18n.
2. **Everything a citizen touches:** landing page, report assistant (chat, voice, photo, QR), tracking, verification, appeals, notifications, settings and accessibility modes.

**The citizen experience must feel like the best app on any judge's phone:** effortless, warm, multilingual, and beautiful.

## 2. Files A owns
- `apps/web/src/app/**` (frozen after P0, A may patch bugs)
- `apps/web/src/design/**`
- `apps/web/src/lib/**`
- `apps/web/src/portals/landing/**`, `apps/web/src/portals/citizen/**`
- `apps/web/src/i18n/locales/*/{common,landing,citizen}.json`
- `packages/contracts/**` (creates it in P0; frozen until the H30 integration merge. Extra types go in `portals/citizen/types-ext.ts`)
- **After P0, shared code (`src/app`, `src/lib`, `src/design`) is frozen for compatibility:** A may fix bugs and add new exports, but must never rename or remove anything that existed at `v0-scaffold`, because Laptop C builds against that version until H30.
- `e2e/citizen/**`, `playwright.config.ts`, root `README.md`, `CLAUDE.md`, `vercel.json`

**Never edit:** `portals/officer|admin|public|gov-shared`, `gov.json` locale files, `services/`, `ml/`, `data/`, `supabase/`.

---

## 3. Phase 0 — Hour-0 scaffold (on `main`, target ≤ 90 minutes)

Produce a working skeleton that C can branch from, with **every dependency from master section 4 installed**.

1. **Repo root:**
   - `package.json` with npm workspaces `apps/*`, `packages/*` (or a single app plus path alias; simplest working option).
   - `.gitignore`, `.editorconfig`, `CLAUDE.md` (golden rules + spec pointers, ≤ 60 lines), `README.md` skeleton.
   - `docs/progress/{A,B,C}.md` and `docs/contract-notes/{A,B,C}.md` with headers only.
2. **`packages/contracts`:**
   - `src/types.ts`: master section 8 verbatim.
   - `src/endpoints.md`: master section 9.
   - `mocks/`: a **deterministic** mock dataset generator with a fixed seed. It covers all 11 departments, the 30 demo wards (names and centroids from spec B, section 3.2), 7 demo users from master section 14, about 80 grievances in mixed languages with real Telugu/Hindi/Urdu text, timelines with fake hashes, incidents, notifications, KPIs, performance, trends, alerts, AI metrics and public stats.
   - `mocks/handlers.ts`: one function per endpoint #1–#57 returning contract-shaped data, with simple in-memory state so submit → track works in mock mode.
3. **`apps/web` (Vite + React 19 + TypeScript strict):**
   - Tailwind v4, shadcn/ui initialized; add: button, input, textarea, select, dialog, sheet, tabs, tooltip, dropdown-menu, badge, card, skeleton, progress, avatar, command, table, switch, slider, toggle-group, scroll-area, separator, popover, radio-group, checkbox, label.
   - Path aliases `@/` → `src/`, `@contracts/` → `packages/contracts/src/`, `@mocks/` → `packages/contracts/mocks/`.
4. **`src/design`:**
   - `tokens.css` with both themes, high contrast, large font, priority and department colors (master section 11).
   - Font setup with per-language stacks.
   - `motion.ts` presets (durations, easings, `pageTransition`, `stagger`, `fadeUp`).
   - All **shared components** listed in master section 11, in basic but polished form.
5. **`src/lib`:**
   - **`api/client.ts`:**
     - `fetch` wrapper that adds the bearer token from Supabase and normalizes `ApiError`.
     - Mode switch `mock | hybrid | live` per master section 9, with the dev badge counting fallbacks.
   - **`api/endpoints.ts`:** one typed function per endpoint (all 57) + TanStack Query key factory `qk`.
   - **`auth/`:**
     - `AuthProvider` + `useAuth()` returning `{ user, profile: {id, role, name, preferred_language, department_id?}, status, signInWithPassword, signInWithMagicLink, signInAsGuest, demoLogin(role), signOut }`.
     - Supabase implementation, plus a mock implementation used when `VITE_API_MODE=mock`, with a role switcher stored in localStorage.
     - Route guards: `<RequireRole roles={[...]}/>`.
   - **`supabase.ts`:** a client created only if env vars exist.
   - **`live/useLiveEvents.ts`:** subscribes to the `live_events` audiences for the current user, invalidates query keys, and polls every 20 seconds in mock mode.
   - **`i18n/`:**
     - i18next with bundled resources loaded by dynamic import per language.
     - Namespaces `common, landing, citizen, gov`.
     - Fallback `en`; sets `<html lang dir>`.
     - `useLangFormat()` for numbers and dates via `Intl` in the `Asia/Kolkata` time zone.
   - **`prefs/`:** a zustand store persisted to localStorage: `ui_lang, theme, contrast, font, motion, simple_mode, low_literacy, voice_autoplay, tts_rate`. It applies the `data-*` attributes to `<html>`.
   - **`tts/useSpeak.ts`:** picks the best `speechSynthesis` voice for the language; falls back to `/speech/tts`; otherwise reports `unavailable`.
   - **`detectScript.ts`:** Unicode-range script detection (Telugu U+0C00–0C7F, Devanagari U+0900–097F, Arabic U+0600–06FF, Tamil U+0B80, Kannada U+0C80, Malayalam U+0D00, Bengali U+0980, Gujarati U+0A80, Latin) for instant UI hints.
6. **`src/app`:**
   - `providers.tsx` (QueryClient, Auth, i18n, prefs, Toaster, Lenis provider for landing only).
   - `routes.tsx` with a **lazy import of each portal's `routes.tsx`**: `/` landing, `/login`, `/onboarding`, `/app/*`, `/track`, `/r/:assetId`, `/guide`, `/print/*`, `/officer/*`, `/supervisor/*`, `/admin/*`, `/public/*`, `*` 404.
   - `brand.ts` (name "JanaVaani", tagline per language).
   - `ErrorBoundary`, 404 page, `PageTransition` wrapper.
7. **Portal stubs:** `portals/{officer,admin,public,gov-shared}/routes.tsx` with placeholder pages, so C starts with working routes and A never needs to touch them again.
8. **Locales:** `common.json` en/te/hi/ur (nav, actions, statuses, priorities, department names, errors); empty `gov.json` files for C.
9. **Quality:** `playwright.config.ts` with projects `chromium`, `msedge` (`channel: 'msedge'`), `mobile-chrome` (Pixel 7); one smoke test that loads `/`. ESLint + Prettier. `vercel.json` with SPA rewrites.
10. **Done when:** `npm run dev`, `npm run build` and `npm run lint` all pass; every route renders in mock mode; pushed to `main` and tagged `v0-scaffold`.

---

## 4. Routes (A)

| Route | Page | Auth |
|---|---|---|
| `/` | Landing | public |
| `/login` | Login (citizen magic link, guest, gov email+password, demo buttons) | public |
| `/onboarding` | First-run: language → consent → accessibility prefs | any |
| `/app` | Citizen home | citizen/guest |
| `/app/report` | Report assistant (chat + voice) | citizen/guest |
| `/app/report/quick` | Photo-first quick report | citizen/guest |
| `/app/complaints` | My complaints + search | citizen/guest |
| `/app/complaints/:id` | Complaint tracker | owner |
| `/app/notifications` | Notification center | citizen/guest |
| `/app/nearby` | Nearby issues map | citizen/guest |
| `/app/settings` | Language, accessibility, privacy, AI transparency | citizen/guest |
| `/track` | Track by ticket ID + PIN (no login) | public |
| `/r/:assetId` | QR asset entry → prefilled report | public (guest session auto-created) |
| `/guide` | Multilingual public-service guide | public |
| `/print/receipt/:id`, `/print/report/:id` | Print-optimized views | owner / pin |

---

## 5. Page specifications

### 5.1 Landing (`portals/landing`)
**Sections, in order:**
1. **Hero:**
   - **City Pulse** 3D canvas: instanced points sampled from ward polygons and `/public/map`, colored by department, tilted plane, slow drift, mouse parallax.
   - Every 2–4 seconds a ring pulse appears at a recent complaint; occasionally a green "resolved" flash.
   - Headline cycles greetings: "Speak your problem." / "మీ సమస్యను చెప్పండి." / "अपनी शिकायत बताइए।" / "اپنی شکایت بتائیں۔" with a morph/blur transition.
   - Primary CTA "Report by voice" goes to `/app/report?mode=voice`; secondary "Track a complaint".
2. **How it works (scroll story):** 4 pinned steps animated on scroll: Speak → AI understands (show detected language, translation, department, priority chips appearing) → Officer acts → You verify. Each step has a small live-looking UI vignette, not a stock image.
3. **Live city stats:** `GET /public/stats` count-ups (total, resolved %, average resolution time) plus a mini department bar list; "Live" indicator.
4. **Languages showcase:** the same complaint typed in 4 scripts plus Tenglish, converging into one structured card. This is the "one complaint, any language" moment.
5. **Trust:** citizen-verified closure, AI verification, tamper-evident audit, privacy, each with a micro-animation.
6. **Portals:** four large cards (Citizen, Officer, Admin, Public dashboard), each a 3D-tilt card on hover, linking to their entry points.
7. **Footer:** "Built with free & open tech" stack strip, demo-data disclaimer, language switcher.

**Requirements:**
- Lenis smooth scroll; scroll reveals with Motion `whileInView` (play once).
- Mobile: hero point count ≤ 2k, no parallax, sticky CTA bar.
- With `prefers-reduced-motion`: static hero gradient poster plus a fade-in.
- Lighthouse performance ≥ 85 on mobile for `/` (3D lazy-loaded after LCP).

### 5.2 Login and onboarding
- **Tabs:** Citizen (email magic link · Continue as guest) | Government (email + password).
- **`VITE_DEMO_MODE`:** a "Demo accounts" panel with one-click buttons for all 7 accounts (master section 14), labeled with persona and role.
- **Onboarding (first run):**
  1. Language picker: four large script tiles + "More languages".
  2. Consent screen in the chosen language: what is collected, how AI is used, that location and microphone are optional (feature 236, 247, 249).
  3. Accessibility quick choices: Large text · High contrast · Simple mode · Voice-first (feature 215).
- **After login, redirect by role:** citizen/guest → `/app`, officer/supervisor → `/officer`, admin → `/admin`.

### 5.3 Citizen home (`/app`)
- Greeting in the user's language with their name.
- **4 large action tiles:** Report by voice · Report with photo · Type a complaint · Track.
- Active complaints carousel with status chip and SLA countdown.
- Nearby issues teaser (3 items, "Me too" button).
- Unread notifications badge.
- **Simple mode:** only the 4 tiles plus the active list.
- **Navigation:** bottom nav on mobile (Home, Report, Complaints, Alerts, Settings); side rail on desktop.

### 5.4 Report assistant (`/app/report`) — the hero feature
A chat-style conversation driven entirely by `POST /chat/turn`. The UI state follows `response.stage`.

**Layout:**
- Message list; composer with text input, mic button, photo button, location button.
- Language indicator chip ("Telugu · detected", or "Tenglish" when `is_code_mixed`).
- Quick-reply chips; progress dots (missing fields remaining).

**Stage `collecting`:**
- Render `reply` in the citizen's language with an `AIBadge`.
- Show quick replies.
- Each bot message has a `ListenButton`; it auto-plays if `voice_autoplay` or low-literacy mode is on.
- Messages appear with a typing indicator, and the bot text reveals word by word (fake streaming over 400–900 ms).
- **Photo:** compress to ≤ 1600 px / about 200 KB, upload via `POST /uploads` (purpose `evidence`), show a thumbnail with a quality badge. If `quality.ok=false`, show a friendly retake prompt (feature 31).
- **Location button:** opens the Location sheet (5.7).

**Stage `confirming` — ConfirmationCard (features 20, 21, 53, 45, 48, 70):**
- Title and **formal complaint in the citizen's language**, with toggles "Show in English" and "Show my original words" (the original text is never lost).
- Department badge + sub-department; **routing preview**: "Will go to: Power Distribution · Kukatpally zone · Sunitha Reddy (AE)", plus a confidence meter and a one-line explanation.
- **Priority preview:** level chip, score, factor list ("Live wire +10 · Near school +10 · Emergency rule floor 80"), SLA hours.
- Location mini-map, photos, collected fields.
- Anonymous toggle (feature 34) and Private toggle (feature 239) with an info tooltip.
- **Buttons:** Confirm & submit · Edit (sends `action: 'edit'`) · Cancel.
- **Voice mode:** "Say *avunu* / *haan* / *yes* to confirm".

**Multiple issues (feature 37):** if `drafts.length > 1`, show "We found 2 separate problems" with a card for each, each with an include checkbox; confirm with `action: 'split_confirm'` and `{draft_ids}`.

**Stage `duplicate_check` — DuplicateSheet (features 89–96, 255):**
- A bottom sheet listing matches: title in the user's language, distance, "N people affected", status, and the languages reported in.
- Primary action **"Add my support"** (`action: 'support_existing'` with `{grievance_id | incident_id}`); secondary "Mine is different — file new" (`file_new_anyway`).
- After supporting: a celebratory micro-animation and "You'll be notified when it's fixed" (feature 105).

**Stage `emergency` — EmergencyTakeover (features 58, 59, 63, 68):**
- Full-screen red pulse, message in the user's language, matched terms.
- **Huge call buttons** (`tel:` links) for each contact.
- "Your complaint is marked critical and sent to the emergency review team"; "Continue registering" (`continue_after_emergency`).
- Emergency mode never blocks calling. **The call buttons render first**, before any animation.

**Stage `submitted`:** success screen with:
- Animated ticket ID (mono font), guest PIN (with a copy button and "save this PIN" warning), SLA due date in the local format.
- Buttons: Download receipt (5.9), Track now, Report another.

**Stage `answered`:** status answers (feature 81) render `tracked[]` as mini tracker cards; guide answers render with source links.

**Offline and drafts (features 36, 212):**
- Persist `{session_id, messages, pending media}` in IndexedDB.
- On return: "Continue your unfinished complaint?"
- If offline at submit: queue in an `outbox` and show "Will send automatically when you're back online"; flush on the `online` event and toast the result.

**Accessibility:** message list `aria-live="polite"`; composer fully keyboard operable; Enter to send, Shift+Enter for a newline.

### 5.5 Voice mode (features 5, 6, 7, 202, 251, 216)
- **Entry:** mic button, or `?mode=voice`. Full-screen **Voice Orb** (R3F sphere with noise displacement driven by `AnalyserNode` volume; CSS fallback).
- **Language selection:**
  - Default is the user's `ui_lang`; a chip lets them pick another or **Auto-detect**.
  - With a known language, use the Web Speech API (`webkitSpeechRecognition`, `lang` from master section 7, `interimResults: true`) and show live captions.
  - With **Auto-detect**, or when Web Speech is unavailable or errors, record with `MediaRecorder` (webm/opus) and send to `POST /speech/transcribe`.
- **Turn-taking:** end on 1.5 s of silence (volume threshold) or tap. Then send the text to `/chat/turn` with `input_mode: 'voice'`, then speak the reply via `useSpeak` in the detected language, then auto-listen again (true voice-to-voice).
- **Voice confirm words** (case-insensitive, also in Latin script):
  - **Yes:** yes, ok, confirm, అవును, సరే, avunu, sare, हाँ, हां, haan, ji haan, theek hai, جی ہاں, ہاں, ji
  - **No / edit:** no, edit, change, కాదు, మార్చు, kaadu, nahi, नहीं, badlo, نہیں
- **No voice for the language:** show text with "Voice not available on this device for Telugu" and a one-time tip.
- **Permissions:** request the microphone only on first mic tap, with a pre-prompt explaining why.

### 5.6 Quick report (`/app/report/quick`) — Photo-to-Grievance (features 19, 250)
- Step 1: take or upload a photo (camera capture on mobile).
- Step 2: location (GPS auto, or pin).
- Step 3: optional one-line text or voice note.
- Then call `POST /grievances/analyze` and show the same ConfirmationCard; submit via `POST /grievances` (duplicates come back on the response, so show the DuplicateSheet if present).
- Target: **3 taps** from open to submitted.

### 5.7 Location capture (features 23, 24, 25)
- **Sheet tabs:** Use my location (GPS with accuracy circle, reverse-geocoded address from the backend response) · Pick on map (draggable pin over `MapView`, ward polygon overlay from `/meta/wards.geojson`, ward name shown live) · Type a landmark.
- If the AI extracted a location from the text, show "Did you mean: Miyapur X Roads?" as a one-tap suggestion.

### 5.8 My complaints (`/app/complaints`) (features 17, 18)
- **Filter chips:** All · Open · Needs my action · Closed.
- **Cross-language search box:** calls `/search?scope=mine`, so a query in Telugu finds an English complaint.
- **Cards:** title in the preferred language (original if it matches, else English, with a "Translate" link via `/translate`, result cached in memory), status, priority, SLA countdown, support count.

### 5.9 Receipts and PDF reports (features 86, 87)
**Indic-script warning:** jsPDF cannot shape Telugu/Devanagari/Urdu text. Instead:
- `/print/receipt/:id` and `/print/report/:id` render print-optimized HTML (A4, logo, QR to the tracker URL, ticket ID, timeline).
- "Download PDF" uses `html-to-image` (toPng at 2× scale) then `jspdf.addImage`; "Print" uses `window.print()` with print CSS.

### 5.10 Complaint tracker (`/app/complaints/:id`) (features 71–75, 82–85, 88, 263)
- **Header:** ticket ID, title (in the user's language), status chip, priority chip with factors popover, department, ward. `ListenButton` reads a status summary (feature 216).
- **Visual timeline:** the 7 citizen-facing steps from master section 7. The current step glows; completed steps get a check-draw animation. Below it, the full activity history from `timeline` (non-internal events), with actor and time; reassignments show "Transferred from X to Y because …" (feature 85).
- **SLA panel:** due date, live countdown, ETA ("Usually resolved in about 2 days in your area" — historical, clearly labeled), delay reason if any (feature 84), escalation level indicator.
- **Office card:** assigned office and designation, office phone if present (feature 73).
- **Evidence:** citizen photos plus resolution proof; a **BeforeAfterSlider** when both exist (feature 83).
- **AI verification badge** on the resolution (verified / suspicious / unclear) with reasons (feature 253).
- **Messages thread:** officer messages shown in the citizen's language with a "see English" toggle; the citizen can reply (`POST /grievances/{id}/messages`).
- **Actions, by state:**
  - `resolved_pending_verification`: a prominent **"Is it fixed?"** card with Yes → star rating (1–5) + optional comment; No → reason (quick chips + text/voice) + optional photo → reopen (features 107–110, 117, 118).
  - After closure or a dismissed reopen: **"File an appeal"** with reason, plus separate appeal status tracking (features 113, 114).
  - **Supporters:** "N people affected" + "I'm affected too" for non-owners arriving from Nearby.
- **Downloads:** receipt and full status report PDF.
- **Closure label:** "Closed — confirmed by you" vs "Closed — no response from citizen" (feature 88).

### 5.11 Guest tracking (`/track`)
- Ticket ID + PIN form, QR scan (camera) optional; then the same tracker in read-only mode with verification actions enabled.

### 5.12 Notifications (`/app/notifications`) (feature 79)
- Grouped by day; types with icons; unread dot; mark all read.
- Tapping deep-links to the tracker.
- A realtime toast appears via `useLiveEvents`.
- Community updates (feature 105) show "The pothole you supported is fixed".

### 5.13 QR asset entry (`/r/:assetId`) (feature 227)
- Fetch `/meta/assets/{id}`; show the asset card (type, label, ward, open issues on this asset).
- "Report a problem with this streetlight" opens the report assistant with `asset_id` and location prefilled.
- If an open issue exists: "Already reported — add your support".
- Silently creates a guest session if not logged in.

### 5.14 Nearby issues (`/app/nearby`) (feature 175)
- Map + list of `/public/nearby` around the user's location or the map center, radius slider 250 m–2 km.
- Public-safe fields only; "I'm affected too" on each item (goes through `/grievances/{id}/support`).

### 5.15 Public-service guide (`/guide`) (feature 264)
- Chat-like Q&A: "Which department handles mosquito problems?" calls `POST /guide/ask`.
- Shows the answer in the user's language plus source chips, and a "Report this issue" CTA prefilled with the suggested department.
- Suggested question chips in 4 languages.

### 5.16 Settings (`/app/settings`) (features 203–207, 209, 215, 236, 247, 249)
- **Language:** UI language, and a separate preferred reply language.
- **Display:** theme, large text, high contrast, reduced motion, simple mode.
- **Low-literacy mode:**
  - One question at a time; icon-first category tiles for quick replies.
  - Auto TTS for every bot message; voice input default.
  - Big ✓ / ✗ confirm buttons; minimal text.
- **Voice:** autoplay, speech rate.
- **Privacy:** what we store, anonymous default toggle, location permission status.
- **AI transparency:** where AI is used, what humans decide, that data is synthetic in this demo.
- Everything persists via the `prefs` store.

### 5.17 PWA (feature 213)
- `vite-plugin-pwa`: manifest (name, icons generated from the logo, theme colors), offline app shell, cache-first for fonts and static assets, network-first for the API.
- Install prompt button in settings and on the home screen (where supported).

---

## 6. i18n requirements
- **Namespaces:** `common`, `landing`, `citizen` in en/te/hi/ur. Claude writes the Telugu, Hindi and Urdu translations; humans review the top 40 strings in P7.
- **Urdu:** `dir="rtl"`. Use **logical Tailwind utilities only** (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). Mirror directional icons (arrows, chevrons) in RTL.
- Dates and numbers via `Intl` with the `Asia/Kolkata` time zone. Keep Western digits for ticket IDs.
- AI-generated content arrives already localized (`Localized.original` + `en`). Show `original` when `lang === ui_lang`, else `en` with a "Translate" affordance.

## 7. Testing (Playwright, `e2e/citizen`)
Run on `chromium`, `msedge`, `mobile-chrome`, in mock mode (and hybrid when the API exists):
1. Landing loads, hero fallback shown under reduced motion, CTA navigates.
2. Guest → text report in Telugu → confirm → ticket shown.
3. Emergency phrase → takeover with call buttons visible.
4. Duplicate flow → support existing.
5. Tracker → verify "not fixed" → reopen.
6. Language switch to Urdu → `dir=rtl`, no horizontal overflow at 360 px.
7. Keyboard-only report submission.

## 8. Stretch for A (only after core)
- S5 document photo extraction UI ("Upload a notice or bill").
- S10 voice navigation commands ("open my complaints" / "నా ఫిర్యాదులు").
- Animated onboarding mascot-free illustration set.
- Share-to-WhatsApp **link** button (just a `wa.me` share URL — free, no API).
