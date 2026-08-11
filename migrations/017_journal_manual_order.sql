-- ============================================================
-- routefolk — migration 017
-- Journal entry ordering: Auto (by timestamp, default) vs a per-stage
-- manual override. See HANDOFF.md "Entry ordering control" — a boolean
-- flag on the stage plus a persisted sort position per entry, not a
-- separate sort field unrelated to time.
--
-- Additive and safe to re-run.
-- ============================================================

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS journal_manual_order boolean NOT NULL DEFAULT false;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS journal_entries_stage_sort_idx
  ON public.journal_entries(stage_id, sort_order);

-- Keep schema compatibility checks aligned with this migration.
INSERT INTO public.app_meta (key, value)
VALUES ('schema_version', '017')
ON CONFLICT (key) DO UPDATE SET value = '017', updated_at = now();
