# Contract notes — Laptop C

Additive changes to the shared contract (extra types in `portals/gov-shared/types-ext.ts`). Newest first.

## Requests, not yet agreed

Full list with workarounds: `docs/progress/C.md` section 6.

**For B:**
- Allow supervisor on #43, 44, 46–48 and 50. Spec C gives supervisors a read-only `/admin`, and hybrid mode does not fall back on 403.
- Allow officer+ on #52 when `grievance_id` is set, for "Verify chain" on the case page.
- Say how #30 expresses "close as disputed" and "demand new proof".
- Support a zone value in #28 `ward`. The mock does, and the inbox ward/zone filter relies on it.

**For A:**
- Add an optional tile URL and attribution prop to `MapView`, or swap the tile source: CARTO now serves "API KEY REQUIRED" watermarks to anonymous requests.
- Update `e2e/citizen/smoke.spec.ts`: it asserts P0 placeholder test ids on `/officer` and `/admin`.
