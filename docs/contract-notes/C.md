# Contract notes — Laptop C

Additive changes to the shared contract (extra types in `portals/gov-shared/types-ext.ts`). Newest first.

## Stretch S1/S2/S8 (after the final merge)

- **Request to B:** #49 spike alerts carry only ~3 example `grievance_ids`, while the title counts 10–24. The war room therefore rebuilds the member set as the alert's ids + same-category (and same-ward) complaints from #28 in the 48 h before the alert. Please return all member ids, or add an optional `member_count`, so the counts match exactly.
- #28 single-value `status` (already noted) also applies to the war room and QR sheet. Both rely on the default (open + pending verification).
- S8 uses #24 only. There is no asset list endpoint, so the QR sheet defaults to the `asset_id`s seen on inbox complaints, or takes ids typed in. Mock and B's seed number assets differently (`SL-KHB-0001` vs `SL-SLP-0000`). Optional request: `GET /meta/assets?ward=&type=`.

## Checked against B's code (`origin/feat/ai-engine` at 6931dad, offline mode, run locally)

B has no deployed URL yet, so these came from B's API run from a scratch export, not a merge. All P3 response shapes matched the contract.

**Handled on C's side, no action needed:**
- #28 `status` takes one value; a comma list returns 0 rows. My stats now queries each status.
- #28 `ward` takes a ward id only; a zone name returns 0 rows. The inbox now filters zones client-side.
- #30 `delay_reason` must be an object (`{reason, text?}`), though `api.setStatus` declares a string. See `DelayReasonIn` in `types-ext.ts`.
- #30 follows B's `TRANSITIONS`: `registered` cannot start work, demanding proof from `resolved_pending_verification` goes via `reopened`, and `reopened` cannot close.
- Offline media URLs are relative to the API host; the gov UI prefixes them.

## Requests, not yet agreed

Full list with workarounds: `docs/progress/C.md` section 6.

**For B:**
- Deploy the Space and post the URL. P3 Step 1 cannot finish without it.
- Allow officer+ on #52 when `grievance_id` is set. Officers currently get 403 on "Verify chain" on the case page.
- Set `closure_type` for disputed closes. Closing via #30 from `resolved_pending_verification` returns 200 with `closure_type: null`, so the dispute is only recorded in the note. `ClosureType` also has no disputed value.
- `/officer/bulk` status stops at the first invalid transition (for example `needs_review` to `in_progress`) and returns 409. Say whether earlier rows stay changed.
- Add a frontend-usable login for offline mode, or confirm Supabase is coming. Without Supabase the app cannot get a token for B's API, so the UI itself has not been run against it.
- Windows setup: `ml/seed_db.py` crashes unless `PYTHONUTF8=1` is set (files read with the system codepage), and copying `.env.example` breaks offline mode because the comment after `DATABASE_URL=` is parsed as the URL.
- Return `macro_f1` in `human_test` on #53. B's metrics have 0.776, but the response keeps only accuracy, n and per_language.
- #25 `recent_resolved` has no `before_url` or `after_url` in the seed (0 of 6), so the public before/after slider, one of the demo moments, cannot show. Seed proof photos for these cases.
- Alert titles use ward ids (`W-CHR-02`); use ward names. Seeded disputed cases say "Seeded history" and mostly show Verified.
- For demo step 4, seed Ravi with a critical case and some cases inside SLA.
- The suspicious "Ameerpet" case is titled "Streetlights burning in daytime in Lingampally". Match the title to the story.
- Stretch: Surge Mode and the root-cause graph need endpoints before C can build them.
- The seed has no pending appeals (`kind=appeal` returns 0), so the demo Appeals tab will be empty.

Resolved: supervisors can already call #43–#48, #49 and #50.

**For A:**
- Update `e2e/citizen/smoke.spec.ts`: "gov routes render" and "public dashboard renders" assert P0 placeholder test ids that no longer exist. Assert the real pages, or C can do it right after the merge.

Resolved: A's `MapView` replaces the CARTO tiles.
