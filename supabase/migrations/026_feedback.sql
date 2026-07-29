-- ============================================================
-- 026_feedback.sql
--
-- In-app feedback: the "Feedback" button in the top bar writes here.
--
-- WRITE-ONLY FOR THE AUTHOR, BY DESIGN. A user may insert their own row and
-- may read NOTHING — not even the row they just wrote. This is not an
-- oversight to be "fixed" later by adding an owner-read policy: there is no
-- surface that shows a user their past feedback, and a table nobody can read
-- is the cheapest way to guarantee one free-text field never becomes a
-- side-channel for reading another user's words. Admins read and update
-- everything; that is the whole consumer.
--
-- CONSEQUENCE FOR THE INSERT PATH: because there is no owner SELECT policy,
-- the insert must NOT ask for the row back. supabase-js `.insert()` sends
-- `Prefer: return=minimal` and is fine; chaining `.select()` on it would add a
-- RETURNING clause, which PostgREST evaluates against the (absent) SELECT
-- policy, and the whole insert fails. app/api/feedback/route.ts relies on this.
--
-- RATE LIMITING LIVES IN A TRIGGER, NOT IN THE ROUTE. The route cannot do the
-- count itself — it queries as `authenticated`, which RLS shows zero feedback
-- rows, so a count from there would always read 0. Pushing the count into a
-- BEFORE INSERT trigger fixes that (SECURITY DEFINER, so it sees the rows) and
-- buys the stronger property: the cap holds on EVERY insert path, including a
-- caller who skips our route and posts straight to PostgREST with their own
-- token. Same reasoning as the length CHECK below — client validation is a
-- courtesy, the database is the enforcement.
--
-- Safe to re-apply: all operations are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── feedback ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE is stated deliberately, not defaulted. Feedback is the
  -- user's own personal data and the free-text field may contain a great deal
  -- more of it, so it leaves with them. Six existing FKs to profiles have NO
  -- delete action at all (results.user_id, questions.created_by,
  -- questions.reviewed_by, quizzes.created_by, generation_batches.created_by,
  -- question_reports.resolved_by), which is exactly why deleting an auth user
  -- fails today. Do not add the seventh.
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category       TEXT        NOT NULL CHECK (category IN ('bug', 'idea', 'other')),
  message        TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'triaged', 'closed')),

  -- ── captured metadata ─────────────────────────────────────
  -- All nullable, all filled in by the client without asking. A report is
  -- worth more than its context: a browser that declines to give us a viewport
  -- must never cost us the message. Only the lengths are constrained, so a
  -- free-text column cannot be repurposed as storage.
  --
  -- `route` is the single most valuable field here and the whole reason the
  -- button opens a dialog instead of navigating to a page — leaving the page
  -- to file the report would discard the page the report is about.
  route          TEXT        CHECK (route IS NULL OR char_length(route) <= 512),
  user_agent     TEXT        CHECK (user_agent IS NULL OR char_length(user_agent) <= 1024),
  viewport_width  INTEGER    CHECK (viewport_width  IS NULL OR viewport_width  BETWEEN 0 AND 100000),
  viewport_height INTEGER    CHECK (viewport_height IS NULL OR viewport_height BETWEEN 0 AND 100000),
  -- Mirrors lib/theme.ts and the profiles.theme_preference constraint from 025.
  -- The client sends the RESOLVED theme (what was actually on screen), so in
  -- practice this reads 'light' or 'dark'; 'system' is accepted because the
  -- vocabulary is shared and a future capture may send the preference instead.
  theme          TEXT        CHECK (theme IS NULL OR theme IN ('light', 'dark', 'system')),
  -- Build identifier of the bundle the reporter was running — see
  -- lib/appVersion.ts. Deliberately the CLIENT's version, which on a tab left
  -- open across a deploy is older than the server's, and is the one the bug is
  -- actually in.
  app_version    TEXT        CHECK (app_version IS NULL OR char_length(app_version) <= 64),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The server-side half of the length rule. lib/feedback.ts states the same
  -- 10/2000 bounds for the client; this is what actually holds when the client
  -- is bypassed. Measured on the TRIMMED message so twelve spaces is not a
  -- valid report, and in characters (not bytes) so the limit means the same
  -- thing in every script.
  CONSTRAINT feedback_message_length
    CHECK (char_length(btrim(message)) BETWEEN 10 AND 2000)
);

-- Admin triage queue: open items, newest first.
CREATE INDEX IF NOT EXISTS feedback_status_idx
  ON feedback (status, created_at DESC);

-- Serves the rate-limit count in the trigger below, which is the one query
-- that runs on every single submission.
CREATE INDEX IF NOT EXISTS feedback_user_recent_idx
  ON feedback (user_id, created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Supabase grants anon/authenticated privileges on new public-schema tables by
-- default, so start from nothing and hand back exactly what is needed (the
-- 017 player_ratings precedent). Note SELECT and UPDATE *are* granted to
-- `authenticated`: admins are ordinary `authenticated` sessions distinguished
-- only by profiles.role, so the grant has to be coarse and RLS does the real
-- narrowing. `anon` gets nothing — feedback is signed-in only.
REVOKE ALL ON TABLE feedback FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE feedback TO authenticated;

-- Split by verb rather than one FOR ALL policy: a FOR ALL ... USING(...) leaves
-- INSERT unprotected, because USING is not consulted for inserts (the same trap
-- called out in 024).
DROP POLICY IF EXISTS "feedback: author insert" ON feedback;
CREATE POLICY "feedback: author insert"
  ON feedback FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- There is deliberately no "author read own" policy. See the header.
DROP POLICY IF EXISTS "feedback: admin read" ON feedback;
CREATE POLICY "feedback: admin read"
  ON feedback FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "feedback: admin update" ON feedback;
CREATE POLICY "feedback: admin update"
  ON feedback FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ── rate limit ──────────────────────────────────────────────
-- Submissions per user per rolling hour. Rolling, not calendar: a calendar
-- hour lets someone spend the whole budget at :59 and the whole next budget at
-- :01. Five is a starting number — a person with a real bug to report writes
-- one message, and someone on their fifth in an hour is not reporting bugs.
CREATE OR REPLACE FUNCTION feedback_hourly_limit()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 5 $$;

-- Revoked for consistency with every other function here, not because the
-- number is secret. Both callers below are SECURITY DEFINER and so execute as
-- the owner, which keeps its EXECUTE privilege.
REVOKE ALL ON FUNCTION feedback_hourly_limit() FROM public, anon, authenticated;

-- SECURITY DEFINER because the count has to see rows the caller cannot: as
-- `authenticated` this SELECT is filtered by RLS to zero and the cap would
-- never trip.
--
-- The custom SQLSTATE is the "distinguishable error" the UI needs. PT429 is
-- PostgREST's status-override convention (PTxxx sets HTTP status xxx), so the
-- client sees a real 429 AND `error.code === 'PT429'`; the route matches on the
-- code, never on the message text.
--
-- There is a theoretical TOCTOU window between the count and the insert, so two
-- simultaneous requests could both pass at the boundary. Accepted: this is a
-- human clicking a dialog, and the failure mode is a sixth row, not an open door.
CREATE OR REPLACE FUNCTION feedback_enforce_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent INTEGER;
  v_limit  INTEGER := feedback_hourly_limit();
BEGIN
  SELECT count(*) INTO v_recent
  FROM feedback
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'feedback rate limit reached (% per hour)', v_limit
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_rate_limit ON feedback;
CREATE TRIGGER feedback_rate_limit
  BEFORE INSERT ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION feedback_enforce_rate_limit();


-- ── feedback_quota: the caller's own remaining budget ───────
-- Only called on the error path, to turn "you have hit the limit" into "try
-- again in 23 minutes". SECURITY DEFINER for the same reason as the trigger —
-- the caller cannot read the table — and it returns only aggregates over the
-- caller's OWN rows, never a message, a row id or anyone else's data.
CREATE OR REPLACE FUNCTION feedback_quota()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID    := auth.uid();
  v_limit  INTEGER := feedback_hourly_limit();
  v_used   INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT count(*), min(created_at) INTO v_used, v_oldest
  FROM feedback
  WHERE user_id = v_user
    AND created_at > NOW() - INTERVAL '1 hour';

  RETURN jsonb_build_object(
    'ok',        true,
    'limit',     v_limit,
    'used',      v_used,
    'remaining', GREATEST(v_limit - v_used, 0),
    -- When the oldest submission in the window ages out, a slot frees up.
    'resets_at', CASE WHEN v_oldest IS NULL THEN NULL
                      ELSE v_oldest + INTERVAL '1 hour' END
  );
END;
$$;

REVOKE ALL ON FUNCTION feedback_quota() FROM public, anon;
GRANT EXECUTE ON FUNCTION feedback_quota() TO authenticated;
