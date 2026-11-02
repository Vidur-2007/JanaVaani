# Contract notes — Laptop A

Additive changes, assumptions and requests about the shared contract (master §8/§9). Newest first.

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
