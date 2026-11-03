# Contract notes — Laptop B

Additive changes to the shared contract (new optional fields, new endpoints). Newest first.

- **2026-11-03 (intake, fields, B2, B3, spike members, asset list)** For A and C. TypeScript additions belong in `types-ext.ts` until they move into `packages/contracts`.
  - **Chat follow-up questions (A, Spec B §5.2).**
    - `POST /chat/turn` now asks up to 4 questions, one per turn, before the draft: `stage: 'collecting'`, `intent: 'new_complaint'`, `reply` is the question in the citizen's language, `missing_fields` lists what is still unknown.
    - **Quick replies:** `share_location` (location question), `skip` (photo question), `yes` / `no` (yes/no fields). Every value except `share_location` is sent back as `text`, as A's UI already does.
    - **A draft appears once the citizen has answered or said "that's all"** (any language), or after 4 questions. A collecting turn may carry no `draft`. `confirm` / `file_new_anyway` during collecting files with what is known.
    - **Other intents:** `ask_info` → `stage: 'answered'` with the service-guide answer in `reply`. `smalltalk` → `stage: 'collecting'`. `track_status` → `stage: 'answered'` with `tracked` = the caller's **own** complaints, ranked by what they wrote. Another person's ticket number now returns `tracked: []`.
    - `continue_after_emergency` returns to `collecting` (Spec B §6), with the emergency flag kept.
  - **`Grievance.fields?: Record<string, string>` (A, C).** The department's required fields collected in chat or the quick form. `GrievanceDraft.fields` sent to `POST /grievances` is now stored. Not returned by public search. Needs migration `0004_grievance_fields.sql`.
  - **B2, #52 `GET /admin/audit/verify`.** Officers may call it **with** a `grievance_id` they can act on (department + wards, or assigned). Without one: 403. Unknown id: 404. Outside their scope: 403. Supervisors and admins are unchanged.
  - **B3, new `POST /officer/grievances/{id}/dispute`** (supervisor+, Spec C §5.3 actions). Allowed only while the case is disputed (`reopened`, `reopen_count > 0`, or a `suspicious` AI verdict) and still `resolved_pending_verification` or `reopened`; otherwise 409 `not_disputed`. An unknown action gives 422 `bad_action`; `note` needs at least 3 characters.
    ```json
    {"action": "demand_new_proof", "note": "Photo matches the citizen's; upload a new one"}
    ```
    → `GrievanceDetail` with `status: "in_progress"`, `resolved_at: null`. The last timeline event is `status_changed` with `payload.dispute = "demand_new_proof"`. The assigned officer gets an `alert` notification; the citizen gets a `status` notification.
    ```json
    {"action": "close_disputed", "note": "Site visit: partly fixed, rest is out of scope"}
    ```
    → `GrievanceDetail` with `status: "closed"`, **`closure_type: "disputed"`** (new `ClosureType` value), `closed_at` set. The last timeline event is `closed` with `payload.closure_type = "disputed"`; the citizen is notified. C's #30 workaround still works but leaves `closure_type` null. Needs migration `0005_closure_type_disputed.sql`.
  - **Spike alerts (#49).** `grievance_ids` stays at most 3 examples (Spec B §9). New `member_count: number` (matches the count in the title) and `member_ids: string[]` (every member, capped at 200). `languages` now covers all members. Other alert kinds get the same two fields.
  - **New `GET /meta/assets?ward=&type=`** (public, Spec C S8 QR sheet). Returns `Asset[]` in exactly #24's shape, sorted by id, at most 500. `type` takes the `Asset.type` values (`streetlight`, …). Unknown ward → `[]`.

- **2026-11-03 (Phase 4 + access fixes)** Same shapes; behaviour A and C will notice:
  - `POST /officer/grievances/{id}/resolve`: `media_ids` must be `resolution_proof` uploads (otherwise 422 `bad_proof`). One proof can be reused for several grievances (C's incident resolve-all); each later grievance gets its own copy, so the `Media.id` in its detail differs from the uploaded id.
  - `Incident.status` now follows its members (`resolved_pending_verification` once every active member is resolved). Merged members get one `community_update` when the incident resolves, not one per `/resolve` call.
  - Suspicious resolutions notify supervisors with a `type: 'alert'` notification.
  - Officers get 403 on `GET /grievances/{id}` and every `/officer/grievances/{id}/*` call for cases outside their wards, unless assigned to them (the inbox already worked this way). `/officer/incidents` lists only their wards. Supervisors and admins are unchanged.
  - `POST /uploads` with `grievance_id`: 403 unless the caller owns the grievance or is a government user in scope. `purpose: 'resolution_proof'` needs a government role. Uploads without `grievance_id` (A's report form) are unchanged.
  - Draft replies (`/draft-reply`) are at most 80 words.

- **2026-11-03 (AI stabilization)** `POST /translate` → `{text, source_lang}`: same shape, more accurate `source_lang`. Native-script and romanised Telugu/Hindi input report the detected language; plain Latin text reports the LLM's answer unless it names `target_lang` (then `en`). Previously English sent to Telugu could come back as `source_lang: "te"`. No other API change; the Groq model defaults and the Gemini key header are backend-only.

- **2026-11-02 (Fix Phase 4A)** `Media.url` and `PublicStats.recent_resolved[].after_url` are now absolute and expire after 24 h (`…/api/v1/uploads/{id}?exp=&sig=`), replacing the relative path. Use them directly as an image source; C's `mediaUrl()` passes them through unchanged. Don't store them, refetch instead. `GET /uploads/{id}` may answer 307 to a Supabase signed URL; a bad or expired link gets 403. `/health` gains `providers.storage` (`supabase|local`).

- **2026-11-02 (Fix Phase 2)** Behaviour now matches what A's portal sends: `POST /grievances/{id}/support` and chat `support_existing` accept an incident id (support lands on the oldest open member; #5 returns the incident total). Chat `edit` applies `action_payload.text` and `location`. `split_confirm` files one grievance per `action_payload.draft_ids` entry, with `related_ids` cross-filled and its own `guest_pin` for guests. `continue_after_emergency` with no text goes straight on. While the location is missing, `missing_fields` is always `["location_detail"]`. `stage: emergency` can now also come from the AI's `is_emergency`, in which case `matched_terms` holds hazard ids such as `live_wire`.

- **2026-11-02 (Fix Phase 1)** `POST /auth/demo-login` now returns 403 `demo_login_disabled` when `SUPABASE_URL` is set, unless `ALLOW_DEMO_LOGIN=true`. App-issued tokens are accepted only while `DEMO_MODE=true`. Frontends that sign in through Supabase are unaffected.

- **2026-11-02 (P2)** Additive optional fields: `DuplicateMatch.signals` (text_cosine, distance_m, same_category, age_days, embedding_mode); `AIVerification.assessment` (`verified|likely_resolved|needs_human_review|rejected_evidence`). New endpoint (DEMO_MODE only): `POST /api/v1/auth/demo-login {email}` → `{access_token, profile}` for seeded `@janavaani.test` accounts when Supabase Auth is not configured. Media URLs are `/api/v1/uploads/{id}` in offline mode (Supabase signed URLs when Storage is configured).

- **2026-11-02 (requests from A, `docs/contract-notes/A.md`)**
  - New additive endpoint `GET /api/v1/me` (any signed-in user incl. guest) → `{id, role, name, email, preferred_language, department_id}`; 401 without a token.
  - `ml/seed_db.py` now sets `app_metadata.role` and `user_metadata.{name, role}` on every seeded Supabase user (created via the admin API; re-seeding updates existing users).
  - Ward ids follow `W-<ZONE>-NN` with zone codes **SLP, KKP, KHB, SEC, CHR, LBN** (Charminar changed from CHM → CHR to match A's mocks). Kukatpally = `W-KKP-01`, Miyapur = `W-SLP-04`.
  - Asset ids `<TYPE>-<ZONE>-NNNN` with TYPE ∈ SL, DR, WP, BN, RD, TS (e.g. `SL-KHB-0001`).
  - Guest PIN: returned only on submit; `GET /grievances/{id}?pin=` works with no auth header (covered by tests).
