-- ============================================================
-- routefolk — migration 006
-- Phase 2B: optional stage assignment for expenses.
--
-- Adds expenses.stage_id as an optional reference to stages.
-- Uses ON DELETE SET NULL so deleting a stage does not delete
-- money records.
-- Adds a trigger to prevent assigning an expense to a stage from
-- a different trip.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_stage_id_idx ON public.expenses(stage_id);

CREATE OR REPLACE FUNCTION public.validate_expense_stage_trip()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stages s
    WHERE s.id = NEW.stage_id
      AND s.trip_id = NEW.trip_id
  ) THEN
    RAISE EXCEPTION 'Expense stage must belong to the same trip.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_validate_stage_trip ON public.expenses;
CREATE TRIGGER expenses_validate_stage_trip
  BEFORE INSERT OR UPDATE OF trip_id, stage_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_stage_trip();

-- ============================================================
-- Done.
-- ============================================================
