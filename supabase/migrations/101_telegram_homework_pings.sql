-- ============================================================
-- 101_telegram_homework_pings.sql
--
-- TCH-013 (#227): homework (080) reaches a linked student through the Telegram bot (090):
-- once when a teacher assigns it, and once more the day before it is due (docs/decisions/
-- 0152 left this card open; 0140 option A, a daily cron, schedules the second; choices made
-- while writing this file are in docs/decisions/0199). This file is the two decisions SQL owns: which
-- (assignment, student) is due a message now, and the log that keeps either message from
-- going twice. Wording and sending are lib/telegram/homeworkPings.ts; the first is called
-- by /api/studio/homework after assign_homework succeeds, the second by the daily cron
-- /api/cron/telegram-reminders (COH-012's).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 100_telegram_call_pings.sql
--   latest body of the account-delete RPC   -> 096_voice_analyses.sql, NOT re-emitted.
--     The log below holds a user id, so it must go with the account, and the profile row
--     stays (ADR 0002), so its ON DELETE CASCADE would never fire. It goes through the
--     link instead: a row exists only for a student with a live link to the assignment's
--     teacher, and delete_my_account (096) deletes teacher_student_links for both sides,
--     which fires _teacher_link_ended_drop_homework (080, re-emitted in section 4).
--     supabase/verify/101 deletes a student's and a teacher's account and counts the rows.
-- REQUIRES 075 (lesson_completion), 076 (_teacher_linked), 080 (homework_assignments,
-- _homework_recipients, _homework_progress) and 090 (telegram_links).
--
-- ── 1. telegram_homework_pings ──────────────────────────────────────────
-- One row per (assignment, student, kind): "this message was claimed for this student".
-- kind is 'new' (just assigned) or 'due' (due tomorrow). No chat id, no text, no
-- content. RLS on, no policy, no grant: every access is a function below. Deleting the
-- assignment deletes its rows (cascade); ending the student's link to the teacher, or
-- deleting either account, deletes the student's rows for that teacher (section 4).
--
-- ── 2. telegram_homework_new_claim(p_assignment, p_limit, p_now) ────────
-- service_role only. Inserts the 'new' log row for each recipient of THIS assignment
-- that has an ACTIVE telegram_links row and returns exactly the rows it inserted, so the
-- insert is the decision and a repeated call gets nothing for a row already claimed.
-- Recipients are _homework_recipients(teacher, NULL)'s, the one definition of who
-- receives homework (a direct target or a live member of a targeted group, with the
-- teacher's link active). The course must be published and a lesson published and not
-- archived, the conditions under which my_homework() shows the homework at all. An
-- assignment older than an hour is not announced (the route calls this right after the
-- assign; the guard keeps a stray call from announcing old homework). The row is claimed
-- BEFORE it is sent, so a send that fails is not retried (0177 Decision 4).
--
-- ── 3. telegram_homework_due_claim(p_limit, p_now) ──────────────────────
-- service_role only, the same claim-then-send shape. A (assignment, student) is due a
-- 'due' message when, in the student's time zone saved at link time (UTC with none, or
-- with one this database does not know), the assignment's due date is the day after
-- today; the course is published; the student has an ACTIVE link; the assignment is NOT
-- done for them (_homework_progress: done = every lesson in scope complete; an empty
-- scope is never done and is not announced either); and they were not sent a 'new'
-- message for it in the last 12 hours (that message carried the date). Because the date
-- is tomorrow in the student's own zone, each student matches on exactly one calendar
-- day, so consecutive daily runs cannot skip or repeat a homework except across an
-- outage. due_on is a DATE with no zone (0152 Decision 5); only the comparison to the
-- student's local day uses the zone, and nothing here touches access.
--
-- Not destructive: one new table, two new functions, one trigger function re-emitted
-- (adds one DELETE of the new table's own rows); no DROP, no TRUNCATE, no UPDATE or
-- DELETE of an existing row. Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR
-- REPLACE.
-- ============================================================

BEGIN;

-- ── 1. The log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_homework_pings (
  assignment_id UUID        NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES profiles(id)             ON DELETE CASCADE,
  kind          TEXT        NOT NULL CHECK (kind IN ('new', 'due')),
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, student_id, kind)
);
CREATE INDEX IF NOT EXISTS telegram_homework_pings_student_idx ON telegram_homework_pings (student_id);

ALTER TABLE telegram_homework_pings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_homework_pings FROM PUBLIC, anon, authenticated;


-- ── 2. New homework, right after the assign ─────────────────────────────
CREATE OR REPLACE FUNCTION telegram_homework_new_claim(
  p_assignment UUID,
  p_limit      INTEGER     DEFAULT 50,
  p_now        TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  assignment_id UUID,
  recipient_id  UUID,
  lang          TEXT,
  course_slug   TEXT,
  course_title  TEXT,
  lesson_title  TEXT,
  due_on        DATE
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT a.id AS assignment_id,
           r.student_id AS recipient_id,
           l.lang AS lang,
           c.slug AS course_slug,
           c.title AS course_title,
           ls.title AS lesson_title,
           a.due_on AS due_on
    FROM homework_assignments a
    JOIN courses c ON c.id = a.course_id AND c.status = 'published'
    LEFT JOIN lessons ls ON ls.id = a.lesson_id
    CROSS JOIN LATERAL _homework_recipients(a.teacher_id, NULL) r
    JOIN telegram_links l ON l.user_id = r.student_id AND l.stopped_at IS NULL
    WHERE a.id = p_assignment
      AND r.assignment_id = a.id
      AND a.created_at > p_now - INTERVAL '1 hour'
      AND (a.lesson_id IS NULL OR (ls.published_version_id IS NOT NULL AND ls.archived_at IS NULL))
      AND NOT EXISTS (
        SELECT 1 FROM telegram_homework_pings p
        WHERE p.assignment_id = a.id AND p.student_id = r.student_id AND p.kind = 'new'
      )
    ORDER BY r.student_id
    LIMIT GREATEST(COALESCE(p_limit, 50), 0)
  ),
  claimed AS (
    INSERT INTO telegram_homework_pings (assignment_id, student_id, kind)
    SELECT d.assignment_id, d.recipient_id, 'new' FROM due d
    ON CONFLICT (assignment_id, student_id, kind) DO NOTHING
    RETURNING telegram_homework_pings.assignment_id, telegram_homework_pings.student_id
  )
  SELECT d.assignment_id, d.recipient_id, d.lang, d.course_slug, d.course_title, d.lesson_title, d.due_on
  FROM claimed cl
  JOIN due d ON d.assignment_id = cl.assignment_id AND d.recipient_id = cl.student_id
  ORDER BY d.recipient_id;
$$;

REVOKE ALL ON FUNCTION telegram_homework_new_claim(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_homework_new_claim(UUID, INTEGER, TIMESTAMPTZ) TO service_role;


-- ── 3. Due tomorrow, from the daily cron ────────────────────────────────
CREATE OR REPLACE FUNCTION telegram_homework_due_claim(
  p_limit INTEGER     DEFAULT 100,
  p_now   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  assignment_id UUID,
  recipient_id  UUID,
  lang          TEXT,
  course_slug   TEXT,
  course_title  TEXT,
  lesson_title  TEXT,
  due_on        DATE
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cand AS (
    -- Any zone is between UTC-12 and UTC+14, so "tomorrow" there is one of these three UTC days.
    SELECT a.id AS assignment_id, a.teacher_id, a.course_id, a.lesson_id, a.due_on,
           c.slug AS course_slug, c.title AS course_title
    FROM homework_assignments a
    JOIN courses c ON c.id = a.course_id AND c.status = 'published'
    WHERE a.due_on BETWEEN (p_now AT TIME ZONE 'UTC')::date AND (p_now AT TIME ZONE 'UTC')::date + 2
  ),
  prog AS (
    SELECT x.assignment_id, x.student_id, x.done_lessons, x.total_lessons
    FROM (SELECT DISTINCT teacher_id FROM cand) t
    CROSS JOIN LATERAL _homework_progress(t.teacher_id) x
  ),
  due AS (
    SELECT cd.assignment_id AS assignment_id,
           pr.student_id AS recipient_id,
           l.lang AS lang,
           cd.course_slug AS course_slug,
           cd.course_title AS course_title,
           ls.title AS lesson_title,
           cd.due_on AS due_on
    FROM cand cd
    JOIN prog pr ON pr.assignment_id = cd.assignment_id
    JOIN telegram_links l ON l.user_id = pr.student_id AND l.stopped_at IS NULL
    LEFT JOIN pg_catalog.pg_timezone_names z ON z.name = l.time_zone
    LEFT JOIN lessons ls ON ls.id = cd.lesson_id
    WHERE cd.due_on = (p_now AT TIME ZONE COALESCE(z.name, 'UTC'))::date + 1
      AND pr.total_lessons > 0
      AND pr.done_lessons < pr.total_lessons
      AND NOT EXISTS (
        SELECT 1 FROM telegram_homework_pings p
        WHERE p.assignment_id = cd.assignment_id AND p.student_id = pr.student_id
          AND (p.kind = 'due' OR (p.kind = 'new' AND p.claimed_at > p_now - INTERVAL '12 hours'))
      )
    ORDER BY pr.student_id, cd.due_on, cd.assignment_id
    LIMIT GREATEST(COALESCE(p_limit, 100), 0)
  ),
  claimed AS (
    INSERT INTO telegram_homework_pings (assignment_id, student_id, kind)
    SELECT d.assignment_id, d.recipient_id, 'due' FROM due d
    ON CONFLICT (assignment_id, student_id, kind) DO NOTHING
    RETURNING telegram_homework_pings.assignment_id, telegram_homework_pings.student_id
  )
  SELECT d.assignment_id, d.recipient_id, d.lang, d.course_slug, d.course_title, d.lesson_title, d.due_on
  FROM claimed cl
  JOIN due d ON d.assignment_id = cl.assignment_id AND d.recipient_id = cl.student_id
  ORDER BY d.recipient_id, d.due_on, d.assignment_id;
$$;

REVOKE ALL ON FUNCTION telegram_homework_due_claim(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_homework_due_claim(INTEGER, TIMESTAMPTZ) TO service_role;


-- ── 4. _teacher_link_ended_drop_homework (re-emitted from 080) ──────────
-- Same body plus one DELETE: the student's log rows for this teacher's assignments. The
-- trigger fires when a link ends and when a link row is deleted, which is how both
-- accounts' deletion (096) reaches it.
CREATE OR REPLACE FUNCTION _teacher_link_ended_drop_homework()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM homework_targets
   WHERE teacher_id = OLD.teacher_id AND student_id = OLD.student_id;
  DELETE FROM telegram_homework_pings p
   USING homework_assignments a
   WHERE p.assignment_id = a.id
     AND a.teacher_id = OLD.teacher_id
     AND p.student_id = OLD.student_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION _teacher_link_ended_drop_homework() FROM PUBLIC, anon, authenticated;

COMMIT;
