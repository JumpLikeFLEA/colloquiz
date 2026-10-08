-- ============================================================
-- 054_current_terms_version.sql
--
-- OPS-022, docs/decisions/0095 Decision 4. Stops handle_new_user() hardcoding
-- the Terms version.
--
-- 036 stamped profiles.terms_version = '1.0' inside handle_new_user(). Terms 1.1
-- ships before launch, so new signups would be stamped 1.0 against Terms 1.1.
-- This migration adds current_terms_version() and redefines handle_new_user()
-- ONCE, from 036's body, to call it. Every later Terms bump replaces only
-- current_terms_version() (CREATE OR REPLACE FUNCTION below, in a new
-- migration); handle_new_user() is not re-emitted again.
--
-- The version returned here MUST equal the "Version X.Y" header of
-- docs/release/legal/terms-of-service.md. scripts/check-terms-version.mjs
-- (part of `npm run check`) fails if the latest migration defining
-- current_terms_version() disagrees with that header.
--
-- MUST BE APPLIED BEFORE LAUNCH, or new signups are stamped 1.0 against
-- Terms 1.1. Existing profiles are untouched (production has no real accounts,
-- 0095).
--
-- Body of handle_new_user() is 036's, verbatim except the version literal.
-- LANGUAGE, SECURITY DEFINER and SET search_path are unchanged; the existing
-- trigger binding from 001 is kept by CREATE OR REPLACE.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_terms_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT '1.1'::text $$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name, full_name, city, terms_accepted_at, terms_version)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'city',
    now(),
    public.current_terms_version()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
