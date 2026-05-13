-- ============================================================
-- routefolk — migration 010
-- App membership hardening + RLS tightening
--
-- Purpose:
-- - Stop relying only on Google OAuth / Supabase Auth configuration
--   as the app membership boundary.
-- - Add an explicit database-level allowlist.
-- - Require app membership in all public-table and GPX storage policies.
--
-- Apply manually in Supabase SQL Editor before deploying app files that
-- expect schema_version = 010.
-- ============================================================

-- ------------------------------------------------------------
-- Explicit app membership table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_members (
  email      text PRIMARY KEY,
  role       text NOT NULL DEFAULT 'member'
               CHECK (role IN ('admin', 'member')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_members_active_idx ON public.app_members(active);
CREATE INDEX IF NOT EXISTS app_members_role_idx   ON public.app_members(role);

DROP TRIGGER IF EXISTS app_members_touch_updated ON public.app_members;
CREATE TRIGGER app_members_touch_updated
  BEFORE UPDATE ON public.app_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bootstrap the current owner/admin.
-- Add the other approved friends manually after running this migration:
-- INSERT INTO public.app_members(email, role) VALUES ('friend@example.com', 'member')
-- ON CONFLICT (email) DO UPDATE SET active = true, role = EXCLUDED.role;
INSERT INTO public.app_members(email, role, active)
VALUES ('eduardojmesteves@gmail.com', 'admin', true)
ON CONFLICT (email)
DO UPDATE SET
  role = 'admin',
  active = true,
  updated_at = now();

ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Safe UUID helper for storage path policies
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_uuid(value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- Membership helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_members m
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    WHERE u.id = auth.uid()
      AND m.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_members m
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    WHERE u.id = auth.uid()
      AND m.active = true
      AND m.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_app_member_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_members m
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    WHERE u.id = p_user_id
      AND m.active = true
  );
$$;

-- ------------------------------------------------------------
-- Harden existing RLS helper functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_member()
    AND EXISTS (
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
  SELECT public.is_app_member()
    AND EXISTS (
      SELECT 1
      FROM public.stages s
      WHERE s.id = p_stage_id
        AND public.can_access_trip(s.trip_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_choose_expense_payer(p_trip_id uuid, p_payer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_member()
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = p_trip_id
        AND (
          (
            t.visibility = 'group'
            AND public.is_active_app_member_user(p_payer_id)
          )
          OR (
            t.visibility = 'private'
            AND t.created_by = auth.uid()
            AND p_payer_id = auth.uid()
          )
        )
    );
$$;

-- ------------------------------------------------------------
-- app_members policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS app_members_select ON public.app_members;
CREATE POLICY app_members_select ON public.app_members
  FOR SELECT TO authenticated
  USING (public.is_app_admin() OR lower(email) = lower((auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS app_members_insert ON public.app_members;
CREATE POLICY app_members_insert ON public.app_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS app_members_update ON public.app_members;
CREATE POLICY app_members_update ON public.app_members
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS app_members_delete ON public.app_members;
CREATE POLICY app_members_delete ON public.app_members
  FOR DELETE TO authenticated
  USING (public.is_app_admin());

-- ------------------------------------------------------------
-- Recreate public-table policies with explicit membership checks
-- ------------------------------------------------------------

-- app_meta
DROP POLICY IF EXISTS app_meta_select ON public.app_meta;
CREATE POLICY app_meta_select ON public.app_meta
  FOR SELECT TO authenticated
  USING (public.is_app_member());

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

-- profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_app_member());

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_member() AND id = auth.uid());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_app_member() AND id = auth.uid())
  WITH CHECK (public.is_app_member() AND id = auth.uid());

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (false);

-- trips
DROP POLICY IF EXISTS trips_select ON public.trips;
CREATE POLICY trips_select ON public.trips
  FOR SELECT TO authenticated
  USING (public.is_app_member() AND (visibility = 'group' OR created_by = auth.uid()));

DROP POLICY IF EXISTS trips_insert ON public.trips;
CREATE POLICY trips_insert ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_member());

DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips
  FOR UPDATE TO authenticated
  USING (public.is_app_member() AND (visibility = 'group' OR created_by = auth.uid()))
  WITH CHECK (public.is_app_member() AND (visibility = 'group' OR created_by = auth.uid()));

DROP POLICY IF EXISTS trips_delete ON public.trips;
CREATE POLICY trips_delete ON public.trips
  FOR DELETE TO authenticated
  USING (public.is_app_member() AND created_by = auth.uid());

-- stages
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

-- journal_entries
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

-- expenses
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_trip(trip_id) AND public.can_choose_expense_payer(trip_id, user_id));

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id) AND public.can_choose_expense_payer(trip_id, user_id));

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (public.can_access_trip(trip_id));

-- video_notes
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

-- gpx_tracks
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

-- ------------------------------------------------------------
-- Storage object policies for private GPX bucket
-- ------------------------------------------------------------
DROP POLICY IF EXISTS gpx_objects_select ON storage.objects;
CREATE POLICY gpx_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gpx-tracks'
    AND public.is_app_member()
    AND public.can_access_trip(public.safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS gpx_objects_insert ON storage.objects;
CREATE POLICY gpx_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gpx-tracks'
    AND public.is_app_member()
    AND public.can_access_trip(public.safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS gpx_objects_update ON storage.objects;
CREATE POLICY gpx_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gpx-tracks'
    AND public.is_app_member()
    AND public.can_access_trip(public.safe_uuid((storage.foldername(name))[1]))
  )
  WITH CHECK (
    bucket_id = 'gpx-tracks'
    AND public.is_app_member()
    AND public.can_access_trip(public.safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS gpx_objects_delete ON storage.objects;
CREATE POLICY gpx_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gpx-tracks'
    AND public.is_app_member()
    AND public.can_access_trip(public.safe_uuid((storage.foldername(name))[1]))
  );

-- ------------------------------------------------------------
-- Schema marker
-- ------------------------------------------------------------
INSERT INTO public.app_meta(key, value)
VALUES ('schema_version', '010')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ============================================================
-- Done.
-- ============================================================
