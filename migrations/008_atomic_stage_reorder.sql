-- ============================================================
-- routefolk — migration 008: atomic stage reorder
--
-- Purpose:
-- - Replace client-side two-step stage swapping with one
--   transactional database RPC.
-- - Lock both stage rows before swapping order_index values.
-- - Ensure both stages belong to the same trip.
-- - Reuse the existing private/group trip access model.
--
-- Requires migration 007 because it relies on the deferrable
-- stages(trip_id, order_index) uniqueness constraint.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.swap_stage_order(
  p_stage_a_id uuid,
  p_stage_b_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a record;
  v_b record;
BEGIN
  IF p_stage_a_id IS NULL OR p_stage_b_id IS NULL THEN
    RAISE EXCEPTION 'Both stage ids are required.';
  END IF;

  IF p_stage_a_id = p_stage_b_id THEN
    RETURN;
  END IF;

  -- The unique order constraint added in migration 007 is deferrable.
  -- Keep it deferred for the duration of this transaction so the swap
  -- cannot fail on the transient duplicate order value.
  SET CONSTRAINTS stages_trip_order_unique DEFERRED;

  SELECT id, trip_id, order_index
  INTO v_a
  FROM public.stages
  WHERE id = p_stage_a_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'First stage was not found.';
  END IF;

  SELECT id, trip_id, order_index
  INTO v_b
  FROM public.stages
  WHERE id = p_stage_b_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Second stage was not found.';
  END IF;

  IF v_a.trip_id <> v_b.trip_id THEN
    RAISE EXCEPTION 'Stages must belong to the same trip.';
  END IF;

  IF NOT public.can_access_trip(v_a.trip_id) THEN
    RAISE EXCEPTION 'You do not have permission to reorder stages for this trip.';
  END IF;

  UPDATE public.stages
  SET
    order_index = CASE
      WHEN id = v_a.id THEN v_b.order_index
      WHEN id = v_b.id THEN v_a.order_index
      ELSE order_index
    END,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id IN (v_a.id, v_b.id);
END;
$$;

REVOKE ALL ON FUNCTION public.swap_stage_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swap_stage_order(uuid, uuid) TO authenticated;

INSERT INTO public.app_meta(key, value)
VALUES ('schema_version', '008')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
