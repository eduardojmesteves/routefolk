-- ============================================================
-- routefolk — migration 001
-- Adds custom_route_url for user-defined Google Maps routes.
-- Adds updated_by / updated_at audit columns + triggers on
-- trips and stages (data captured now, displayed later).
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- stages: custom route URL
-- ------------------------------------------------------------
ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS custom_route_url text;


-- ------------------------------------------------------------
-- Audit columns: who edited, when
-- ------------------------------------------------------------
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();


-- ------------------------------------------------------------
-- Trigger function: set updated_by / updated_at on UPDATE.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_audit_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trips_touch_audit ON public.trips;
CREATE TRIGGER trips_touch_audit
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit_columns();

DROP TRIGGER IF EXISTS stages_touch_audit ON public.stages;
CREATE TRIGGER stages_touch_audit
  BEFORE UPDATE ON public.stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit_columns();


-- ============================================================
-- Done.
-- ============================================================
