-- ============================================================
-- 025_theme_preference.sql
--
-- Settings > Appearance: stores the Light / Dark / System choice on the profile
-- so it follows the user across devices.
--
-- THIS COLUMN IS NOT THE READ PATH. next-themes keeps the authoritative copy in
-- localStorage, which its pre-paint inline script reads synchronously before the
-- first pixel; a database round trip cannot block paint, so reading the theme
-- from here would reintroduce exactly the flash-of-wrong-theme that the script
-- exists to prevent. This column is written through on change and read once
-- after hydration to adopt a choice made on another device.
--
-- NULL means "never chosen", which is not the same as 'system': a NULL profile
-- leaves whatever this device already had alone, while an explicit 'system'
-- is a real choice that propagates. Hence no DEFAULT.
--
-- REQUIRES the GRANT below as well as the column. 006 closed a privilege-
-- escalation hole by revoking blanket UPDATE on profiles in favour of a
-- column ALLOW-LIST (a user could otherwise set their own role = 'admin'), and
-- that grant is checked BEFORE RLS. Without the GRANT this write fails with
-- "permission denied for table profiles" even though the row is the caller's
-- own — a grant error, not a policy failure. See 023 for the same trap.
--
-- Safe to re-apply: both statements are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme_preference TEXT;

-- Constrain to the three values the UI offers. lib/theme.ts mirrors this list
-- and is the source of truth for the client; keep the two in step.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_theme_preference_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_theme_preference_check
      CHECK (theme_preference IS NULL OR theme_preference IN ('light', 'dark', 'system'));
  END IF;
END $$;

GRANT UPDATE (theme_preference) ON profiles TO authenticated;
