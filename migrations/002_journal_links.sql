-- ============================================================
-- routefolk — migration 002
-- Adds two optional journal-entry links:
-- - location_url: Google Maps link for where the entry happened.
-- - info_url: generic HTTPS website link for Booking.com,
--   restaurants, pubs, TripAdvisor, blogs, etc.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS location_url text,
  ADD COLUMN IF NOT EXISTS info_url text;

-- ============================================================
-- Done.
-- ============================================================
