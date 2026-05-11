-- ============================================================
-- routefolk — migration 003
-- Adds lightweight user profiles and simple trip visibility.
--
-- Visibility model:
-- - private: only the trip creator can see/edit the trip and children
-- - group: every authenticated approved app user can see/edit the trip and children
--
-- Trip deletion is creator-only.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- Profiles: public display data for signed-in users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  full_name  text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- ------------------------------------------------------------
-- Trips: simple visibility flag
-- ------------------------------------------------------------
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'group';

DO $$
BEGIN
  ALTER TABLE public.trips
    ADD CONSTRAINT trips_visibility_check
    CHECK (visibility IN ('private', 'group'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS trips_visibility_idx ON public.trips(visibility);

-- Preserve current behaviour for existing rows.
UPDATE public.trips
SET visibility = 'group'
WHERE visibility IS NULL;

-- ------------------------------------------------------------
-- updated_at helper for profiles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated ON public.profiles;
CREATE TRIGGER profiles_touch_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Protect trip ownership: creator is set on INSERT and preserved on UPDATE.
-- This makes creator-only delete meaningful even for direct API calls.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preserve_trip_created_by()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_preserve_created_by ON public.trips;
CREATE TRIGGER trips_preserve_created_by
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.preserve_trip_created_by();

-- ------------------------------------------------------------
-- Access helper functions used by RLS policies
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND (
        t.visibility = 'group'
        OR t.created_by = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_stage(p_stage_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stages s
    WHERE s.id = p_stage_id
      AND public.can_access_trip(s.trip_id)
  );
$$;

-- ============================================================
-- Row-Level Security policies
-- ============================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpx_tracks      ENABLE ROW LEVEL SECURITY;

-- profiles: all authenticated users can read the people list;
-- each user can insert/update only their own profile.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (false);

-- trips
DROP POLICY IF EXISTS trips_select ON public.trips;
CREATE POLICY trips_select ON public.trips
  FOR SELECT TO authenticated
  USING (visibility = 'group' OR created_by = auth.uid());

DROP POLICY IF EXISTS trips_insert ON public.trips;
CREATE POLICY trips_insert ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips
  FOR UPDATE TO authenticated
  USING (visibility = 'group' OR created_by = auth.uid())
  WITH CHECK (visibility = 'group' OR created_by = auth.uid());

DROP POLICY IF EXISTS trips_delete ON public.trips;
CREATE POLICY trips_delete ON public.trips
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- stages inherit access from the parent trip
DROP POLICY IF EXISTS stages_select ON public.stages;
CREATE POLICY stages_select ON public.stages
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS stages_insert ON public.stages;
CREATE POLICY stages_insert ON public.stages
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS stages_update ON public.stages;
CREATE POLICY stages_update ON public.stages
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS stages_delete ON public.stages;
CREATE POLICY stages_delete ON public.stages
  FOR DELETE TO authenticated
  USING (public.can_access_trip(trip_id));

-- journal entries inherit access through stage -> trip
DROP POLICY IF EXISTS journal_select ON public.journal_entries;
CREATE POLICY journal_select ON public.journal_entries
  FOR SELECT TO authenticated
  USING (public.can_access_stage(stage_id));

DROP POLICY IF EXISTS journal_insert ON public.journal_entries;
CREATE POLICY journal_insert ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_stage(stage_id));

DROP POLICY IF EXISTS journal_update ON public.journal_entries;
CREATE POLICY journal_update ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (public.can_access_stage(stage_id))
  WITH CHECK (public.can_access_stage(stage_id));

DROP POLICY IF EXISTS journal_delete ON public.journal_entries;
CREATE POLICY journal_delete ON public.journal_entries
  FOR DELETE TO authenticated
  USING (public.can_access_stage(stage_id));

-- expenses inherit access from the parent trip
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (public.can_access_trip(trip_id));

-- video notes inherit access from the parent trip
DROP POLICY IF EXISTS video_notes_select ON public.video_notes;
CREATE POLICY video_notes_select ON public.video_notes
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS video_notes_insert ON public.video_notes;
CREATE POLICY video_notes_insert ON public.video_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS video_notes_update ON public.video_notes;
CREATE POLICY video_notes_update ON public.video_notes
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS video_notes_delete ON public.video_notes;
CREATE POLICY video_notes_delete ON public.video_notes
  FOR DELETE TO authenticated
  USING (public.can_access_trip(trip_id));

-- GPX tracks inherit access from the parent trip
DROP POLICY IF EXISTS gpx_select ON public.gpx_tracks;
CREATE POLICY gpx_select ON public.gpx_tracks
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS gpx_insert ON public.gpx_tracks;
CREATE POLICY gpx_insert ON public.gpx_tracks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS gpx_update ON public.gpx_tracks;
CREATE POLICY gpx_update ON public.gpx_tracks
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS gpx_delete ON public.gpx_tracks;
CREATE POLICY gpx_delete ON public.gpx_tracks
  FOR DELETE TO authenticated
  USING (public.can_access_trip(trip_id));

-- ============================================================
-- Done.
-- ============================================================
