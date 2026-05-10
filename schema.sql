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
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trips_created_by_idx ON public.trips(created_by);
CREATE INDEX IF NOT EXISTS trips_status_idx     ON public.trips(status);


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
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  category    text NOT NULL DEFAULT 'other'
                CHECK (category IN ('fuel', 'food', 'lodging', 'tolls', 'other')),
  amount      numeric(12, 2) NOT NULL,
  currency    text NOT NULL DEFAULT 'EUR',
  description text,
  date        date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_trip_id_idx ON public.expenses(trip_id);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON public.expenses(user_id);


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

DROP TRIGGER IF EXISTS journal_set_author ON public.journal_entries;
CREATE TRIGGER journal_set_author
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_journal_author();


-- Expenses: user_id from auth.uid() on INSERT
CREATE OR REPLACE FUNCTION public.set_expense_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_set_user ON public.expenses;
CREATE TRIGGER expenses_set_user
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_user();


-- video_notes: keep updated_at fresh on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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
-- Row-Level Security
-- ============================================================

ALTER TABLE public.trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpx_tracks      ENABLE ROW LEVEL SECURITY;

-- trips
DROP POLICY IF EXISTS trips_select ON public.trips;
CREATE POLICY trips_select ON public.trips FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS trips_insert ON public.trips;
CREATE POLICY trips_insert ON public.trips FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS trips_delete ON public.trips;
CREATE POLICY trips_delete ON public.trips FOR DELETE TO authenticated USING (true);

-- stages
DROP POLICY IF EXISTS stages_select ON public.stages;
CREATE POLICY stages_select ON public.stages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stages_insert ON public.stages;
CREATE POLICY stages_insert ON public.stages FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS stages_update ON public.stages;
CREATE POLICY stages_update ON public.stages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS stages_delete ON public.stages;
CREATE POLICY stages_delete ON public.stages FOR DELETE TO authenticated USING (true);

-- journal_entries
DROP POLICY IF EXISTS journal_select ON public.journal_entries;
CREATE POLICY journal_select ON public.journal_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS journal_insert ON public.journal_entries;
CREATE POLICY journal_insert ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS journal_update ON public.journal_entries;
CREATE POLICY journal_update ON public.journal_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS journal_delete ON public.journal_entries;
CREATE POLICY journal_delete ON public.journal_entries FOR DELETE TO authenticated USING (true);

-- expenses
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated USING (true);

-- video_notes
DROP POLICY IF EXISTS video_notes_select ON public.video_notes;
CREATE POLICY video_notes_select ON public.video_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS video_notes_insert ON public.video_notes;
CREATE POLICY video_notes_insert ON public.video_notes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS video_notes_update ON public.video_notes;
CREATE POLICY video_notes_update ON public.video_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS video_notes_delete ON public.video_notes;
CREATE POLICY video_notes_delete ON public.video_notes FOR DELETE TO authenticated USING (true);

-- gpx_tracks
DROP POLICY IF EXISTS gpx_select ON public.gpx_tracks;
CREATE POLICY gpx_select ON public.gpx_tracks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS gpx_insert ON public.gpx_tracks;
CREATE POLICY gpx_insert ON public.gpx_tracks FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS gpx_update ON public.gpx_tracks;
CREATE POLICY gpx_update ON public.gpx_tracks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS gpx_delete ON public.gpx_tracks;
CREATE POLICY gpx_delete ON public.gpx_tracks FOR DELETE TO authenticated USING (true);


-- ============================================================
-- Done.
-- ============================================================
