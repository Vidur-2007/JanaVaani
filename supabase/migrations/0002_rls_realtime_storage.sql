-- RLS on every table (backend uses the service role, which bypasses RLS). Only live_events is readable by clients.
do $$ declare t text; begin
  foreach t in array array['profiles','departments','wards','assets','incidents','grievances','grievance_supporters','media',
    'timeline_events','messages','chat_sessions','appeals','notifications','live_events','alerts','routing_corrections',
    'ai_calls','model_versions','translations','settings'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists live_events_read on live_events;
create policy live_events_read on live_events for select to authenticated using (
  audience = 'user:' || auth.uid()::text
  or audience = 'public'
  or (audience like 'dept:%' and exists (select 1 from profiles p where p.id = auth.uid()
        and p.role in ('officer','supervisor','admin')
        and (p.role in ('supervisor','admin') or audience = 'dept:' || p.department_id)))
  or (audience = 'role:admin' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','supervisor')))
);
drop policy if exists live_events_public on live_events;
create policy live_events_public on live_events for select to anon using (audience = 'public');

-- realtime publication
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table live_events; exception when duplicate_object then null; end;
  end if;
end $$;

-- private storage bucket for evidence (signed URLs, 24 h)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false) on conflict (id) do nothing;
  end if;
end $$;
