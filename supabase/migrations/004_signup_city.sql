-- ============================================================
-- 004_signup_city.sql
--
-- Updates handle_new_user() to also populate city from signup
-- metadata (raw_user_meta_data->>'city'), set by the new
-- register form. Columns full_name/city were added in 003.
--
-- Safe to re-apply: CREATE OR REPLACE preserves the existing
-- trigger binding from 001; no DROP/CREATE TRIGGER needed.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name, full_name, city)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'city'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
