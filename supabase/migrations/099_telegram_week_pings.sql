-- ============================================================
-- 099_telegram_week_pings.sql
--
-- COH-012 (#203): a daily cron tells a cohort enrolee who linked the Telegram bot
-- (090) that a week of their course has opened (docs/decisions/0140 event 1, option A;
-- choices made while writing this file are in docs/decisions/0197). This file is the
-- one decision SQL owns: which (enrolment, week) is due a message now, and the log
-- that keeps a re-run from sending a second one. Wording and sending are
-- lib/telegram/weekPings.ts; the route is app/api/cron/telegram-reminders.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 098_voice_analysis_retention.sql
--   latest body of the account-delete RPC   -> 096_voice_analyses.sql, NOT re-emitted:
--     the log below holds no user id, only an enrolment with ON DELETE CASCADE, and
--     delete_my_account (096) already deletes the learner's run_enrolments, so the log
--     rows go with them.
-- _lesson_access_at (058) is NOT re-emitted either: the unlock moment below is the same
-- expression it uses (see 1), and supabase/verify/099 checks the two agree.
-- REQUIRES 058 (course_runs, run_enrolments, lessons.week) and 090 (telegram_links).
--
-- ── 1. When a week opens ────────────────────────────────────────────────
-- Week N of a run opens at run.starts_at + 7*(N-1) days (058 header §3; the expression
-- in _lesson_access_at, docs/decisions/0093). Computed here at send time from the run and
-- the lessons as they are now, never from a stored queue: an unstarted run's dates can
-- still move (0093). A week counts when it has a published, non-archived `entitled`
-- lesson with that week; week 1 always counts (it is "the course has started"). A week
-- that would open at or after the run's end is not announced (an early close, 0093).
--
-- ── 2. Who, and which weeks are still news ──────────────────────────────
-- An enrolment that is not revoked, of a learner with an ACTIVE telegram_links row, on
-- a published course. The week must have opened after the LATER of the enrolment and the
-- link (linked_at is reset when a stopped learner links again, 090), so someone who
-- enrols or links in week 3 is not sent weeks 1 and 2; and within the last 3 days, so a
-- cron that was down for a week does not send a stale "week 2 is open" in week 3. Which
-- calls a basic or extended learner sees is COH-013's business, not this file's.
--
-- ── 3. telegram_week_pings ──────────────────────────────────────────────
-- One row per (enrolment, week): "this week was claimed for sending". No user id, no chat
-- id, no text. RLS on, no policy, no grant: every access is the function below.
--
-- ── 4. telegram_week_ping_claim(p_limit, p_now) ─────────────────────────
-- service_role only. Inserts the log row for each due (enrolment, week) and returns
-- exactly the rows it inserted, oldest first, at most p_limit (default 100; what is left
-- is still due on the next run while inside the 3 days). The insert is the decision: the
-- first call wins, a re-run or a concurrent run finds the row (ON CONFLICT DO NOTHING)
-- and returns nothing for it. The row is claimed BEFORE it is sent, so a send that fails
-- is not retried (docs/decisions/0177 Decision 4, 0180 Decision 6). p_now exists so the
-- verify script can move the clock; the function is service_role only, so no client can.
--
-- Not destructive: one new table and one new function; no DROP, no TRUNCATE, no UPDATE
-- or DELETE of an existing row. Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR
-- REPLACE.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_week_pings (
  enrolment_id UUID        NOT NULL REFERENCES run_enrolments(id) ON DELETE CASCADE,
  week         INTEGER     NOT NULL CHECK (week >= 1),
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (enrolment_id, week)
);

ALTER TABLE telegram_week_pings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_week_pings FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION telegram_week_ping_claim(
  p_limit INTEGER     DEFAULT 100,
  p_now   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  enrolment_id UUID,
  week         INTEGER,
  recipient_id UUID,
  lang         TEXT,
  course_slug  TEXT,
  course_title TEXT,
  run_id       UUID,
  opened_at    TIMESTAMPTZ
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT e.id AS enrolment_id,
           w.week AS week,
           e.user_id AS recipient_id,
           l.lang AS lang,
           c.slug AS course_slug,
           c.title AS course_title,
           r.id AS run_id,
           r.starts_at + make_interval(days => 7 * (w.week - 1)) AS opened_at
    FROM run_enrolments e
    JOIN course_runs r ON r.id = e.run_id
    JOIN courses c ON c.id = r.course_id AND c.status = 'published'
    JOIN telegram_links l ON l.user_id = e.user_id AND l.stopped_at IS NULL
    CROSS JOIN LATERAL (
      SELECT 1 AS week
      UNION
      SELECT ls.week::INTEGER
      FROM lessons ls
      WHERE ls.course_id = r.course_id
        AND ls.access_level = 'entitled'
        AND ls.published_version_id IS NOT NULL
        AND ls.archived_at IS NULL
        AND ls.week IS NOT NULL
    ) w
    WHERE e.revoked_at IS NULL
      AND r.starts_at + make_interval(days => 7 * (w.week - 1)) <= p_now
      AND r.starts_at + make_interval(days => 7 * (w.week - 1)) <  r.ends_at
      AND r.starts_at + make_interval(days => 7 * (w.week - 1)) >  p_now - INTERVAL '3 days'
      AND r.starts_at + make_interval(days => 7 * (w.week - 1)) >  GREATEST(e.enrolled_at, l.linked_at)
      AND NOT EXISTS (
        SELECT 1 FROM telegram_week_pings p
        WHERE p.enrolment_id = e.id AND p.week = w.week
      )
    ORDER BY opened_at, e.id, w.week
    LIMIT GREATEST(COALESCE(p_limit, 100), 0)
  ),
  claimed AS (
    INSERT INTO telegram_week_pings (enrolment_id, week)
    SELECT d.enrolment_id, d.week FROM due d
    ON CONFLICT (enrolment_id, week) DO NOTHING
    RETURNING telegram_week_pings.enrolment_id, telegram_week_pings.week
  )
  SELECT d.enrolment_id, d.week, d.recipient_id, d.lang, d.course_slug, d.course_title, d.run_id, d.opened_at
  FROM claimed cl
  JOIN due d ON d.enrolment_id = cl.enrolment_id AND d.week = cl.week
  ORDER BY d.opened_at, d.enrolment_id, d.week;
$$;

REVOKE ALL ON FUNCTION telegram_week_ping_claim(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_week_ping_claim(INTEGER, TIMESTAMPTZ) TO service_role;

COMMIT;
