# Contract notes — Laptop A

Additive changes, assumptions and requests about the shared contract (master §8/§9). Newest first.

## P6 (integration QA against B's API, offline mode, run locally from `origin/feat/ai-engine`)

### Frontend changes (additive, in `src/lib`; nothing renamed)
- **Demo tokens without Supabase:** when `VITE_API_MODE` is `hybrid`/`live` and Supabase isn't configured, demo/password sign-in with a seeded `@janavaani.test` email calls `POST /auth/demo-login` and sends that token as `Authorization: Bearer`. It's stored in `localStorage` `jv.apiToken` and cleared on sign-out. Any failure leaves the session token-less (mock fallbacks still apply).
- **Hybrid fallback:** a **401 on a request sent without a token** now also falls back to mocks. With a token, a 401 is still a real error.
- **`mediaUrl(url)`** (new export, `@/lib/api/client`): resolves API-relative media URLs (`/api/v1/uploads/{id}`) against the API origin. C: use it for `<img src>` on media from B (photos, resolution proofs) until Storage signed URLs exist.

### Requests to B (found running master §16 citizen steps against the API)
1. **Quick-reply labels are English only** (`"Share my location"`, `"Continue filing complaint"`, `"Confirm"`, `"Edit"`) even with `ui_lang: te|hi|ur`. Please localize `label` to `ui_lang`. The citizen UI already replaces `share_location`, confirm/edit and continue with its own translated controls, but other replies show as sent.
2. **`share_location` is a UI action, not an answer.** We now open the location sheet for it and send `location` on the next turn. Please keep that value stable (or tell us if it changes).
3. ~~Duplicate miss on the headline demo~~ **Resolved (P7):** the miss came from the test location (real-world Miyapur X Roads, ~700 m from the seeded incident). With the demo location (17.4974, 78.3617), `check-duplicates` returns `INC-2026-MYP001` (32 supporters, 21 m), even with lexical embeddings. The citizen demo kit uses that point.
4. **Offline mode doesn't translate officer messages** (`/officer/grievances/{id}/message` returns `lang: en`). That's expected without keys. The demo needs Gemini so Lakshmi receives Telugu (§16 step 4).
5. A guest without a token gets 401 on `GET /notifications` and `GET /me/grievances`. That's fine (we fall back to mocks). A guest who files via chat without a token can track only by ticket + PIN.

## P5

### Heads-up for C (shared design/lib changes on `feat/citizen`; all additive, nothing renamed or removed)
- **Paper (light) theme colours are darker, to meet WCAG AA.** `--primary` `#e8620c` → `#a83c06`, `--accent` → `#0a736b`, `--success` → `#0d7038`, `--warning` → `#8a5a00`, `--danger` → `#b3122a`, `--ai` → `#4349d6`. The Ink theme `--ai` is now `#8a90ff`. Same token names, so gov screens in paper mode pick them up after H30. White on primary is now 6.3:1 (was 3.4).
- **`errorMessage(e)`** (`@/lib/api/client`) now returns a friendly, translated message by HTTP status (`common:errors.{network,unauthorized,forbidden,not_found,conflict,too_large,rate_limited,invalid,server}`) instead of raw server text. Same signature. Add `errors.*` to `gov.json` only if you want different wording.
- **`Slider`** (`@/design/ui/slider`) takes an optional `thumbProps` (e.g. `{ 'aria-label': … , 'aria-valuetext': … }`). The thumb is the focusable element, so put the name there. The thumb is now 20 px with a 44 px hit area.
- **`LanguageSwitcher`:** icon-only below 390 px; its accessible name is now "Language: <native name>" (WCAG 2.5.3 label-in-name).
- **`DepartmentBadge iconOnly`** has `role="img"` (an `aria-label` on a bare span is not allowed).
- **Map zoom buttons** (Leaflet `.leaflet-bar a`) are 44 px in `MapView`.
- **New:** `@/lib/pwa/install` → `useInstallPrompt()` / `promptInstall()`. `beforeinstallprompt` is captured in `main.tsx`.
- **PWA:** the service worker precaches the shell. Runtime caching: `/api/v1/*` network-first (6 s), fonts/OSM tiles/images cache-first. Navigations to `/api/*` never fall back to `index.html`.

### Mock additions (additive)
- `POST /guide/ask` answers in `ui_lang`. Department questions in any language/script (via `classify`) return `department_id` plus a localized "handled by <dept> (<agency>)" answer. Topic questions (emergencies, appeals, privacy, verification) return localized answers. Emergency questions always get the call-112 answer first.

### Requests to B
- `POST /guide/ask` should return `answer.original` in `ui_lang` (with `answer.en`), and `department_id` when the question maps to a department; the "Report this issue" button depends on it.
- `GET /public/nearby` has no coordinates, by design. The Nearby map draws dots from `GET /public/map` (public-safe points) within the radius, so keep `/public/map` returning open issues with `status`.

## P2

### Heads-up for C (and anyone drawing maps)
- **CARTO basemaps now require an API key.** Keyless `basemaps.cartocdn.com` tiles come back watermarked "API KEY REQUIRED". Spec C §4 (`GovMap`: CARTO `dark_all`/`light_all`) is affected.
- On `feat/citizen`, the shared `MapView` now uses keyless OpenStreetMap tiles; the Ink theme darkens them with a CSS filter. Set `VITE_TILE_URL` / `VITE_TILE_ATTRIBUTION` to use another provider.
- Until the H30 merge, C should do the same in its own tile layers: use `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with the attribution "© OpenStreetMap contributors".

### Mock additions (additive)
- `extractLocation(text)`: ward names in Latin or te/hi/ur script become a suggested `draft.location` with `source: 'text'`.
- `splitIssues(text)` and `drafts[]`: one message describing problems for different departments returns several drafts; `split_confirm` with `{draft_ids}` submits each one.
- Follow-up questions come with localized `quick_replies` (`value` = canonical English answer).
- Uploads under 15 KB return `quality.ok=false` (`too_small`).

## P0 (v0-scaffold)

### Requests to B
- **`GET /api/v1/me`** (additive) → `{ id, role, name, email?, preferred_language, department_id? }` for the signed-in user. `profiles` sits behind RLS, so the frontend can't read it directly. The mock layer already serves it. Until it's live, the frontend reads the role from Supabase `app_metadata.role`, then `user_metadata.role`, then the demo email. **Please set `app_metadata.role` and `user_metadata.name` on the seeded demo users.**
- **Ward ids:** the mocks use `W-<ZONE>-NN`, numbered per zone in the Spec B §3.2 table order (SLP, KKP, KHB, SEC, CHR, LBN). Example: Kukatpally = `W-KKP-01`, Miyapur = `W-SLP-04`. Please keep this scheme in `build_wards.py`.
- **Asset ids:** the mocks use B's format `<TYPE>-<ZONE>-NNNN` (`SL`, `DR`, `WP`, `BN`, `RD`, `TS`). Example: `SL-KHB-0001`.
- **Guest PIN:** returned only on submit (`guest_pin`). `GET /grievances/{id}?pin=` must accept it with no auth header.

### Mock-layer behaviour (so live and mock line up)
- Ticket ids: `GRV-2026-NNNNNN`, starting at `GRV-2026-000101`.
- Chat intake asks at most two follow-up questions before `confirming`. On `confirm`, it returns `duplicate_check` when an incident or open grievance of the same category is within 500 m / 300 m.
- `POST /speech/tts` returns **501** in mock mode, so the UI falls back to browser voices.
- Mock translations of free text are prefixed with `[Mock translation]`.
- `registerMockHandler(method, pattern, fn)` (`@mocks/index`) lets portals add or override mock endpoints without editing `packages/contracts`.
