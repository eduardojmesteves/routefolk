BEGIN;
TRUNCATE TABLE
  auth.identities, auth.users, public.app_members, public.app_meta,
  public.expenses, public.gpx_tracks, public.item_categories,
  public.journal_entries, public.profiles, public.stages,
  public.trip_items, public.trip_members, public.trips, public.video_notes,
  storage.objects, storage.buckets
RESTART IDENTITY CASCADE;
COMMIT;
