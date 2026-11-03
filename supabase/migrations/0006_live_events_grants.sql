-- Realtime: clients subscribe to live_events (master §9 Realtime). Row-level security (0002) limits each user to their
-- audiences, but Postgres also needs a table privilege; this project does not grant one by default. Read-only, idempotent.
grant select on public.live_events to anon, authenticated;
