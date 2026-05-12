-- ============================================================
-- routefolk — migration 009: stage GPX upload
--
-- Purpose:
-- - Create the private Supabase Storage bucket for GPX files.
-- - Treat GPX tracks as stage-level records.
-- - Enforce that GPX stage_id belongs to the same trip_id.
-- - Add storage RLS policies scoped by the trip id encoded in the path.
-- - Set app_meta.schema_version = 009.
--
-- File path convention:
--   gpx-tracks/{trip_id}/{stage_id}/{filename}.gpx
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Private GPX Storage bucket
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gpx-tracks',
  'gpx-tracks',
  false,
  8388608,
  ARRAY['application/gpx+xml', 'application/xml', 'text/xml']::text[]
)
ON CONFLICT (id)
DO UPDATE SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['application/gpx+xml', 'application/xml', 'text/xml']::text[];

-- ------------------------------------------------------------
-- 2) GPX tracks are stage-level records
-- ------------------------------------------------------------
-- Existing rows, if any, are left untouched by using NOT VALID.
-- New rows cannot have stage_id null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gpx_tracks_stage_required_check'
      AND conrelid = 'public.gpx_tracks'::regclass
  ) THEN
    ALTER TABLE public.gpx_tracks
      ADD CONSTRAINT gpx_tracks_stage_required_check
      CHECK (stage_id IS NOT NULL)
      NOT VALID;
  END IF;
END;
$$;

-- If the original FK exists as ON DELETE SET NULL, replace it with CASCADE.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT c.conname
  INTO v_constraint
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'public.gpx_tracks'::regclass
    AND c.contype = 'f'
    AND a.attname = 'stage_id'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gpx_tracks DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.gpx_tracks
    ADD CONSTRAINT gpx_tracks_stage_id_fkey
    FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;
END;
$$;

-- Ensure the selected stage belongs to the same trip.
CREATE OR REPLACE FUNCTION public.validate_gpx_stage_trip()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage_id IS NULL THEN
    RAISE EXCEPTION 'GPX tracks must be linked to a stage.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stages s
    WHERE s.id = NEW.stage_id
      AND s.trip_id = NEW.trip_id
  ) THEN
    RAISE EXCEPTION 'GPX stage must belong to the same trip.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gpx_tracks_validate_stage_trip ON public.gpx_tracks;
CREATE TRIGGER gpx_tracks_validate_stage_trip
  BEFORE INSERT OR UPDATE OF trip_id, stage_id ON public.gpx_tracks
  FOR EACH ROW EXECUTE FUNCTION public.validate_gpx_stage_trip();

-- ------------------------------------------------------------
-- 3) Storage object policies
-- ------------------------------------------------------------
-- The first path segment is the trip id. Example:
--   {trip_id}/{stage_id}/track.gpx
-- Access follows the same private/group trip rules as the database rows.
DROP POLICY IF EXISTS gpx_objects_select ON storage.objects;
CREATE POLICY gpx_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gpx-tracks'
    AND public.can_access_trip(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS gpx_objects_insert ON storage.objects;
CREATE POLICY gpx_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gpx-tracks'
    AND public.can_access_trip(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS gpx_objects_update ON storage.objects;
CREATE POLICY gpx_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gpx-tracks'
    AND public.can_access_trip(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'gpx-tracks'
    AND public.can_access_trip(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS gpx_objects_delete ON storage.objects;
CREATE POLICY gpx_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gpx-tracks'
    AND public.can_access_trip(((storage.foldername(name))[1])::uuid)
  );

-- ------------------------------------------------------------
-- 4) Mark schema version
-- ------------------------------------------------------------
INSERT INTO public.app_meta(key, value)
VALUES ('schema_version', '009')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
