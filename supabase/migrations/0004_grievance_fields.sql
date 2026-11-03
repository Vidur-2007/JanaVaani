-- Department required fields collected during intake (Spec B §5.2) and analysis (§5.1 `fields`), persisted on the
-- grievance so the officer brief can use them (§8). Additive and idempotent: existing rows get an empty object.
alter table grievances add column if not exists fields jsonb not null default '{}'::jsonb;
