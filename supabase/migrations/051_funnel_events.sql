-- ============================================================
-- 051_funnel_events.sql
--
-- OPS-008: minimal funnel analytics (docs/handoff.md, "settled input 3").
-- Four events — landing_view, lesson_start, lesson_complete, signup — each
-- tagged with a coarse acquisition channel (instagram / telegram / direct).
-- Decided over Vercel Web Analytics custom events: this project is on the
-- Hobby plan and staying there for now, and custom events require Pro/
-- Enterprise (confirmed against Vercel's docs, 2026-09-27) — see
-- docs/decisions/0069-ops008-funnel-events.md.
--
-- WRITE PATH FOLLOWS THE ANON-006 / migration 049 PATTERN EXACTLY, not the
-- feedback (026) pattern: funnel_events has RLS ON, NO POLICIES, and an
-- explicit REVOKE ALL from anon/authenticated — there is no PostgREST insert
-- path here at all, unlike feedback's own-row INSERT policy. The only writer
-- is record_funnel_event(), a SECURITY DEFINER function granted to
-- service_role ONLY, called from app/api/events/route.ts via
-- lib/supabase/admin.ts. Reasoning: every one of these four events can fire
-- for a visitor with NO session (anonymous landing/lesson play), so there is
-- no `auth.uid()` to hang an owner-insert policy on the way feedback's
-- `user_id = auth.uid()` policy does; trusting a caller-chosen IP for rate
-- limiting also means this must not be reachable directly over PostgREST
-- with a forged address, same reasoning as create_pending_claim in 049.
--
-- TWO LAYERS OF ABUSE CONTROL, both DB-enforced (courtesy validation in the
-- route is not the enforcement):
--   1. Per-IP hourly cap via funnel_events_creation_log + a BEFORE INSERT
--      trigger, same shape and same IP source (lib/pendingClaims.ts's
--      extractClientIp, x-forwarded-for then x-real-ip) as 049's
--      pending_claims_creation_log. 300/hour, not 049's 20/hour: a real
--      household or office NAT can legitimately generate many lesson
--      start/complete pairs across several people in an hour, where
--      pending_claims' 20/hour guards a much rarer action (stashing a
--      signup's local attempts).
--   2. A global daily backstop directly on funnel_events (20,000/day,
--      owner's number) so even a large pool of distinct IPs can't grow the
--      table unboundedly. This is a storage/cost ceiling, not a real abuse
--      defense — see docs/decisions/0069.
--
-- source is NULLABLE: RegistrationOffer.tsx / the client-side beacon send
-- source = null when navigator.globalPrivacyControl is true or
-- navigator.doNotTrack === '1' (docs/decisions/0069's GPC/DNT honoring,
-- recorded there alongside the CNIL-style audience-measurement-exemption
-- reasoning for why this table exists at all).
--
-- path is capped at 512 chars, same bound as feedback.route (026) and
-- pending_claims' IP-log analog — long enough for any real route in this
-- app, short enough that it can't be repurposed as free-text storage.
--
-- created_at is stored HOUR-TRUNCATED (record_funnel_event inserts
-- date_trunc('hour', NOW()), overriding the column's own DEFAULT NOW()) so a
-- row can never be joined back to auth.users.created_at by timestamp — see
-- docs/decisions/0069 Decision 3, "not linked to your account".
--
-- Safe to re-apply: all operations are idempotent.
-- ============================================================

BEGIN;

-- ── funnel_events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funnel_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT        NOT NULL
               CHECK (event_type IN ('landing_view', 'lesson_start', 'lesson_complete', 'signup')),
  source     TEXT        CHECK (source IS NULL OR source IN ('instagram', 'telegram', 'direct')),
  path       TEXT        CHECK (path IS NULL OR char_length(path) <= 512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS funnel_events_created_at_idx ON funnel_events (created_at);
CREATE INDEX IF NOT EXISTS funnel_events_type_created_at_idx ON funnel_events (event_type, created_at);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE funnel_events FROM PUBLIC, anon, authenticated;
-- No GRANT and no policy at all. An admin-read POLICY here would be dead
-- code: the REVOKE above means `authenticated` fails the table-level GRANT
-- check before RLS is ever consulted — same mechanism as the profiles
-- column-GRANT rule (CLAUDE.md, "Standing rules"). Read via the SQL editor
-- (service_role, bypasses RLS and grants both) for now; add
-- `GRANT SELECT ON TABLE funnel_events TO authenticated` plus a real admin
-- policy only when an admin-dashboard card actually needs to query this
-- from the client.


-- ── global daily backstop (layer 2) ─────────────────────────────────────
-- A storage/cost ceiling, not a real abuse defense (that's the per-IP limit
-- below) — see the header. Counts the whole table, not per-IP, so this is
-- cheap only because the per-IP limit already keeps any single source from
-- dominating it.
CREATE OR REPLACE FUNCTION funnel_events_daily_cap()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 20000 $$;

REVOKE ALL ON FUNCTION funnel_events_daily_cap() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION funnel_events_enforce_daily_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today  BIGINT;
  v_cap    INTEGER := funnel_events_daily_cap();
BEGIN
  SELECT count(*) INTO v_today
  FROM funnel_events
  WHERE created_at >= date_trunc('day', NOW());

  IF v_today >= v_cap THEN
    RAISE EXCEPTION 'funnel event daily cap reached (% per day)', v_cap
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnel_events_daily_cap_trigger ON funnel_events;
CREATE TRIGGER funnel_events_daily_cap_trigger
  BEFORE INSERT ON funnel_events
  FOR EACH ROW
  EXECUTE FUNCTION funnel_events_enforce_daily_cap();


-- ── funnel_events_creation_log + per-IP hourly limit (layer 1) ─────────
-- Same shape as pending_claims_creation_log (049): a bare (ip_address,
-- created_at) log, counted by a BEFORE INSERT trigger on ITSELF, so the cap
-- holds independently of whatever the caller does with funnel_events.
CREATE TABLE IF NOT EXISTS funnel_events_creation_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS funnel_events_creation_log_ip_recent_idx
  ON funnel_events_creation_log (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_creation_log_created_at_idx
  ON funnel_events_creation_log (created_at);

ALTER TABLE funnel_events_creation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE funnel_events_creation_log FROM PUBLIC, anon, authenticated;

-- 300/hour per IP, not 049's 20/hour — see the header for why funnel traffic
-- needs a far more generous per-IP allowance than a signup-stash action.
CREATE OR REPLACE FUNCTION funnel_events_hourly_limit()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 300 $$;

REVOKE ALL ON FUNCTION funnel_events_hourly_limit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION funnel_events_enforce_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent INTEGER;
  v_limit  INTEGER := funnel_events_hourly_limit();
BEGIN
  SELECT count(*) INTO v_recent
  FROM funnel_events_creation_log
  WHERE ip_address = NEW.ip_address
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'funnel event rate limit reached (% per hour)', v_limit
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnel_events_creation_rate_limit ON funnel_events_creation_log;
CREATE TRIGGER funnel_events_creation_rate_limit
  BEFORE INSERT ON funnel_events_creation_log
  FOR EACH ROW
  EXECUTE FUNCTION funnel_events_enforce_rate_limit();


-- ── record_funnel_event: the only writer, service_role only ────────────
-- Mirrors create_pending_claim (049): validates inputs itself (so a bad
-- value from our own route comes back as a clean {ok:false} rather than a
-- raw constraint-violation round trip), inserts the rate-limit log entry
-- first — catching its own PT429 — then the event row, catching the daily
-- cap's PT429 too. Both failure modes report back as the same
-- {ok:false, error:'rate_limited'} shape so the route doesn't need to know
-- which layer tripped.
--
-- RETENTION: prunes funnel_events_creation_log rows older than the 1-hour
-- rate-limit window on EVERY call (docs/decisions/0069). The raw IP address
-- is the one piece of this design that is an identifier, and it must never
-- outlive the window it exists to serve — a longer-lived IP log could be
-- joined back to funnel_events by timestamp and defeat the whole
-- no-identifier point of 0069's source-attribution design. No cron (same
-- "lazy sweep on next write" choice 049 made, 0048 Decision 7): traffic
-- through this function is frequent enough that a row is never far from
-- being pruned.
CREATE OR REPLACE FUNCTION record_funnel_event(
  p_event_type TEXT,
  p_source     TEXT,
  p_path       TEXT,
  p_ip         INET
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM funnel_events_creation_log WHERE created_at <= NOW() - INTERVAL '1 hour';

  IF p_event_type NOT IN ('landing_view', 'lesson_start', 'lesson_complete', 'signup') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_event_type');
  END IF;

  IF p_source IS NOT NULL AND p_source NOT IN ('instagram', 'telegram', 'direct') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;

  IF p_path IS NOT NULL AND char_length(p_path) > 512 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'path_too_long');
  END IF;

  BEGIN
    INSERT INTO funnel_events_creation_log (ip_address) VALUES (p_ip);
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END;

  BEGIN
    -- created_at is HOUR-TRUNCATED, not the table's own DEFAULT NOW() —
    -- see 0069 Decision 3's "not linked to your account" privacy-policy
    -- language. A minute/second-precision timestamp on a signup event would
    -- be joinable back to auth.users.created_at (visible to anyone with
    -- table access) and re-identify which learner it was, which is exactly
    -- what the no-identifier design is meant to prevent. Hour precision is
    -- still enough for the channel-comparison reporting this table exists
    -- for.
    INSERT INTO funnel_events (event_type, source, path, created_at)
    VALUES (p_event_type, p_source, p_path, date_trunc('hour', NOW()));
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION record_funnel_event(TEXT, TEXT, TEXT, INET) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_funnel_event(TEXT, TEXT, TEXT, INET) TO service_role;

COMMIT;
