-- ============================================================
-- 100_telegram_call_pings.sql
--
-- COH-013 (#204): the daily cron tells an EXTENDED cohort enrolee who linked the
-- Telegram bot (090) about their run's calls that start soon (docs/decisions/0140
-- event 4, under scheduling option A: a digest, not an hour-before alert; choices made
-- while writing this file are in docs/decisions/0198). This file is the one decision SQL
-- owns: which (enrolment, call) is due a message now, and the log that keeps a re-run
-- from announcing a call twice. Wording and sending are lib/telegram/callPings.ts; the
-- route is app/api/cron/telegram-reminders (COH-012's), which now runs both.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 099_telegram_week_pings.sql
--   latest body of the account-delete RPC   -> 096_voice_analyses.sql, NOT re-emitted:
--     the log below holds no user id, only an enrolment and a call, both ON DELETE
--     CASCADE, and delete_my_account (096) already deletes the learner's run_enrolments,
--     so the log rows go with them.
-- course_calls (058) is NOT re-emitted either: it answers for auth.uid(), which a cron
-- does not have, so its rule is restated in 1 and supabase/verify/100 checks the two agree.
-- REQUIRES 058 (course_runs, run_enrolments, run_calls) and 090 (telegram_links).
--
-- ── 1. Who sees which call ──────────────────────────────────────────────
-- 058's course_calls: a learner with a non-revoked `extended` enrolment sees the calls of
-- THAT run, and a basic learner sees none. The same rule here, plus: the learner has an
-- ACTIVE telegram_links row, and the course is published. A revoked enrolment, a basic
-- one, a never-linked or stopped learner, and a draft course get nothing.
--
-- ── 2. Which calls are due ──────────────────────────────────────────────
-- A call whose starts_at is after p_now and at most 25 hours after it. The card says "the
-- next 24 hours"; the extra hour is because the cron fires once a day anywhere inside its
-- hour (docs/decisions/0140), so two consecutive runs can be up to 24 h 59 min apart and a
-- call starting in that gap would be announced by neither. A call that has already started
-- is never announced. Nothing here promises a lead time; the text says when the call is.
--
-- ── 3. telegram_call_pings ──────────────────────────────────────────────
-- One row per (enrolment, call): "this call was claimed for this enrolee". No user id,
-- chat id or text. RLS on, no policy, no grant: every access is the function below. A call
-- that is later moved or deleted is not announced again for the same enrolee (the card:
-- "at most once"); deleting the call deletes its rows.
--
-- ── 4. telegram_call_ping_claim(p_limit, p_now) ─────────────────────────
-- service_role only. Inserts the log row for each due (enrolment, call) and returns exactly
-- the rows it inserted, ordered by learner then start time so a learner's digest stays
-- together, at most p_limit (default 100). The insert is the decision: the first call wins,
-- a re-run or a concurrent run finds the row (ON CONFLICT DO NOTHING) and returns nothing
-- for it. The row is claimed BEFORE it is sent, so a send that fails is not retried
-- (docs/decisions/0177 Decision 4, 0180 Decision 6, 0197 Decision 7). p_now exists so the
-- verify script can move the clock; the function is service_role only, so no client can.
--
-- Not destructive: one new table and one new function; no DROP, no TRUNCATE, no UPDATE
-- or DELETE of an existing row. Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR
-- REPLACE.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_call_pings (
  enrolment_id UUID        NOT NULL REFERENCES run_enrolments(id) ON DELETE CASCADE,
  call_id      UUID        NOT NULL REFERENCES run_calls(id)      ON DELETE CASCADE,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (enrolment_id, call_id)
);
CREATE INDEX IF NOT EXISTS telegram_call_pings_call_idx ON telegram_call_pings (call_id);

ALTER TABLE telegram_call_pings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_call_pings FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION telegram_call_ping_claim(
  p_limit INTEGER     DEFAULT 100,
  p_now   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  enrolment_id   UUID,
  call_id        UUID,
  recipient_id   UUID,
  lang           TEXT,
  time_zone      TEXT,
  course_slug    TEXT,
  course_title   TEXT,
  call_starts_at TIMESTAMPTZ,
  call_title     TEXT,
  meet_url       TEXT
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT e.id AS enrolment_id,
           k.id AS call_id,
           e.user_id AS recipient_id,
           l.lang AS lang,
           l.time_zone AS time_zone,
           c.slug AS course_slug,
           c.title AS course_title,
           k.starts_at AS call_starts_at,
           k.title AS call_title,
           k.meet_url AS meet_url
    FROM run_enrolments e
    JOIN course_runs r ON r.id = e.run_id
    JOIN courses c ON c.id = r.course_id AND c.status = 'published'
    JOIN telegram_links l ON l.user_id = e.user_id AND l.stopped_at IS NULL
    JOIN run_calls k ON k.run_id = r.id
    WHERE e.revoked_at IS NULL
      AND e.tier = 'extended'
      AND k.starts_at >  p_now
      AND k.starts_at <= p_now + INTERVAL '25 hours'
      AND NOT EXISTS (
        SELECT 1 FROM telegram_call_pings p
        WHERE p.enrolment_id = e.id AND p.call_id = k.id
      )
    ORDER BY e.user_id, k.starts_at, k.id, e.id
    LIMIT GREATEST(COALESCE(p_limit, 100), 0)
  ),
  claimed AS (
    INSERT INTO telegram_call_pings (enrolment_id, call_id)
    SELECT d.enrolment_id, d.call_id FROM due d
    ON CONFLICT (enrolment_id, call_id) DO NOTHING
    RETURNING telegram_call_pings.enrolment_id, telegram_call_pings.call_id
  )
  SELECT d.enrolment_id, d.call_id, d.recipient_id, d.lang, d.time_zone, d.course_slug,
         d.course_title, d.call_starts_at, d.call_title, d.meet_url
  FROM claimed cl
  JOIN due d ON d.enrolment_id = cl.enrolment_id AND d.call_id = cl.call_id
  ORDER BY d.recipient_id, d.call_starts_at, d.call_id, d.enrolment_id;
$$;

REVOKE ALL ON FUNCTION telegram_call_ping_claim(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_call_ping_claim(INTEGER, TIMESTAMPTZ) TO service_role;

COMMIT;
