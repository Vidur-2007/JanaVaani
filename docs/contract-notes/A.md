# Contract notes — Laptop A

Additive changes, assumptions and requests about the shared contract (master §8/§9). Newest first.

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
