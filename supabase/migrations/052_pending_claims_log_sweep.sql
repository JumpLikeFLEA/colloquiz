-- ============================================================
-- 052_pending_claims_log_sweep.sql
--
-- ANON-008: pending_claims_creation_log (049) has never had a cleanup path.
-- create_pending_claim() lazy-sweeps expired pending_claims rows on every
-- call, but never touched its own rate-limit log table — every create
-- attempt inserts one row there and nothing ever deleted one
-- (`rg "DELETE FROM pending_claims_creation_log" supabase/migrations` found
-- no hits before this migration). record_funnel_event() (051:217) already
-- sweeps its own equivalent log, funnel_events_creation_log, past its
-- 1-hour rate-limit window on every call; this migration gives
-- create_pending_claim() the same inline sweep rather than waiting on
-- OPS-015's separate scheduled-cleanup card, which still covers the other
-- two untouched log tables (feedback, account_export_log).
--
-- Re-emits create_pending_claim() verbatim from 049 with one added line,
-- plus a one-off purge of rows already past the window as of this migration.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

-- One-off purge: clear out whatever has already accumulated past the
-- 1-hour rate-limit window before the inline sweep below starts keeping it
-- there going forward.
DELETE FROM pending_claims_creation_log WHERE created_at <= NOW() - INTERVAL '1 hour';

CREATE OR REPLACE FUNCTION create_pending_claim(p_token_hash TEXT, p_payload JSONB, p_ip INET)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  -- Lazy sweep (0048 Decision 7): no cron, so an expired row is only ever
  -- cleared on the next creation rather than accumulating unboundedly. The
  -- claim endpoint below refuses an expired token outright regardless, so a
  -- row surviving briefly past its expiry here is inert either way.
  DELETE FROM pending_claims WHERE expires_at < NOW();

  -- Same lazy-sweep treatment for the rate-limit log itself (052,
  -- mirroring 051:217's record_funnel_event sweep): a row past its own
  -- 1-hour window carries an IP address with no remaining rate-limit
  -- purpose, so it is cleared on every call rather than left to accumulate
  -- unboundedly the way it did before this migration.
  DELETE FROM pending_claims_creation_log WHERE created_at <= NOW() - INTERVAL '1 hour';

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  IF octet_length(p_payload::text) > 16384 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload_too_large');
  END IF;

  BEGIN
    INSERT INTO pending_claims_creation_log (ip_address) VALUES (p_ip);
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END;

  INSERT INTO pending_claims (token_hash, payload, expires_at)
  VALUES (p_token_hash, p_payload, v_expires_at)
  ON CONFLICT (token_hash) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION create_pending_claim(TEXT, JSONB, INET) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_pending_claim(TEXT, JSONB, INET) TO service_role;

COMMIT;
