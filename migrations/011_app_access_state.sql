-- ============================================================
-- routefolk — migration 011
-- App access diagnostics for clearer non-member messaging
--
-- Purpose:
-- - Let the frontend distinguish between a missing database migration
--   and a signed-in Google account that is not an active app member.
-- - Keep the real membership boundary in RLS and public.app_members.
-- - Do not expose the full member list to normal users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_app_access()
RETURNS TABLE (
  email text,
  is_allowed boolean,
  is_admin boolean,
  role text,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_account AS (
    SELECT lower(auth.jwt() ->> 'email') AS email_lower,
           auth.jwt() ->> 'email' AS email
  ),
  membership AS (
    SELECT m.email, m.role, m.active
    FROM public.app_members m
    JOIN current_account c ON lower(m.email) = c.email_lower
    LIMIT 1
  )
  SELECT
    (SELECT email FROM current_account)::text AS email,
    COALESCE((SELECT active FROM membership), false) AS is_allowed,
    COALESCE((SELECT active AND role = 'admin' FROM membership), false) AS is_admin,
    (SELECT role FROM membership)::text AS role,
    COALESCE((SELECT active FROM membership), false) AS active;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_app_access() TO authenticated;

INSERT INTO public.app_meta(key, value)
VALUES ('schema_version', '011')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();
