SELECT 'app_members' AS object, count(*)::text AS row_count FROM public.app_members
UNION ALL SELECT 'app_meta', count(*)::text FROM public.app_meta
UNION ALL SELECT 'auth.identities', count(*)::text FROM auth.identities
UNION ALL SELECT 'auth.users', count(*)::text FROM auth.users
UNION ALL SELECT 'expenses', count(*)::text FROM public.expenses
UNION ALL SELECT 'gpx_tracks', count(*)::text FROM public.gpx_tracks
UNION ALL SELECT 'item_categories', count(*)::text FROM public.item_categories
UNION ALL SELECT 'journal_entries', count(*)::text FROM public.journal_entries
UNION ALL SELECT 'profiles', count(*)::text FROM public.profiles
UNION ALL SELECT 'stages', count(*)::text FROM public.stages
UNION ALL SELECT 'storage.buckets', count(*)::text FROM storage.buckets
UNION ALL SELECT 'storage.objects', count(*)::text FROM storage.objects
UNION ALL SELECT 'trip_items', count(*)::text FROM public.trip_items
UNION ALL SELECT 'trip_members', count(*)::text FROM public.trip_members
UNION ALL SELECT 'trips', count(*)::text FROM public.trips
UNION ALL SELECT 'video_notes', count(*)::text FROM public.video_notes
ORDER BY 1;
