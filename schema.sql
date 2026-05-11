-- ============================================================
-- routefolk — full schema (current state)
-- This file is a snapshot of what your Supabase database should
-- contain after running all migrations. It is idempotent and
-- safe to re-run.
--
-- For incremental changes, see migrations/*.sql instead.
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- Tables
-- ============================================================

-- ------------------------------------------------------------
-- profiles
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
-- trips
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  start_date      date,
  end_date        date,
  cover_photo_url text,
  status          text NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  visibility      text NOT NULL DEFAULT 'group'
                    CHECK (visibility IN ('private', 'group')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trips_created_by_idx ON public.trips(created_by);
CREATE INDEX IF NOT EXISTS trips_status_idx     ON public.trips(status);
CREATE INDEX IF NOT EXISTS trips_visibility_idx ON public.trips(visibility);


-- ------------------------------------------------------------
-- stages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  order_index      int  NOT NULL DEFAULT 0,
  title            text,
  start_location   text,
  start_lat        double precision,
  start_lng        double precision,
  end_location     text,
  end_lat          double precision,
  end_lng          double precision,
  planned_date     date,
  gmaps_url        text,
  custom_route_url text,
  distance_km      double precision,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stages_trip_id_idx ON public.stages(trip_id);


-- ------------------------------------------------------------
-- journal_entries
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id        uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_type      text NOT NULL DEFAULT 'note'
                    CHECK (entry_type IN ('stop', 'meal', 'lodging', 'note', 'drink', 'other')),
  title           text,
  description     text,
  location        text,
  location_url    text,
  info_url        text,
  timestamp       timestamptz,
  photo_album_url text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_stage_id_idx ON public.journal_entries(stage_id);


-- ------------------------------------------------------------
-- expenses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stage_id    uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL, -- payer
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,          -- who entered it
  category    text NOT NULL DEFAULT 'other'
                CHECK (category IN ('fuel', 'food_drinks', 'lodging', 'tolls', 'parking', 'other')),
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency    text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  description text,
  date        date DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_trip_id_idx    ON public.expenses(trip_id);
CREATE INDEX IF NOT EXISTS expenses_stage_id_idx   ON public.expenses(stage_id);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx    ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS expenses_created_by_idx ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS expenses_category_idx   ON public.expenses(category);
CREATE INDEX IF NOT EXISTS expenses_date_idx       ON public.expenses(date);


-- ------------------------------------------------------------
-- video_notes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
  content     text,
  song_title  text,
  song_artist text,
  song_url    text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- gpx_tracks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gpx_tracks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stage_id         uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  file_path        text NOT NULL,
  distance_km      double precision,
  duration_seconds int,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gpx_tracks_trip_id_idx  ON public.gpx_tracks(trip_id);
CREATE INDEX IF NOT EXISTS gpx_tracks_stage_id_idx ON public.gpx_tracks(stage_id);


-- ============================================================
-- Triggers: auto-set ownership / audit columns
-- ============================================================

-- Trips: created_by from auth.uid() on INSERT
CREATE OR REPLACE FUNCTION public.set_trip_created_by()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_set_created_by ON public.trips;
CREATE TRIGGER trips_set_created_by
  BEFORE INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_trip_created_by();


-- Journal entries: author_id from auth.uid() on INSERT
CREATE OR REPLACE FUNCTION public.set_journal_author()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.author_id := auth.uid();
  RETURN NEW;
END;
$$;


-- Trips: preserve created_by on UPDATE so clients cannot take ownership
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


DROP TRIGGER IF EXISTS journal_set_author ON public.journal_entries;
CREATE TRIGGER journal_set_author
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_journal_author();


-- Expenses: user_id is the selected payer; created_by is the user entering it.
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

-- Expenses: if assigned to a stage, the stage must belong to the same trip.
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


-- video_notes: keep updated_at fresh on every UPDATE
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

DROP TRIGGER IF EXISTS video_notes_touch_updated ON public.video_notes;
CREATE TRIGGER video_notes_touch_updated
  BEFORE UPDATE ON public.video_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- trips & stages: audit columns (updated_by, updated_at) on UPDATE
CREATE OR REPLACE FUNCTION public.touch_audit_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_touch_audit ON public.trips;
CREATE TRIGGER trips_touch_audit
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit_columns();

DROP TRIGGER IF EXISTS stages_touch_audit ON public.stages;
CREATE TRIGGER stages_touch_audit
  BEFORE UPDATE ON public.stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit_columns();


-- ============================================================
-- Access helpers for RLS
-- ============================================================

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
        t.visibility = 'group'
        OR (t.visibility = 'private' AND t.created_by = auth.uid() AND p_payer_id = auth.uid())
      )
  );
$$;


-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpx_tracks      ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated USING (false);

-- trips
DROP POLICY IF EXISTS trips_select ON public.trips;
CREATE POLICY trips_select ON public.trips FOR SELECT TO authenticated USING (visibility = 'group' OR created_by = auth.uid());
DROP POLICY IF EXISTS trips_insert ON public.trips;
CREATE POLICY trips_insert ON public.trips FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips FOR UPDATE TO authenticated USING (visibility = 'group' OR created_by = auth.uid()) WITH CHECK (visibility = 'group' OR created_by = auth.uid());
DROP POLICY IF EXISTS trips_delete ON public.trips;
CREATE POLICY trips_delete ON public.trips FOR DELETE TO authenticated USING (created_by = auth.uid());

-- stages inherit access from the parent trip
DROP POLICY IF EXISTS stages_select ON public.stages;
CREATE POLICY stages_select ON public.stages FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS stages_insert ON public.stages;
CREATE POLICY stages_insert ON public.stages FOR INSERT TO authenticated WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS stages_update ON public.stages;
CREATE POLICY stages_update ON public.stages FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS stages_delete ON public.stages;
CREATE POLICY stages_delete ON public.stages FOR DELETE TO authenticated USING (public.can_access_trip(trip_id));

-- journal_entries inherit access through stage -> trip
DROP POLICY IF EXISTS journal_select ON public.journal_entries;
CREATE POLICY journal_select ON public.journal_entries FOR SELECT TO authenticated USING (public.can_access_stage(stage_id));
DROP POLICY IF EXISTS journal_insert ON public.journal_entries;
CREATE POLICY journal_insert ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (public.can_access_stage(stage_id));
DROP POLICY IF EXISTS journal_update ON public.journal_entries;
CREATE POLICY journal_update ON public.journal_entries FOR UPDATE TO authenticated USING (public.can_access_stage(stage_id)) WITH CHECK (public.can_access_stage(stage_id));
DROP POLICY IF EXISTS journal_delete ON public.journal_entries;
CREATE POLICY journal_delete ON public.journal_entries FOR DELETE TO authenticated USING (public.can_access_stage(stage_id));

-- expenses inherit access from the parent trip and enforce private-trip payer rules
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.can_access_trip(trip_id) AND public.can_choose_expense_payer(trip_id, user_id));
DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id) AND public.can_choose_expense_payer(trip_id, user_id));
DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated USING (public.can_access_trip(trip_id));

-- video_notes inherit access from the parent trip
DROP POLICY IF EXISTS video_notes_select ON public.video_notes;
CREATE POLICY video_notes_select ON public.video_notes FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS video_notes_insert ON public.video_notes;
CREATE POLICY video_notes_insert ON public.video_notes FOR INSERT TO authenticated WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS video_notes_update ON public.video_notes;
CREATE POLICY video_notes_update ON public.video_notes FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS video_notes_delete ON public.video_notes;
CREATE POLICY video_notes_delete ON public.video_notes FOR DELETE TO authenticated USING (public.can_access_trip(trip_id));

-- gpx_tracks inherit access from the parent trip
DROP POLICY IF EXISTS gpx_select ON public.gpx_tracks;
CREATE POLICY gpx_select ON public.gpx_tracks FOR SELECT TO authenticated USING (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS gpx_insert ON public.gpx_tracks;
CREATE POLICY gpx_insert ON public.gpx_tracks FOR INSERT TO authenticated WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS gpx_update ON public.gpx_tracks;
CREATE POLICY gpx_update ON public.gpx_tracks FOR UPDATE TO authenticated USING (public.can_access_trip(trip_id)) WITH CHECK (public.can_access_trip(trip_id));
DROP POLICY IF EXISTS gpx_delete ON public.gpx_tracks;
CREATE POLICY gpx_delete ON public.gpx_tracks FOR DELETE TO authenticated USING (public.can_access_trip(trip_id));

-- ============================================================
-- Done.
-- ============================================================
