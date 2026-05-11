-- ============================================================
-- routefolk — migration 007: schema safety pack
--
-- Purpose:
-- - Fix FK/nullability consistency for auth user references.
-- - Add DB-level checks for core domain invariants.
-- - Normalize and protect stage ordering.
-- - Add a lightweight schema compatibility marker.
--
-- Run manually in Supabase SQL Editor before deploying code that
-- expects schema_version 007.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Schema compatibility marker
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_meta (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_meta_select ON public.app_meta;
CREATE POLICY app_meta_select ON public.app_meta
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_meta_insert ON public.app_meta;
CREATE POLICY app_meta_insert ON public.app_meta
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS app_meta_update ON public.app_meta;
CREATE POLICY app_meta_update ON public.app_meta
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS app_meta_delete ON public.app_meta;
CREATE POLICY app_meta_delete ON public.app_meta
  FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.touch_app_meta_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_meta_touch_updated ON public.app_meta;
CREATE TRIGGER app_meta_touch_updated
  BEFORE UPDATE ON public.app_meta
  FOR EACH ROW EXECUTE FUNCTION public.touch_app_meta_updated_at();


-- ------------------------------------------------------------
-- 2) Helper: drop FK constraint for a table column by lookup
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.__routefolk_drop_fk(p_table regclass, p_column text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_constraint text;
BEGIN
  SELECT c.conname
  INTO v_constraint
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = p_table
    AND c.contype = 'f'
    AND a.attname = p_column
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, v_constraint);
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 3) Auth-user FK/nullability consistency
-- ------------------------------------------------------------
-- trips.created_by is essential for private visibility and creator-only delete.
-- Do not allow deleting an auth user while they own trips.
SELECT public.__routefolk_drop_fk('public.trips'::regclass, 'created_by');
ALTER TABLE public.trips
  ALTER COLUMN created_by SET NOT NULL,
  ADD CONSTRAINT trips_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- journal_entries.author_id is display metadata. Keep entries if the author
-- auth user is removed; author becomes unknown/null.
SELECT public.__routefolk_drop_fk('public.journal_entries'::regclass, 'author_id');
ALTER TABLE public.journal_entries
  ALTER COLUMN author_id DROP NOT NULL,
  ADD CONSTRAINT journal_entries_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- expenses.user_id is the payer. Do not silently null financial attribution.
SELECT public.__routefolk_drop_fk('public.expenses'::regclass, 'user_id');
ALTER TABLE public.expenses
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT expenses_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

DROP FUNCTION IF EXISTS public.__routefolk_drop_fk(regclass, text);


-- ------------------------------------------------------------
-- 4) Core domain constraints
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_date_order_check' AND conrelid = 'public.trips'::regclass) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_date_order_check
      CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_order_index_nonnegative_check' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_order_index_nonnegative_check
      CHECK (order_index >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_distance_nonnegative_check' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_distance_nonnegative_check
      CHECK (distance_km IS NULL OR distance_km >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_start_lat_range_check' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_start_lat_range_check
      CHECK (start_lat IS NULL OR (start_lat >= -90 AND start_lat <= 90))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_start_lng_range_check' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_start_lng_range_check
      CHECK (start_lng IS NULL OR (start_lng >= -180 AND start_lng <= 180))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_end_lat_range_check' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_end_lat_range_check
      CHECK (end_lat IS NULL OR (end_lat >= -90 AND end_lat <= 90))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_end_lng_range_check' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_end_lng_range_check
      CHECK (end_lng IS NULL OR (end_lng >= -180 AND end_lng <= 180))
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpx_tracks_distance_nonnegative_check' AND conrelid = 'public.gpx_tracks'::regclass) THEN
    ALTER TABLE public.gpx_tracks
      ADD CONSTRAINT gpx_tracks_distance_nonnegative_check
      CHECK (distance_km IS NULL OR distance_km >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpx_tracks_duration_nonnegative_check' AND conrelid = 'public.gpx_tracks'::regclass) THEN
    ALTER TABLE public.gpx_tracks
      ADD CONSTRAINT gpx_tracks_duration_nonnegative_check
      CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
      NOT VALID;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 5) Stage order normalization + uniqueness protection
-- ------------------------------------------------------------
-- Normalize existing stage order per trip before adding uniqueness.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY trip_id
      ORDER BY order_index ASC, created_at ASC, id ASC
    ) - 1 AS new_order_index
  FROM public.stages
)
UPDATE public.stages s
SET order_index = r.new_order_index
FROM ranked r
WHERE s.id = r.id
  AND s.order_index IS DISTINCT FROM r.new_order_index;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_trip_order_unique' AND conrelid = 'public.stages'::regclass) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_trip_order_unique
      UNIQUE (trip_id, order_index)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 6) Mark schema version
-- ------------------------------------------------------------
INSERT INTO public.app_meta(key, value)
VALUES ('schema_version', '007')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
