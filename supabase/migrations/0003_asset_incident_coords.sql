-- The API reads/writes plain lat/lng on assets and incidents (same pattern as grievances); geom/centroid stay in sync for PostGIS.
alter table assets add column if not exists lat double precision, add column if not exists lng double precision;
alter table incidents add column if not exists lat double precision, add column if not exists lng double precision;

create or replace function asset_sync_geom() returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography; end if;
  return new;
end $$;
drop trigger if exists asset_geom on assets;
create trigger asset_geom before insert or update on assets for each row execute function asset_sync_geom();

create or replace function incident_sync_centroid() returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then new.centroid := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography; end if;
  return new;
end $$;
drop trigger if exists incident_centroid on incidents;
create trigger incident_centroid before insert or update on incidents for each row execute function incident_sync_centroid();
