-- ============================================================
-- routefolk — migration 013
-- Cache lightweight GPX geometry on gpx_tracks.
-- ============================================================

begin;

alter table public.gpx_tracks
  add column if not exists point_count integer,
  add column if not exists bbox jsonb,
  add column if not exists simplified_points jsonb,
  add column if not exists heat_points jsonb;

-- Keep the checks permissive enough for old records where these columns are null.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gpx_tracks_point_count_non_negative'
  ) then
    alter table public.gpx_tracks
      add constraint gpx_tracks_point_count_non_negative
      check (point_count is null or point_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gpx_tracks_bbox_is_object'
  ) then
    alter table public.gpx_tracks
      add constraint gpx_tracks_bbox_is_object
      check (bbox is null or jsonb_typeof(bbox) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gpx_tracks_simplified_points_is_array'
  ) then
    alter table public.gpx_tracks
      add constraint gpx_tracks_simplified_points_is_array
      check (simplified_points is null or jsonb_typeof(simplified_points) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gpx_tracks_heat_points_is_array'
  ) then
    alter table public.gpx_tracks
      add constraint gpx_tracks_heat_points_is_array
      check (heat_points is null or jsonb_typeof(heat_points) = 'array');
  end if;
end $$;

insert into public.app_meta (key, value)
values ('schema_version', '013')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

commit;
