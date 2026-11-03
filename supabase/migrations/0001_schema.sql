-- JanaVaani schema (Spec B §4). Apply with: python ml/apply_migrations.py   (needs DATABASE_URL = Supabase Session pooler)
create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key,                         -- = auth.users.id
  role text not null check (role in ('citizen','guest','officer','supervisor','admin')),
  name text not null, email text unique, preferred_language text default 'en',
  department_id text, ward_ids text[] default '{}', zone text, designation text, office_name text, office_phone text,
  is_active boolean default true, created_at timestamptz default now()
);
create table if not exists departments (id text primary key, data jsonb not null);
create table if not exists wards (
  id text primary key, name text not null, zone text not null,
  geom geometry(MultiPolygon,4326), centroid geography(Point)
);
create table if not exists assets (
  id text primary key, type text not null check (type in ('streetlight','drain','water_pipe','bin','road_segment','signal')),
  label_en text not null, ward_id text references wards(id), geom geography(Point)
);
create table if not exists incidents (
  id text primary key, title_en text not null, category text not null, ward_id text references wards(id),
  centroid geography(Point), status text not null default 'assigned', created_at timestamptz default now()
);
create sequence if not exists grievance_seq;
create table if not exists grievances (
  id text primary key default ('GRV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('grievance_seq')::text, 6, '0')),
  citizen_id uuid references profiles(id) on delete set null, guest_pin_hash text,
  language text not null, script text not null check (script in ('native','latin','mixed')), is_code_mixed boolean default false,
  description_original text not null, description_masked text not null, description_en text,
  title jsonb, formal_text jsonb, summary_en text, category text not null, sub_department text,
  secondary_departments text[] default '{}', routing jsonb not null,
  status text not null check (status in ('registered','needs_review','assigned','in_progress','resolved_pending_verification','closed','reopened','rejected','merged')),
  closure_type text check (closure_type in ('citizen_verified','auto_closed_unverified','rejected')),
  priority text not null check (priority in ('critical','high','medium','low')), priority_score int not null check (priority_score between 0 and 100),
  priority_factors jsonb default '[]', priority_base jsonb default '{}',
  is_emergency boolean default false, emergency_confirmed boolean, hazards text[] default '{}', vulnerable text[] default '{}',
  sentiment text, distress_score real default 0,
  geom geography(Point), lat double precision, lng double precision, location jsonb, ward_id text references wards(id), zone text,
  asset_id text references assets(id), assigned_officer_id uuid references profiles(id) on delete set null,
  escalation_level int default 0 check (escalation_level between 0 and 3), sla_hours int not null, sla_due_at timestamptz not null,
  eta_at timestamptz, delay_reason jsonb, incident_id text references incidents(id) on delete set null,
  support_count int default 1 check (support_count >= 1), related_ids text[] default '{}',
  is_anonymous boolean default false, is_private boolean default false, rating int check (rating between 1 and 5),
  feedback_comment text, reopen_count int default 0, ai_verification jsonb,
  embedding vector(384), embedding_kind text, pipeline_ms int,
  first_response_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  resolved_at timestamptz, closed_at timestamptz
);
create table if not exists grievance_supporters (
  id bigserial primary key, grievance_id text references grievances(id) on delete cascade, user_key text not null,
  created_at timestamptz default now(), unique (grievance_id, user_key)
);
create table if not exists media (
  id uuid primary key default gen_random_uuid(), grievance_id text references grievances(id) on delete cascade,
  storage_path text not null, uploaded_by_role text not null, uploaded_by uuid,
  purpose text not null check (purpose in ('evidence','resolution_proof','verification')),
  quality jsonb, ai jsonb, geo jsonb, phash text, created_at timestamptz default now()
);
create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(), grievance_id text not null references grievances(id) on delete cascade,
  seq int not null, type text not null, actor_role text not null, actor_id uuid, actor_name text,
  message_en text not null, message jsonb, internal boolean default false, payload jsonb default '{}',
  created_at timestamptz default now(), prev_hash text, hash text not null, unique (grievance_id, seq)
);
-- append-only audit: block UPDATE/DELETE from API roles (the tamper demo uses a superuser connection on purpose)
create or replace function forbid_timeline_change() returns trigger language plpgsql as $$
begin raise exception 'timeline_events is append-only'; end $$;
drop trigger if exists timeline_append_only on timeline_events;
create trigger timeline_append_only before update or delete on timeline_events
  for each row when (current_setting('janavaani.allow_tamper', true) is distinct from 'on') execute function forbid_timeline_change();

create table if not exists messages (
  id uuid primary key default gen_random_uuid(), grievance_id text references grievances(id) on delete cascade,
  session_id uuid, sender text not null, sender_name text, text jsonb not null, created_at timestamptz default now()
);
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid, state jsonb default '{}', messages jsonb default '[]',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists appeals (
  id uuid primary key default gen_random_uuid(), grievance_id text references grievances(id) on delete cascade,
  reason jsonb not null, status text not null default 'filed' check (status in ('filed','under_review','upheld','dismissed')),
  decision_note jsonb, decided_by uuid, created_at timestamptz default now(), decided_at timestamptz
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, grievance_id text, type text not null,
  title jsonb not null, body jsonb not null, read boolean default false, created_at timestamptz default now()
);
create table if not exists live_events (
  id bigserial primary key, audience text not null, kind text not null, grievance_id text, created_at timestamptz default now()
);
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(), kind text not null, severity text not null, title_en text not null,
  detail_en text not null, ward_id text, category text, grievance_ids text[] default '{}', dedupe_key text unique,
  created_at timestamptz default now()
);
create table if not exists routing_corrections (
  id bigserial primary key, grievance_id text references grievances(id) on delete cascade, from_department text not null,
  to_department text not null, text_original text not null, by_user uuid, created_at timestamptz default now()
);
create table if not exists ai_calls (
  id bigserial primary key, task text not null, provider text not null, model text, latency_ms int, ok boolean,
  fallback_used boolean default false, error_code text, created_at timestamptz default now()
);
create table if not exists model_versions (
  version text primary key, metrics jsonb not null, corrections_used int default 0, trained_at timestamptz default now(),
  is_active boolean default false
);
create table if not exists translations (hash text, target_lang text, text text not null, primary key (hash, target_lang));
create table if not exists settings (key text primary key, value jsonb not null);

-- indexes
create index if not exists ix_grv_geom on grievances using gist (geom);
create index if not exists ix_wards_geom on wards using gist (geom);
create index if not exists ix_grv_embedding on grievances using hnsw (embedding vector_cosine_ops);
create index if not exists ix_grv_status_priority on grievances (status, priority);
create index if not exists ix_grv_cat_ward_created on grievances (category, ward_id, created_at);
create index if not exists ix_grv_officer on grievances (assigned_officer_id);
create index if not exists ix_events_grv on timeline_events (grievance_id, seq);
create index if not exists ix_live_audience on live_events (audience, id);

-- keep geom in sync with lat/lng written by the API
create or replace function grv_sync_geom() returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists grv_geom on grievances;
create trigger grv_geom before insert or update on grievances for each row execute function grv_sync_geom();
