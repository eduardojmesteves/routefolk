\set ON_ERROR_STOP on

DO $$
DECLARE failures bigint;
BEGIN
  SELECT count(*) INTO failures FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan profiles: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.app_members m LEFT JOIN auth.users u ON lower(u.email) = lower(m.email) WHERE m.active AND u.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'unmatched active members: %', failures; END IF;
  SELECT count(*) INTO failures FROM auth.identities i LEFT JOIN auth.users u ON u.id = i.user_id WHERE u.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan identities: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.trips t LEFT JOIN auth.users u ON u.id = t.created_by WHERE u.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan trip creators: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.stages s LEFT JOIN public.trips t ON t.id = s.trip_id WHERE t.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan stages: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.journal_entries j LEFT JOIN public.stages s ON s.id = j.stage_id WHERE s.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan journal entries: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.expenses e LEFT JOIN public.trips t ON t.id = e.trip_id WHERE t.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan expense trips: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.expenses e LEFT JOIN auth.users u ON u.id = e.user_id WHERE u.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan expense payers: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.expenses e LEFT JOIN public.stages s ON s.id = e.stage_id WHERE e.stage_id IS NOT NULL AND (s.id IS NULL OR s.trip_id IS DISTINCT FROM e.trip_id);
  IF failures > 0 THEN RAISE EXCEPTION 'invalid expense stages: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.trip_items i LEFT JOIN public.trips t ON t.id = i.trip_id WHERE t.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'orphan trip items: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.trip_items i LEFT JOIN public.item_categories c ON c.id = i.category_id WHERE i.category_id IS NOT NULL AND (c.id IS NULL OR c.trip_id IS DISTINCT FROM i.trip_id);
  IF failures > 0 THEN RAISE EXCEPTION 'invalid item categories: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.gpx_tracks g LEFT JOIN public.stages s ON s.id = g.stage_id WHERE s.id IS NULL OR s.trip_id IS DISTINCT FROM g.trip_id;
  IF failures > 0 THEN RAISE EXCEPTION 'invalid GPX stages: %', failures; END IF;
  SELECT count(*) INTO failures FROM public.gpx_tracks g LEFT JOIN storage.objects o ON o.bucket_id = 'gpx-tracks' AND o.name = g.file_path WHERE o.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'GPX tracks without Storage metadata: %', failures; END IF;
  SELECT count(*) INTO failures FROM storage.objects o LEFT JOIN public.gpx_tracks g ON g.file_path = o.name WHERE o.bucket_id = 'gpx-tracks' AND g.id IS NULL;
  IF failures > 0 THEN RAISE EXCEPTION 'Storage objects without GPX tracks: %', failures; END IF;
  SELECT count(*) INTO failures FROM storage.objects o WHERE o.bucket_id = 'gpx-tracks' AND (o.version IS NULL OR o.level IS DISTINCT FROM storage.get_level(o.name));
  IF failures > 0 THEN RAISE EXCEPTION 'invalid GPX version/level rows: %', failures; END IF;
END $$;

SELECT 'validation=passed' AS result;
