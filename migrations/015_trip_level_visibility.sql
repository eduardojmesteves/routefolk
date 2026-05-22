-- ============================================================
-- routefolk — migration 015
-- Trip-level visibility modes
--
-- Purpose:
-- - Add selected-users trip visibility without introducing trip roles.
-- - Keep the existing `group` database value and use it as
--   "shared with everyone" in the UI.
-- - Enforce access through RLS and helper functions.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Visibility constraint: private | selected | group
-- ------------------------------------------------------------
ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_visibility_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_visibility_check
  CHECK (visibility IN ('private', 'selected', 'group'));

-- ------------------------------------------------------------
-- Selected trip members
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_members (
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  member_email text NOT NULL,
  added_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, member_email),
  CONSTRAINT trip_members_email_not_blank CHECK (length(trim(member_email)) > 0)
);

CREATE INDEX IF NOT EXISTS trip_members_trip_id_idx ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS trip_members_member_email_lower_idx ON public.trip_members(lower(member_email));

-- Normalise selected-user emails and audit who added them.
CREATE OR REPLACE FUNCTION public.prepare_trip_member_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.member_email := lower(trim(NEW.member_email));
  NEW.added_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_members_prepare_insert ON public.trip_members;
CREATE TRIGGER trip_members_prepare_insert
  BEFORE INSERT ON public.trip_members
  FOR EACH ROW EXECUTE FUNCTION public.prepare_trip_member_insert();

CREATE OR REPLACE FUNCTION public.prevent_trip_member_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Trip members cannot be updated. Delete and reinsert selected members instead.';
END;
$$;

DROP TRIGGER IF EXISTS trip_members_prevent_update ON public.trip_members;
CREATE TRIGGER trip_members_prevent_update
  BEFORE UPDATE ON public.trip_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_trip_member_update();

-- ------------------------------------------------------------
-- Access helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_app_member_email(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_members m
    WHERE lower(m.email) = lower(p_email)
      AND m.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_trip_creator(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND t.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_selected_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = p_trip_id
      AND lower(tm.member_email) = lower(auth.jwt() ->> 'email')
      AND public.is_active_app_member_email(tm.member_email)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_trip_access(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN auth.users u ON u.id = p_user_id
    WHERE t.id = p_trip_id
      AND public.is_active_app_member_user(p_user_id)
      AND (
        t.visibility = 'group'
        OR t.created_by = p_user_id
        OR (
          t.visibility = 'selected'
          AND EXISTS (
            SELECT 1
            FROM public.trip_members tm
            WHERE tm.trip_id = t.id
              AND lower(tm.member_email) = lower(u.email)
              AND public.is_active_app_member_email(tm.member_email)
          )
        )
      )
  );
$$;

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
          OR (
            t.visibility = 'selected'
            AND public.is_selected_trip_member(t.id)
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_trip_members(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_member() AND public.is_trip_creator(p_trip_id);
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
          OR (
            t.visibility = 'selected'
            AND public.user_has_trip_access(t.id, p_payer_id)
          )
        )
    );
$$;

-- List active app members for selected-trip sharing controls.
-- Normal members may see this lightweight allowlist because sharing
-- cannot work without a selectable audience.
CREATE OR REPLACE FUNCTION public.list_active_app_members()
RETURNS TABLE (
  email text,
  user_id uuid,
  full_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.email,
    u.id AS user_id,
    p.full_name,
    p.avatar_url
  FROM public.app_members m
  LEFT JOIN auth.users u ON lower(u.email) = lower(m.email)
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE public.is_app_member()
    AND m.active = true
  ORDER BY COALESCE(p.full_name, m.email), m.email;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_app_members() TO authenticated;

-- ------------------------------------------------------------
-- Guard visibility management
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_trip_visibility_management()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.visibility = 'selected' THEN
      RAISE EXCEPTION 'Create selected-user trips as private first, add selected users, then switch visibility to selected.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    IF OLD.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Only the trip creator can change trip visibility.';
    END IF;

    IF NEW.visibility = 'selected' AND NOT EXISTS (
      SELECT 1
      FROM public.trip_members tm
      WHERE tm.trip_id = OLD.id
        AND public.is_active_app_member_email(tm.member_email)
    ) THEN
      RAISE EXCEPTION 'Selected-users visibility requires at least one active selected member.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_enforce_visibility_management ON public.trips;
CREATE TRIGGER trips_enforce_visibility_management
  BEFORE INSERT OR UPDATE OF visibility ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_visibility_management();

-- If an item is assigned to someone, that person must have access to the trip.
CREATE OR REPLACE FUNCTION public.validate_trip_item_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.user_has_trip_access(NEW.trip_id, NEW.assigned_to) THEN
    RAISE EXCEPTION 'Assigned user must have access to the trip.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_items_validate_assignment ON public.trip_items;
CREATE TRIGGER trip_items_validate_assignment
  BEFORE INSERT OR UPDATE OF trip_id, assigned_to ON public.trip_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_trip_item_assignment();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_members_select ON public.trip_members;
CREATE POLICY trip_members_select ON public.trip_members
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS trip_members_insert ON public.trip_members;
CREATE POLICY trip_members_insert ON public.trip_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_trip_members(trip_id)
    AND public.is_active_app_member_email(member_email)
    AND lower(member_email) <> lower(auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS trip_members_update ON public.trip_members;
CREATE POLICY trip_members_update ON public.trip_members
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS trip_members_delete ON public.trip_members;
CREATE POLICY trip_members_delete ON public.trip_members
  FOR DELETE TO authenticated
  USING (public.can_manage_trip_members(trip_id));

DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(id))
  WITH CHECK (public.can_access_trip(id));

-- ------------------------------------------------------------
-- Schema marker
-- ------------------------------------------------------------
INSERT INTO public.app_meta(key, value)
VALUES ('schema_version', '015')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ============================================================
-- Done.
-- ============================================================
