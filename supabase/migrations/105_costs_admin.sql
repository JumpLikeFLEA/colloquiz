-- ============================================================
-- 105_costs_admin.sql
--
-- OPS-032: what the Studio costs dashboard needs beyond the usage ledger (104)
-- (docs/decisions/0207 Decisions 1, 7, 8).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time:
--   latest migration before this one        -> 104_provider_usage_ledger.sql
--   latest body of the account-delete RPC   -> 103_course_imports.sql. NOT re-emitted: neither
--     table names a person. An expense or a limit is the project's, not a user's.
-- REQUIRES is_admin (027) and storage.objects.
--
-- ── 1. manual_expenses ──────────────────────────────────────────────────
-- What an admin types in from an invoice: a bill (a plan, a domain, a month of hosting) or a
-- credit top-up (prepaid Anthropic or AssemblyAI credit; credit_provider names which ledger
-- provider it pays for, so the dashboard can estimate what is left, 0207 Decision 7). USD
-- only (Decision 8); `reference` is an invoice number or URL, not an uploaded file.
--
-- ── 2. resource_limits ──────────────────────────────────────────────────
-- A plan limit the app cannot read (0207 Context): provider, metric, plan, limit and unit,
-- and optionally the last reading the admin copied from the provider's dashboard, with its
-- date. `measured` names a figure admin_resource_usage() measures (db_bytes, storage_bytes),
-- for which the dashboard shows the measurement instead of a manual reading.
--
-- ── 3. RPCs   admins only (raise insufficient_privilege otherwise) ───────
-- admin_expenses_list(), admin_expense_save(...), admin_expense_delete(id),
-- admin_limits_list(), admin_limit_save(...), admin_limit_delete(id),
-- admin_resource_usage(): database size and Storage objects and bytes per bucket.
--
-- Both tables: RLS on with no policies, no grants to anon or authenticated; only the
-- functions read or write them. Nothing is seeded: which plans the project is on is the
-- admin's to enter, not a guess written into a migration.
--
-- Not destructive: no DROP, no TRUNCATE, no UPDATE or DELETE of an existing row at apply
-- time. Safe to re-apply: IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. manual_expenses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manual_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incurred_on     DATE NOT NULL,
  vendor          TEXT NOT NULL CHECK (length(btrim(vendor)) BETWEEN 1 AND 80),
  category        TEXT NOT NULL CHECK (category IN ('hosting', 'database', 'ai', 'speech', 'domain', 'other')),
  kind            TEXT NOT NULL CHECK (kind IN ('bill', 'credit_topup')),
  credit_provider TEXT CHECK (credit_provider IN ('anthropic', 'assemblyai')),
  amount_usd      NUMERIC(12, 2) NOT NULL CHECK (amount_usd > 0),
  period_start    DATE,
  period_end      DATE,
  reference       TEXT CHECK (reference IS NULL OR length(reference) <= 300),
  note            TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A top-up says which provider's credit it bought; a bill does not.
  CONSTRAINT manual_expenses_credit CHECK ((kind = 'credit_topup') = (credit_provider IS NOT NULL)),
  CONSTRAINT manual_expenses_period CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS manual_expenses_incurred_on ON manual_expenses (incurred_on);
ALTER TABLE manual_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE manual_expenses FROM PUBLIC, anon, authenticated;

-- ── 2. resource_limits ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resource_limits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       TEXT NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 40),
  metric         TEXT NOT NULL CHECK (length(btrim(metric)) BETWEEN 1 AND 60),
  plan           TEXT CHECK (plan IS NULL OR length(plan) <= 40),
  limit_value    NUMERIC(16, 2) CHECK (limit_value IS NULL OR limit_value >= 0),
  unit           TEXT NOT NULL CHECK (unit IN ('MB', 'GB', 'count', 'hours', 'USD')),
  measured       TEXT CHECK (measured IN ('db_bytes', 'storage_bytes')),
  manual_reading NUMERIC(16, 2) CHECK (manual_reading IS NULL OR manual_reading >= 0),
  read_on        DATE,
  note           TEXT CHECK (note IS NULL OR length(note) <= 500),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resource_limits_unique UNIQUE (provider, metric),
  -- A measured figure is in bytes; only MB and GB can be compared with it.
  CONSTRAINT resource_limits_measured_unit CHECK (measured IS NULL OR unit IN ('MB', 'GB')),
  CONSTRAINT resource_limits_reading_date CHECK ((manual_reading IS NULL) = (read_on IS NULL))
);

ALTER TABLE resource_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE resource_limits FROM PUBLIC, anon, authenticated;

-- ── 3. Admin RPCs ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _require_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION _require_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION admin_expenses_list()
RETURNS SETOF manual_expenses
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_admin();
  RETURN QUERY SELECT * FROM manual_expenses ORDER BY incurred_on DESC, created_at DESC;
END;
$$;

-- p_id NULL creates; otherwise updates that row (false-y result: no such row).
CREATE OR REPLACE FUNCTION admin_expense_save(
  p_id              UUID,
  p_incurred_on     DATE,
  p_vendor          TEXT,
  p_category        TEXT,
  p_kind            TEXT,
  p_credit_provider TEXT,
  p_amount_usd      NUMERIC,
  p_period_start    DATE,
  p_period_end      DATE,
  p_reference       TEXT,
  p_note            TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM _require_admin();
  IF p_id IS NULL THEN
    INSERT INTO manual_expenses (incurred_on, vendor, category, kind, credit_provider, amount_usd,
                                 period_start, period_end, reference, note)
    VALUES (p_incurred_on, btrim(p_vendor), p_category, p_kind, p_credit_provider, p_amount_usd,
            p_period_start, p_period_end, NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE manual_expenses SET
      incurred_on = p_incurred_on, vendor = btrim(p_vendor), category = p_category, kind = p_kind,
      credit_provider = p_credit_provider, amount_usd = p_amount_usd, period_start = p_period_start,
      period_end = p_period_end, reference = NULLIF(btrim(p_reference), ''), note = NULLIF(btrim(p_note), ''),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_expense_delete(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_admin();
  DELETE FROM manual_expenses WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION admin_limits_list()
RETURNS SETOF resource_limits
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_admin();
  RETURN QUERY SELECT * FROM resource_limits ORDER BY lower(provider), lower(metric);
END;
$$;

CREATE OR REPLACE FUNCTION admin_limit_save(
  p_id             UUID,
  p_provider       TEXT,
  p_metric         TEXT,
  p_plan           TEXT,
  p_limit_value    NUMERIC,
  p_unit           TEXT,
  p_measured       TEXT,
  p_manual_reading NUMERIC,
  p_read_on        DATE,
  p_note           TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM _require_admin();
  IF p_id IS NULL THEN
    INSERT INTO resource_limits (provider, metric, plan, limit_value, unit, measured, manual_reading, read_on, note)
    VALUES (btrim(p_provider), btrim(p_metric), NULLIF(btrim(p_plan), ''), p_limit_value, p_unit, p_measured,
            p_manual_reading, p_read_on, NULLIF(btrim(p_note), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE resource_limits SET
      provider = btrim(p_provider), metric = btrim(p_metric), plan = NULLIF(btrim(p_plan), ''),
      limit_value = p_limit_value, unit = p_unit, measured = p_measured, manual_reading = p_manual_reading,
      read_on = p_read_on, note = NULLIF(btrim(p_note), ''), updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_limit_delete(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_admin();
  DELETE FROM resource_limits WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- Database size, and Storage objects and bytes per bucket, measured now.
CREATE OR REPLACE FUNCTION admin_resource_usage()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_admin();
  RETURN jsonb_build_object(
    'measured_at', now(),
    'db_bytes', pg_database_size(current_database()),
    'buckets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'objects', b.objects, 'bytes', b.bytes) ORDER BY b.bucket_id)
      FROM (
        SELECT o.bucket_id, count(*) AS objects,
               COALESCE(sum(CASE WHEN o.metadata ->> 'size' ~ '^[0-9]+$' THEN (o.metadata ->> 'size')::BIGINT END), 0) AS bytes
        FROM storage.objects o
        GROUP BY o.bucket_id
      ) b
    ), '[]'::JSONB)
  );
END;
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'admin_expenses_list()',
    'admin_expense_save(UUID, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT)',
    'admin_expense_delete(UUID)',
    'admin_limits_list()',
    'admin_limit_save(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, DATE, TEXT)',
    'admin_limit_delete(UUID)',
    'admin_resource_usage()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;

COMMIT;
