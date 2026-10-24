-- ============================================================
-- supabase/verify/105_costs_admin.sql
--
-- OPS-032 full protocol for migration 105 (needs 104 applied). NOT a
-- migration: run after 105 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. A failed assertion aborts with "OPS-032 FAIL: ...". Every denial
-- is paired with a positive control: the same call succeeding for an admin.
-- ============================================================
BEGIN;


CREATE FUNCTION pg_temp.as_role(p_role TEXT, p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  IF p_user IS NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  END IF;
  PERFORM set_config('role', p_role, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('authenticated', p_user, p_sql) $$;

CREATE FUNCTION pg_temp.as_anon(p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('anon', NULL, p_sql) $$;

CREATE FUNCTION pg_temp.as_service(p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('service_role', NULL, p_sql) $$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'OPS-032 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- An admin_expense_save call as SQL text.
CREATE FUNCTION pg_temp.expense_sql(p_id TEXT, p_kind TEXT, p_provider TEXT, p_amount TEXT, p_vendor TEXT DEFAULT 'Vendor')
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format(
    'SELECT public.admin_expense_save(%s, %L, %L, %L, %L, %s, %s, NULL, NULL, %L, %L)::text',
    p_id, '2026-10-01', p_vendor, 'ai', p_kind, COALESCE(quote_literal(p_provider), 'NULL'), p_amount, 'INV-105', 'v105')
$$;

DO $$
DECLARE
  a  UUID := gen_random_uuid();  -- admin
  p  UUID := gen_random_uuid();  -- plain user
  e1 TEXT;
  l1 TEXT;
  j  JSONB;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'v105-' || x || '@verify.test' FROM unnest(ARRAY[a, p]) x;
  UPDATE profiles SET role = 'admin' WHERE id = a;

  -- ── 0. Static facts ─────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('RLS on, no policies, on both tables',
    (SELECT string_agg(relrowsecurity::text, '/' ORDER BY relname) FROM pg_class
      WHERE oid IN ('public.manual_expenses'::regclass, 'public.resource_limits'::regclass)) || '/' ||
    (SELECT count(*)::text FROM pg_policies WHERE tablename IN ('manual_expenses', 'resource_limits')), 'true/true/0');
  PERFORM pg_temp.check_eq('authenticated holds no table privilege; postgres does (positive control)',
    has_table_privilege('authenticated', 'public.manual_expenses', 'SELECT')::text || '/' ||
    has_table_privilege('authenticated', 'public.resource_limits', 'SELECT')::text || '/' ||
    has_table_privilege('postgres', 'public.manual_expenses', 'SELECT')::text, 'false/false/true');
  PERFORM pg_temp.check_eq('_require_admin is not callable by a session, even an admin''s',
    pg_temp.as_user(a, 'SELECT public._require_admin()::text'), 'ERR:42501');

  -- ── 1. Expenses ─────────────────────────────────────────────────────────
  e1 := pg_temp.as_user(a, pg_temp.expense_sql('NULL', 'credit_topup', 'anthropic', '25.00'));
  PERFORM pg_temp.check_eq('an admin adds a credit top-up (a uuid comes back)', (e1 ~ '^[0-9a-f-]{36}$')::text, 'true');
  PERFORM pg_temp.check_eq('an admin adds a bill',
    (pg_temp.as_user(a, pg_temp.expense_sql('NULL', 'bill', NULL, '12.50', 'Domain registrar')) ~ '^[0-9a-f-]{36}$')::text, 'true');
  PERFORM pg_temp.check_eq('a plain user cannot add one', pg_temp.as_user(p, pg_temp.expense_sql('NULL', 'bill', NULL, '1')), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot add one', pg_temp.as_anon(pg_temp.expense_sql('NULL', 'bill', NULL, '1')), 'ERR:42501');
  PERFORM pg_temp.check_eq('a top-up without a provider is refused',
    pg_temp.as_user(a, pg_temp.expense_sql('NULL', 'credit_topup', NULL, '5')), 'ERR:23514');
  PERFORM pg_temp.check_eq('a bill with a provider is refused',
    pg_temp.as_user(a, pg_temp.expense_sql('NULL', 'bill', 'anthropic', '5')), 'ERR:23514');
  PERFORM pg_temp.check_eq('a zero amount is refused', pg_temp.as_user(a, pg_temp.expense_sql('NULL', 'bill', NULL, '0')), 'ERR:23514');
  PERFORM pg_temp.check_eq('...exactly the two good rows exist (note v105)',
    (SELECT count(*)::text FROM manual_expenses WHERE note = 'v105'), '2');

  PERFORM pg_temp.check_eq('an admin lists them',
    pg_temp.as_user(a, $q$SELECT count(*)::text FROM public.admin_expenses_list() WHERE note = 'v105'$q$), '2');
  PERFORM pg_temp.check_eq('a plain user and anon cannot list',
    pg_temp.as_user(p, 'SELECT count(*)::text FROM public.admin_expenses_list()') || '/' ||
    pg_temp.as_anon('SELECT count(*)::text FROM public.admin_expenses_list()'), 'ERR:42501/ERR:42501');
  PERFORM pg_temp.check_eq('nobody reads the table directly, an admin included',
    pg_temp.as_user(p, 'SELECT count(*)::text FROM public.manual_expenses') || '/' ||
    pg_temp.as_user(a, 'SELECT count(*)::text FROM public.manual_expenses'), 'ERR:42501/ERR:42501');

  PERFORM pg_temp.check_eq('an admin edits a row (same id back)',
    pg_temp.as_user(a, pg_temp.expense_sql(quote_literal(e1), 'credit_topup', 'assemblyai', '30.00')), e1);
  PERFORM pg_temp.check_eq('...and the change is stored',
    (SELECT credit_provider || ':' || amount_usd FROM manual_expenses WHERE id = e1::uuid), 'assemblyai:30.00');
  PERFORM pg_temp.check_eq('a plain user cannot edit it',
    pg_temp.as_user(p, pg_temp.expense_sql(quote_literal(e1), 'bill', NULL, '1')), 'ERR:42501');
  PERFORM pg_temp.check_eq('a plain user cannot delete it',
    pg_temp.as_user(p, format('SELECT public.admin_expense_delete(%L)::text', e1)), 'ERR:42501');
  PERFORM pg_temp.check_eq('...it is still there', (SELECT count(*)::text FROM manual_expenses WHERE id = e1::uuid), '1');
  PERFORM pg_temp.check_eq('an admin deletes it',
    pg_temp.as_user(a, format('SELECT public.admin_expense_delete(%L)::text', e1)), 'true');
  PERFORM pg_temp.check_eq('...it is gone, the other row is not',
    (SELECT count(*)::text FROM manual_expenses WHERE note = 'v105'), '1');

  -- ── 2. Limits ───────────────────────────────────────────────────────────
  l1 := pg_temp.as_user(a, $q$SELECT public.admin_limit_save(NULL, 'Supabase v105', 'Database size', 'Free', 500, 'MB', 'db_bytes', NULL, NULL, NULL)::text$q$);
  PERFORM pg_temp.check_eq('an admin adds a measured limit', (l1 ~ '^[0-9a-f-]{36}$')::text, 'true');
  PERFORM pg_temp.check_eq('an admin adds a manual one with a reading',
    (pg_temp.as_user(a, $q$SELECT public.admin_limit_save(NULL, 'Supabase v105', 'Egress', 'Free', 5, 'GB', NULL, 1.2, '2026-10-20', NULL)::text$q$) ~ '^[0-9a-f-]{36}$')::text, 'true');
  PERFORM pg_temp.check_eq('a duplicate provider + metric is refused',
    pg_temp.as_user(a, $q$SELECT public.admin_limit_save(NULL, 'Supabase v105', 'Egress', NULL, 1, 'GB', NULL, NULL, NULL, NULL)::text$q$), 'ERR:23505');
  PERFORM pg_temp.check_eq('a reading without a date is refused',
    pg_temp.as_user(a, $q$SELECT public.admin_limit_save(NULL, 'Supabase v105', 'Rows', NULL, 1, 'count', NULL, 3, NULL, NULL)::text$q$), 'ERR:23514');
  PERFORM pg_temp.check_eq('a measured limit in a unit bytes cannot be compared with is refused',
    pg_temp.as_user(a, $q$SELECT public.admin_limit_save(NULL, 'Supabase v105', 'Rows2', NULL, 1, 'count', 'db_bytes', NULL, NULL, NULL)::text$q$), 'ERR:23514');
  PERFORM pg_temp.check_eq('a plain user cannot add a limit',
    pg_temp.as_user(p, $q$SELECT public.admin_limit_save(NULL, 'X', 'Y', NULL, 1, 'GB', NULL, NULL, NULL, NULL)::text$q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('an admin lists the two limits; a plain user cannot',
    pg_temp.as_user(a, $q$SELECT count(*)::text FROM public.admin_limits_list() WHERE provider = 'Supabase v105'$q$) || '/' ||
    pg_temp.as_user(p, 'SELECT count(*)::text FROM public.admin_limits_list()'), '2/ERR:42501');
  PERFORM pg_temp.check_eq('a plain user cannot delete a limit; an admin can',
    pg_temp.as_user(p, format('SELECT public.admin_limit_delete(%L)::text', l1)) || '/' ||
    pg_temp.as_user(a, format('SELECT public.admin_limit_delete(%L)::text', l1)), 'ERR:42501/true');

  -- ── 3. Resource usage ───────────────────────────────────────────────────
  INSERT INTO storage.buckets (id, name, public) VALUES ('v105-bucket', 'v105-bucket', false);
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
    ('v105-bucket', 'a.bin', '{"size": 1000}'), ('v105-bucket', 'b.bin', '{"size": 234}'), ('v105-bucket', 'c.bin', NULL);
  j := pg_temp.as_user(a, 'SELECT public.admin_resource_usage()::text')::jsonb;
  PERFORM pg_temp.check_eq('an admin measures the database (a positive size)', ((j ->> 'db_bytes')::bigint > 0)::text, 'true');
  PERFORM pg_temp.check_eq('...and the seeded bucket: 3 objects, 1234 bytes (an object with no size counts, adds 0)',
    (SELECT (b ->> 'objects') || '/' || (b ->> 'bytes') FROM jsonb_array_elements(j -> 'buckets') b WHERE b ->> 'bucket' = 'v105-bucket'), '3/1234');
  PERFORM pg_temp.check_eq('a plain user and anon cannot measure',
    pg_temp.as_user(p, 'SELECT public.admin_resource_usage()::text') || '/' || pg_temp.as_anon('SELECT public.admin_resource_usage()::text'),
    'ERR:42501/ERR:42501');

  RAISE NOTICE 'OPS-032 PASS: 105 full protocol';
END;
$$;

ROLLBACK;
