-- ============================================================
-- 063_learner_roster.sql
--
-- AUTH-011. The read path for the Studio learners page (/studio/learners):
-- who the learners of a course are, where they came from and what they
-- have done. The function is named by the card's acceptance; choices made
-- while writing it are in docs/decisions/0116.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 062_review_queue.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies: none. delete_my_account is NOT touched (this migration
-- adds no table and stores nothing), and no access function is touched.
--
-- Why a function: an editor cannot read run_enrolments (058), lesson_opens
-- (056), lesson_attempts (048), signup_acquisitions (053) or auth.users;
-- each is owner-read only. The function is SECURITY DEFINER, read-only
-- (STABLE), and returns rows only for courses where
-- can_edit_course(course, auth.uid()) is true. EXECUTE to authenticated
-- only.
--
-- What an editor sees is privacy-policy.md section 5, "Course authors":
-- email, the invite's contact label, how the learner found the course
-- (course + arrival channel), and their activity in that course: lessons
-- opened and completed, recordings sent and answered, last activity. No
-- score. No Telegram username (ANON-012 is not built).
--
-- ── learner_roster(course?, run?) ───────────────────────────────────────
-- A learner of course C is an account (not deleted, profiles.deleted_at
-- IS NULL) with any of, in C: a run enrolment (revoked or not), a lesson
-- open, a lesson attempt, a voice submission, or a signup acquisition.
-- One row per (course, learner, enrolment): a learner with no enrolment in
-- C gets one row with run/enrolment NULL; a learner with enrolments gets
-- one row per enrolment and no NULL row.
--   lessons_total      published lessons in C
--   lessons_opened     distinct lessons in C with an open, an attempt or a
--                      voice take (an attempt uploaded from before sign-in,
--                      or a take, proves the lesson was opened even when no
--                      open was recorded)
--   lessons_completed  distinct lessons in C with an attempt
--                      ("completed" = attempted, docs/handoff.md)
--   last_activity_at   latest open, attempt or voice take in C; NULL if
--                      none (a signup acquisition alone is not activity)
--   voices_sent/answered  takes of THIS enrolment; answered = feedback
--                      published. 0 on a row without an enrolment.
--   acquisition_*      the learner's signup acquisition (053), only when it
--                      names no course or a course the caller edits; NULL
--                      otherwise, and NULL when none was recorded.
-- The run filter keeps rows of that run only.
-- Order: last activity, newest first (none last), then email.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE OR REPLACE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION learner_roster(
  p_course_id UUID DEFAULT NULL,
  p_run_id    UUID DEFAULT NULL
)
RETURNS TABLE (
  course_id                UUID,
  course_title             TEXT,
  user_id                  UUID,
  learner_email            TEXT,
  enrolment_id             UUID,
  run_id                   UUID,
  run_title                TEXT,
  run_starts_at            TIMESTAMPTZ,
  tier                     TEXT,
  enrolment_revoked_at     TIMESTAMPTZ,
  invitee_name             TEXT,
  invitee_contact          TEXT,
  acquisition_source       TEXT,
  acquisition_course_id    UUID,
  acquisition_course_title TEXT,
  lessons_total            INTEGER,
  lessons_opened           INTEGER,
  lessons_completed        INTEGER,
  last_activity_at         TIMESTAMPTZ,
  voices_sent              INTEGER,
  voices_answered          INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  courses_ok AS (
    SELECT c.id, c.title
    FROM courses c, me
    WHERE (p_course_id IS NULL OR c.id = p_course_id)
      AND can_edit_course(c.id, me.uid)
  ),
  course_lessons AS (
    SELECT l.id AS lesson_id, l.course_id, l.published_version_id
    FROM lessons l
    JOIN courses_ok co ON co.id = l.course_id
  ),
  opens AS (
    SELECT cl.course_id, o.user_id, o.lesson_id, o.last_opened_at AS at
    FROM lesson_opens o
    JOIN course_lessons cl ON cl.lesson_id = o.lesson_id
  ),
  attempts AS (
    SELECT cl.course_id, a.user_id, v.lesson_id, max(a.created_at) AS at
    FROM lesson_attempts a
    JOIN lesson_versions v ON v.id = a.lesson_version_id
    JOIN course_lessons cl ON cl.lesson_id = v.lesson_id
    GROUP BY cl.course_id, a.user_id, v.lesson_id
  ),
  takes AS (
    SELECT s.course_id, s.user_id, s.enrolment_id, s.lesson_id, s.submitted_at,
           (f.published_at IS NOT NULL) AS answered
    FROM voice_submissions s
    JOIN courses_ok co ON co.id = s.course_id
    LEFT JOIN voice_feedback f ON f.submission_id = s.id
  ),
  enrolments AS (
    SELECT r.course_id, e.user_id, e.id AS enrolment_id, e.tier, e.revoked_at,
           r.id AS run_id, r.title AS run_title, r.starts_at
    FROM run_enrolments e
    JOIN course_runs r ON r.id = e.run_id
    JOIN courses_ok co ON co.id = r.course_id
  ),
  learners AS (
    SELECT course_id, user_id FROM enrolments
    UNION SELECT course_id, user_id FROM opens
    UNION SELECT course_id, user_id FROM attempts
    UNION SELECT course_id, user_id FROM takes
    UNION SELECT sa.course_id, sa.user_id
          FROM signup_acquisitions sa JOIN courses_ok co ON co.id = sa.course_id
  ),
  activity AS (
    SELECT ln.course_id, ln.user_id,
      (SELECT count(*) FROM (
         SELECT lesson_id FROM opens o WHERE o.course_id = ln.course_id AND o.user_id = ln.user_id
         UNION
         SELECT lesson_id FROM attempts a WHERE a.course_id = ln.course_id AND a.user_id = ln.user_id
         UNION
         SELECT lesson_id FROM takes t WHERE t.course_id = ln.course_id AND t.user_id = ln.user_id
       ) x)::INTEGER AS lessons_opened,
      (SELECT count(*) FROM attempts a
        WHERE a.course_id = ln.course_id AND a.user_id = ln.user_id)::INTEGER AS lessons_completed,
      GREATEST(
        (SELECT max(o.at) FROM opens o WHERE o.course_id = ln.course_id AND o.user_id = ln.user_id),
        (SELECT max(a.at) FROM attempts a WHERE a.course_id = ln.course_id AND a.user_id = ln.user_id),
        (SELECT max(t.submitted_at) FROM takes t WHERE t.course_id = ln.course_id AND t.user_id = ln.user_id)
      ) AS last_activity_at
    FROM learners ln
  )
  SELECT
    co.id, co.title,
    ln.user_id, u.email::TEXT,
    en.enrolment_id, en.run_id, en.run_title, en.starts_at, en.tier, en.revoked_at,
    inv.invitee_name, inv.invitee_contact,
    sa.source, sa.course_id, ac.title,
    (SELECT count(*) FROM course_lessons cl
      WHERE cl.course_id = co.id AND cl.published_version_id IS NOT NULL)::INTEGER,
    act.lessons_opened, act.lessons_completed, act.last_activity_at,
    COALESCE((SELECT count(*) FROM takes t WHERE t.enrolment_id = en.enrolment_id), 0)::INTEGER,
    COALESCE((SELECT count(*) FROM takes t WHERE t.enrolment_id = en.enrolment_id AND t.answered), 0)::INTEGER
  FROM learners ln
  JOIN courses_ok co ON co.id = ln.course_id
  JOIN profiles p    ON p.id = ln.user_id AND p.deleted_at IS NULL
  JOIN auth.users u  ON u.id = ln.user_id
  JOIN activity act  ON act.course_id = ln.course_id AND act.user_id = ln.user_id
  LEFT JOIN enrolments en ON en.course_id = ln.course_id AND en.user_id = ln.user_id
  LEFT JOIN LATERAL (
    SELECT i.invitee_name, i.invitee_contact
    FROM run_invites i
    WHERE i.enrolment_id = en.enrolment_id
    ORDER BY i.claimed_at DESC NULLS LAST
    LIMIT 1
  ) inv ON TRUE
  -- The acquisition is shown when it names no course or a course the
  -- caller edits: that the learner signed up from a course someone else
  -- edits is not this course's data (0116 Decision 3).
  LEFT JOIN signup_acquisitions sa
    ON sa.user_id = ln.user_id
   AND (sa.course_id IS NULL OR can_edit_course(sa.course_id, (SELECT uid FROM me)))
  LEFT JOIN courses ac ON ac.id = sa.course_id
  WHERE (p_run_id IS NULL OR en.run_id = p_run_id)
  ORDER BY act.last_activity_at DESC NULLS LAST, u.email, en.starts_at;
$$;

REVOKE ALL ON FUNCTION learner_roster(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION learner_roster(UUID, UUID) TO authenticated;

COMMIT;
