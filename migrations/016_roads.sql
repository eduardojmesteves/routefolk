-- ============================================================
-- routefolk — migration 016
-- "My roads" feature (Route Atlas redesign, Account/You screen).
--
-- A road is shared with the whole group (no private visibility tier —
-- unlike trips, roads have no visibility column at all). A road can be
-- linked to multiple stages across multiple trips, each link carrying
-- its own date (auto-filled from the stage's planned_date). Star
-- ratings are per-user: each rider rates roads independently and
-- "My roads" sorts by the viewing user's own rating, not an aggregate.
--
-- Additive and safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Roads
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_number_or_name   text NOT NULL,
  connection_from       text,
  connection_to         text,
  notes                 text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roads_name_not_blank CHECK (length(trim(road_number_or_name)) > 0)
);

CREATE INDEX IF NOT EXISTS roads_created_by_idx ON public.roads(created_by);

-- ------------------------------------------------------------
-- Road <-> stage links (many-to-many; a road can be ridden on several
-- stages across different trips, e.g. the same pass in different years)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.road_stage_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_id      uuid NOT NULL REFERENCES public.roads(id) ON DELETE CASCADE,
  stage_id     uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  link_date    date,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT road_stage_links_unique UNIQUE (road_id, stage_id)
);

CREATE INDEX IF NOT EXISTS road_stage_links_road_id_idx ON public.road_stage_links(road_id);
CREATE INDEX IF NOT EXISTS road_stage_links_stage_id_idx ON public.road_stage_links(stage_id);

-- ------------------------------------------------------------
-- Per-user road ratings (1-5 stars; unrated = no row, never a 0 row)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.road_ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_id      uuid NOT NULL REFERENCES public.roads(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating       int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT road_ratings_unique UNIQUE (road_id, user_id)
);

CREATE INDEX IF NOT EXISTS road_ratings_road_id_idx ON public.road_ratings(road_id);
CREATE INDEX IF NOT EXISTS road_ratings_user_id_idx ON public.road_ratings(user_id);

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_road_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_road_audit_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roads_prepare_insert ON public.roads;
CREATE TRIGGER roads_prepare_insert
  BEFORE INSERT ON public.roads
  FOR EACH ROW EXECUTE FUNCTION public.prepare_road_insert();

DROP TRIGGER IF EXISTS roads_touch_audit ON public.roads;
CREATE TRIGGER roads_touch_audit
  BEFORE UPDATE ON public.roads
  FOR EACH ROW EXECUTE FUNCTION public.touch_road_audit_columns();

-- A link's date auto-populates from its stage's planned_date so the
-- rider never has to re-enter a date the app already knows.
CREATE OR REPLACE FUNCTION public.prepare_road_stage_link_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  IF NEW.link_date IS NULL THEN
    SELECT s.planned_date INTO NEW.link_date FROM public.stages s WHERE s.id = NEW.stage_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS road_stage_links_prepare_insert ON public.road_stage_links;
CREATE TRIGGER road_stage_links_prepare_insert
  BEFORE INSERT ON public.road_stage_links
  FOR EACH ROW EXECUTE FUNCTION public.prepare_road_stage_link_insert();

CREATE OR REPLACE FUNCTION public.prepare_road_rating_upsert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS road_ratings_prepare_insert ON public.road_ratings;
CREATE TRIGGER road_ratings_prepare_insert
  BEFORE INSERT ON public.road_ratings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_road_rating_upsert();

DROP TRIGGER IF EXISTS road_ratings_touch_update ON public.road_ratings;
CREATE TRIGGER road_ratings_touch_update
  BEFORE UPDATE ON public.road_ratings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_road_rating_upsert();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.roads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_stage_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_ratings ENABLE ROW LEVEL SECURITY;

-- Roads are shared with every active app member (no visibility tier —
-- see HANDOFF.md: "roads are always shared/visible to everyone").
DROP POLICY IF EXISTS roads_select ON public.roads;
CREATE POLICY roads_select ON public.roads FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS roads_insert ON public.roads;
CREATE POLICY roads_insert ON public.roads FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS roads_update ON public.roads;
CREATE POLICY roads_update ON public.roads FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS roads_delete ON public.roads;
CREATE POLICY roads_delete ON public.roads FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Links are readable by anyone (roads are public), but creating one
-- requires access to the stage being linked (can't link a road onto a
-- trip you can't see).
DROP POLICY IF EXISTS road_stage_links_select ON public.road_stage_links;
CREATE POLICY road_stage_links_select ON public.road_stage_links FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS road_stage_links_insert ON public.road_stage_links;
CREATE POLICY road_stage_links_insert ON public.road_stage_links FOR INSERT TO authenticated WITH CHECK (public.can_access_stage(stage_id));
DROP POLICY IF EXISTS road_stage_links_delete ON public.road_stage_links;
CREATE POLICY road_stage_links_delete ON public.road_stage_links FOR DELETE TO authenticated USING (public.can_access_stage(stage_id) OR created_by = auth.uid());

-- Ratings are per-user: every rider can read all ratings (needed to show
-- a road's shared log) but can only write their own row.
DROP POLICY IF EXISTS road_ratings_select ON public.road_ratings;
CREATE POLICY road_ratings_select ON public.road_ratings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS road_ratings_insert ON public.road_ratings;
CREATE POLICY road_ratings_insert ON public.road_ratings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS road_ratings_update ON public.road_ratings;
CREATE POLICY road_ratings_update ON public.road_ratings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS road_ratings_delete ON public.road_ratings;
CREATE POLICY road_ratings_delete ON public.road_ratings FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Keep schema compatibility checks aligned with this migration.
INSERT INTO public.app_meta (key, value)
VALUES ('schema_version', '016')
ON CONFLICT (key) DO UPDATE SET value = '016', updated_at = now();
