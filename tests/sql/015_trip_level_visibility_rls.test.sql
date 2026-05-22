-- ============================================================
-- routefolk — trip-level visibility RLS test matrix
--
-- Run against a Supabase local/dev database after applying
-- migrations through 015. The script is transactional and rolls
-- back all fixture data.
--
-- Purpose:
-- - Lock the visibility-only product rules before UI work.
-- - Prove that trip access and child-data access inherit from
--   the parent trip.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Test helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.set_test_auth(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'email', p_email,
      'role', 'authenticated'
    )::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.email', p_email, true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_bool(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN
    RAISE EXCEPTION 'Assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_trip_visible(p_trip_id uuid, p_expected boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_seen boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_child_rows_visible(p_trip_id uuid, p_expected boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_seen boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.stages s WHERE s.trip_id = p_trip_id) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message || ' — stages');

  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries j
    JOIN public.stages s ON s.id = j.stage_id
    WHERE s.trip_id = p_trip_id
  ) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message || ' — journal');

  SELECT EXISTS (SELECT 1 FROM public.expenses e WHERE e.trip_id = p_trip_id) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message || ' — expenses');

  SELECT EXISTS (SELECT 1 FROM public.gpx_tracks g WHERE g.trip_id = p_trip_id) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message || ' — gpx records');

  SELECT EXISTS (SELECT 1 FROM public.item_categories c WHERE c.trip_id = p_trip_id) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message || ' — item categories');

  SELECT EXISTS (SELECT 1 FROM public.trip_items i WHERE i.trip_id = p_trip_id) INTO v_seen;
  PERFORM pg_temp.assert_bool(v_seen = p_expected, p_message || ' — trip items');
END;
$$;

-- ------------------------------------------------------------
-- Fixtures
-- ------------------------------------------------------------
DO $$
DECLARE
  v_creator uuid := '00000000-0000-0000-0000-000000000101';
  v_selected uuid := '00000000-0000-0000-0000-000000000102';
  v_other uuid := '00000000-0000-0000-0000-000000000103';
  v_inactive uuid := '00000000-0000-0000-0000-000000000104';
  v_private_trip uuid := '00000000-0000-0000-0000-000000000201';
  v_selected_trip uuid := '00000000-0000-0000-0000-000000000202';
  v_group_trip uuid := '00000000-0000-0000-0000-000000000203';
  v_stage uuid := '00000000-0000-0000-0000-000000000301';
  v_selected_stage uuid := '00000000-0000-0000-0000-000000000302';
  v_group_stage uuid := '00000000-0000-0000-0000-000000000303';
  v_category uuid := '00000000-0000-0000-0000-000000000401';
BEGIN
  INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_creator, 'creator@example.test', 'authenticated', 'authenticated', now(), now(), now()),
    (v_selected, 'selected@example.test', 'authenticated', 'authenticated', now(), now(), now()),
    (v_other, 'other@example.test', 'authenticated', 'authenticated', now(), now(), now()),
    (v_inactive, 'inactive@example.test', 'authenticated', 'authenticated', now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.app_members (email, role, active)
  VALUES
    ('creator@example.test', 'member', true),
    ('selected@example.test', 'member', true),
    ('other@example.test', 'member', true),
    ('inactive@example.test', 'member', false)
  ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, active = EXCLUDED.active;

  PERFORM pg_temp.set_test_auth(v_creator, 'creator@example.test');

  INSERT INTO public.trips (id, created_by, title, visibility, status)
  VALUES
    (v_private_trip, v_creator, 'Private visibility test', 'private', 'planning'),
    (v_selected_trip, v_creator, 'Selected visibility test', 'private', 'planning'),
    (v_group_trip, v_creator, 'Everyone visibility test', 'group', 'planning');

  INSERT INTO public.trip_members (trip_id, member_email, added_by)
  VALUES (v_selected_trip, 'selected@example.test', v_creator);

  UPDATE public.trips SET visibility = 'selected' WHERE id = v_selected_trip;

  INSERT INTO public.stages (id, trip_id, order_index, title)
  VALUES
    (v_stage, v_private_trip, 0, 'Private stage'),
    (v_selected_stage, v_selected_trip, 0, 'Selected stage'),
    (v_group_stage, v_group_trip, 0, 'Everyone stage');

  INSERT INTO public.journal_entries (stage_id, author_id, entry_type, title)
  VALUES
    (v_stage, v_creator, 'note', 'Private journal'),
    (v_selected_stage, v_creator, 'note', 'Selected journal'),
    (v_group_stage, v_creator, 'note', 'Everyone journal');

  INSERT INTO public.expenses (trip_id, user_id, amount, category)
  VALUES
    (v_private_trip, v_creator, 10, 'fuel'),
    (v_selected_trip, v_selected, 20, 'fuel'),
    (v_group_trip, v_other, 30, 'fuel');

  INSERT INTO public.gpx_tracks (trip_id, stage_id, file_path)
  VALUES
    (v_private_trip, v_stage, v_private_trip || '/' || v_stage || '/private.gpx'),
    (v_selected_trip, v_selected_stage, v_selected_trip || '/' || v_selected_stage || '/selected.gpx'),
    (v_group_trip, v_group_stage, v_group_trip || '/' || v_group_stage || '/everyone.gpx');

  INSERT INTO public.item_categories (id, trip_id, name, sort_order)
  VALUES (v_category, v_selected_trip, 'Tools', 0);

  INSERT INTO public.trip_items (trip_id, category_id, name, assigned_to)
  VALUES (v_selected_trip, v_category, 'Tyre repair kit', v_selected);
END;
$$;

-- ------------------------------------------------------------
-- Access matrix
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT pg_temp.set_test_auth('00000000-0000-0000-0000-000000000101', 'creator@example.test');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000201', true, 'creator sees private trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000202', true, 'creator sees selected trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000203', true, 'creator sees everyone trip');
SELECT pg_temp.assert_child_rows_visible('00000000-0000-0000-0000-000000000202', true, 'creator sees selected child data');

SELECT pg_temp.set_test_auth('00000000-0000-0000-0000-000000000102', 'selected@example.test');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000201', false, 'selected member cannot see private trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000202', true, 'selected member sees selected trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000203', true, 'selected member sees everyone trip');
SELECT pg_temp.assert_child_rows_visible('00000000-0000-0000-0000-000000000202', true, 'selected member sees selected child data');

SELECT pg_temp.set_test_auth('00000000-0000-0000-0000-000000000103', 'other@example.test');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000201', false, 'non-selected member cannot see private trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000202', false, 'non-selected member cannot see selected trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000203', true, 'non-selected member sees everyone trip');
SELECT pg_temp.assert_child_rows_visible('00000000-0000-0000-0000-000000000202', false, 'non-selected member cannot see selected child data');

SELECT pg_temp.set_test_auth('00000000-0000-0000-0000-000000000104', 'inactive@example.test');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000201', false, 'inactive member cannot see private trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000202', false, 'inactive member cannot see selected trip');
SELECT pg_temp.assert_trip_visible('00000000-0000-0000-0000-000000000203', false, 'inactive member cannot see everyone trip');

-- ------------------------------------------------------------
-- Visibility management guardrails
-- ------------------------------------------------------------
SELECT pg_temp.set_test_auth('00000000-0000-0000-0000-000000000102', 'selected@example.test');
UPDATE public.trips
SET title = 'Selected member can edit title'
WHERE id = '00000000-0000-0000-0000-000000000202';

SELECT pg_temp.assert_bool(
  EXISTS (SELECT 1 FROM public.trips WHERE id = '00000000-0000-0000-0000-000000000202' AND title = 'Selected member can edit title'),
  'selected member can edit non-visibility trip fields'
);

DO $$
BEGIN
  UPDATE public.trips
  SET visibility = 'group'
  WHERE id = '00000000-0000-0000-0000-000000000202';
  RAISE EXCEPTION 'Assertion failed: selected member must not change trip visibility';
EXCEPTION
  WHEN insufficient_privilege OR check_violation OR raise_exception THEN
    NULL;
END;
$$;

RESET ROLE;
ROLLBACK;
