-- ============================================================
-- routefolk — migration 005
-- Phase 2A: basic trip expenses.
--
-- Adds the final Phase 2 expense categories, makes expenses EUR-only,
-- supports selectable payer, records who created/updated each expense,
-- and hardens expense RLS for private/group trip visibility.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- Expense columns and defaults
-- ------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.expenses
  ALTER COLUMN currency SET DEFAULT 'EUR',
  ALTER COLUMN date SET DEFAULT CURRENT_DATE;

-- Existing legacy rows used `food`; the Phase 2 label is Food & drinks.
UPDATE public.expenses
SET category = 'food_drinks'
WHERE category = 'food';

UPDATE public.expenses
SET currency = 'EUR'
WHERE currency IS NULL OR currency <> 'EUR';

UPDATE public.expenses
SET created_by = user_id
WHERE created_by IS NULL;

-- ------------------------------------------------------------
-- Replace legacy CHECK constraints
-- ------------------------------------------------------------
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_currency_check;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_positive;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('fuel', 'food_drinks', 'lodging', 'tolls', 'parking', 'other'));

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_currency_check
  CHECK (currency = 'EUR');

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_amount_positive
  CHECK (amount > 0);

CREATE INDEX IF NOT EXISTS expenses_created_by_idx ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS expenses_category_idx   ON public.expenses(category);
CREATE INDEX IF NOT EXISTS expenses_date_idx       ON public.expenses(date);

-- ------------------------------------------------------------
-- Expense trigger: user_id is selected payer, created_by is editor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_expense_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  NEW.currency := 'EUR';
  IF NEW.date IS NULL THEN
    NEW.date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_expense_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  NEW.currency := 'EUR';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_set_user ON public.expenses;
DROP TRIGGER IF EXISTS expenses_prepare_insert ON public.expenses;
CREATE TRIGGER expenses_prepare_insert
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.prepare_expense_insert();

DROP TRIGGER IF EXISTS expenses_touch_audit ON public.expenses;
CREATE TRIGGER expenses_touch_audit
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_expense_audit();

-- ------------------------------------------------------------
-- Helper: selected payer rule.
-- Private trips can only use the current user as payer.
-- Group trips can use any valid auth user as payer; this is a trusted app.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_choose_expense_payer(p_trip_id uuid, p_payer_id uuid)
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
        (t.visibility = 'group')
        OR (t.visibility = 'private' AND t.created_by = auth.uid() AND p_payer_id = auth.uid())
      )
  );
$$;

-- ------------------------------------------------------------
-- RLS: expenses inherit trip visibility and payer rule.
-- ------------------------------------------------------------
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_trip(trip_id)
    AND public.can_choose_expense_payer(trip_id, user_id)
  );

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (
    public.can_access_trip(trip_id)
    AND public.can_choose_expense_payer(trip_id, user_id)
  );

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (public.can_access_trip(trip_id));

-- ============================================================
-- Done.
-- ============================================================
