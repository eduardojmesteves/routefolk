-- ============================================================
-- routefolk — migration 014
-- Trip packing and item list MVP.
-- Additive and safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Item categories
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_categories_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT item_categories_trip_name_unique UNIQUE (trip_id, name)
);

CREATE INDEX IF NOT EXISTS item_categories_trip_id_idx ON public.item_categories(trip_id);

-- ------------------------------------------------------------
-- Trip items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES public.item_categories(id) ON DELETE SET NULL,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'packed', 'optional')),
  assigned_to  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes        text,
  sort_order   int NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_items_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS trip_items_trip_id_idx ON public.trip_items(trip_id);
CREATE INDEX IF NOT EXISTS trip_items_category_id_idx ON public.trip_items(category_id);
CREATE INDEX IF NOT EXISTS trip_items_status_idx ON public.trip_items(status);
CREATE INDEX IF NOT EXISTS trip_items_assigned_to_idx ON public.trip_items(assigned_to);

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_item_category_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_trip_item_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_item_audit_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS item_categories_prepare_insert ON public.item_categories;
CREATE TRIGGER item_categories_prepare_insert
  BEFORE INSERT ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.prepare_item_category_insert();

DROP TRIGGER IF EXISTS trip_items_prepare_insert ON public.trip_items;
CREATE TRIGGER trip_items_prepare_insert
  BEFORE INSERT ON public.trip_items
  FOR EACH ROW EXECUTE FUNCTION public.prepare_trip_item_insert();

DROP TRIGGER IF EXISTS item_categories_touch_audit ON public.item_categories;
CREATE TRIGGER item_categories_touch_audit
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_item_audit_columns();

DROP TRIGGER IF EXISTS trip_items_touch_audit ON public.trip_items;
CREATE TRIGGER trip_items_touch_audit
  BEFORE UPDATE ON public.trip_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_item_audit_columns();

-- If an item has a category, the category must belong to the same trip.
CREATE OR REPLACE FUNCTION public.validate_trip_item_category()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.item_categories c
    WHERE c.id = NEW.category_id
      AND c.trip_id = NEW.trip_id
  ) THEN
    RAISE EXCEPTION 'Item category must belong to the same trip.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_items_validate_category ON public.trip_items;
CREATE TRIGGER trip_items_validate_category
  BEFORE INSERT OR UPDATE OF trip_id, category_id ON public.trip_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_trip_item_category();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_categories_select ON public.item_categories;
CREATE POLICY item_categories_select ON public.item_categories FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS item_categories_insert ON public.item_categories;
CREATE POLICY item_categories_insert ON public.item_categories FOR INSERT TO authenticated WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS item_categories_update ON public.item_categories;
CREATE POLICY item_categories_update ON public.item_categories FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS item_categories_delete ON public.item_categories;
CREATE POLICY item_categories_delete ON public.item_categories FOR DELETE TO authenticated USING (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS trip_items_select ON public.trip_items;
CREATE POLICY trip_items_select ON public.trip_items FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS trip_items_insert ON public.trip_items;
CREATE POLICY trip_items_insert ON public.trip_items FOR INSERT TO authenticated WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS trip_items_update ON public.trip_items;
CREATE POLICY trip_items_update ON public.trip_items FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS trip_items_delete ON public.trip_items;
CREATE POLICY trip_items_delete ON public.trip_items FOR DELETE TO authenticated USING (public.can_access_trip(trip_id));

-- Keep schema compatibility checks aligned with this migration.
INSERT INTO public.app_meta (key, value)
VALUES ('schema_version', '014')
ON CONFLICT (key) DO UPDATE SET value = '014', updated_at = now();
