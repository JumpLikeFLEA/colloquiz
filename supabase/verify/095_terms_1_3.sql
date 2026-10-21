-- ============================================================
-- supabase/verify/095_terms_1_3.sql
--
-- OPS-026 check for migration 095 (needs 054 and 072). NOT a migration: run after
-- 095 is applied, as postgres. Seeds two users and ROLLS BACK. 095 changes one
-- function body, so the protocol is: the version it returns, that a NEW signup is
-- stamped with it through the real trigger (positive control), that a profile that
-- already accepted 1.2 keeps 1.2 (the migration rewrites no row), and that
-- scripts/check-terms-version.mjs agrees with the Terms header (run separately).
-- ============================================================
BEGIN;

DO $$
DECLARE
  old_u UUID := gen_random_uuid();
  new_u UUID := gen_random_uuid();
  v TEXT;
  anon_ok BOOLEAN;
BEGIN
  IF public.current_terms_version() <> '1.3' THEN
    RAISE EXCEPTION 'OPS-026 FAIL: current_terms_version() = %', public.current_terms_version();
  END IF;
  RAISE NOTICE 'current_terms_version() -> % (want 1.3)', public.current_terms_version();

  -- A profile that accepted 1.2 before the bump.
  PERFORM set_config('app.verify', 'x', true);
  INSERT INTO auth.users (id, aud, role, email) VALUES (old_u, 'authenticated', 'authenticated', 'old-' || old_u || '@verify.test');
  UPDATE profiles SET terms_version = '1.2' WHERE id = old_u;

  -- A signup after it.
  INSERT INTO auth.users (id, aud, role, email) VALUES (new_u, 'authenticated', 'authenticated', 'new-' || new_u || '@verify.test');

  SELECT terms_version INTO v FROM profiles WHERE id = new_u;
  IF v IS DISTINCT FROM '1.3' THEN RAISE EXCEPTION 'OPS-026 FAIL: new signup stamped % (want 1.3)', v; END IF;
  RAISE NOTICE 'new signup terms_version -> % (want 1.3)', v;

  SELECT terms_version INTO v FROM profiles WHERE id = old_u;
  IF v IS DISTINCT FROM '1.2' THEN RAISE EXCEPTION 'OPS-026 FAIL: existing profile now % (want 1.2)', v; END IF;
  RAISE NOTICE 'existing profile terms_version -> % (want 1.2, untouched)', v;

  -- Function privileges: reported, not asserted (095 does not touch them).
  SELECT has_function_privilege('anon', 'public.current_terms_version()', 'EXECUTE') INTO anon_ok;
  RAISE NOTICE 'anon can execute current_terms_version -> %', anon_ok;

  RAISE NOTICE 'OPS-026 PASS: 095 protocol (4 asserted cells)';
END;
$$;

ROLLBACK;
