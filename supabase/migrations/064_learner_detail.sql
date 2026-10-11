-- ============================================================
-- 064_learner_detail.sql
--
-- AUTH-013. The read path for the Studio learner page
-- (/studio/learners/[userId]): one learner's activity per lesson, and every
-- recording they sent, in the courses the caller edits. Owner-approved as a
-- schema change on 2026-10-11 (#178); choices made while writing it are in
-- docs/decisions/0119.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 063_learner_roster.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies: none. delete_my_account is NOT touched (this migration
-- adds no table and stores nothing), and no access function is touched.
--
-- Why functions: the same reason as 063. An editor cannot read
-- run_enrolments (058), lesson_opens (056) or lesson_attempts (048); each is
-- owner-read only. Both functions are SECURITY DEFINER, read-only (STABLE),
-- and return rows only for courses where can_edit_course(course,
-- auth.uid()) is true AND the learner is a learner of that course by 063's
-- definition. EXECUTE to authenticated only.
--
-- What an editor sees is privacy-policy.md section 5, "Course authors"
-- (lessons opened and completed, recordings sent and answered, last
-- activity), broken down per lesson, plus the recordings themselves
-- ("Voice recordings are heard by you and the course author"). No score:
-- lesson_attempts' earned/possible are never read into an output column.
--
-- ── 1. learner_lessons(user) ────────────────────────────────────────────
-- One row per lesson of each such course that is published and not
-- archived, or that the learner has activity in (so an archived lesson
-- they worked on still shows).
--   opened_at / last_opened_at  lesson_opens (056); NULL when no open row
--   opened             063's rule: an open, an attempt or a voice take
--   first/last_completed_at  first and latest attempt ("completed" =
--                      attempted, docs/handoff.md)
--   voices_sent/answered  takes in this lesson across the learner's
--                      enrolments; answered = feedback published
--   last_activity_at   latest open, attempt or take in this lesson
-- Order: course title, then lesson ordinal.
--
-- ── 2. learner_recordings(user) ─────────────────────────────────────────
-- One row per voice take of the learner in such a course, revoked
-- enrolments included (marked), described from the version the take was
-- recorded against: prompt, maxSeconds and the compare slot.
-- recording_removed = the 6-month purge emptied it (060). Feedback is the
-- partner's own text, draft or published.
-- Order: course, run start, lesson ordinal, block id.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. learner_lessons ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION learner_lessons(p_user_id UUID)
RETURNS TABLE (
  course_id           UUID,
  course_title        TEXT,
  lesson_id           UUID,
  lesson_title        TEXT,
  lesson_ordinal      INTEGER,
  week                INTEGER,
  lesson_listed       BOOLEAN,
  opened              BOOLEAN,
  first_opened_at     TIMESTAMPTZ,
  last_opened_at      TIMESTAMPTZ,
  first_completed_at  TIMESTAMPTZ,
  last_completed_at   TIMESTAMPTZ,
  voices_sent         INTEGER,
  voices_answered     INTEGER,
  last_activity_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  learner AS (
    SELECT p.id FROM profiles p WHERE p.id = p_user_id AND p.deleted_at IS NULL
  ),
  courses_ok AS (
    SELECT c.id, c.title
    FROM courses c, me
    WHERE can_edit_course(c.id, me.uid)
  ),
  opens AS (
    SELECT o.lesson_id, o.first_opened_at, o.last_opened_at
    FROM lesson_opens o
    JOIN learner ON learner.id = o.user_id
  ),
  attempts AS (
    SELECT v.lesson_id, min(a.created_at) AS first_at, max(a.created_at) AS last_at
    FROM lesson_attempts a
    JOIN learner ON learner.id = a.user_id
    JOIN lesson_versions v ON v.id = a.lesson_version_id
    GROUP BY v.lesson_id
  ),
  takes AS (
    SELECT s.lesson_id,
           count(*)::INTEGER AS sent,
           count(*) FILTER (WHERE f.published_at IS NOT NULL)::INTEGER AS answered,
           max(s.submitted_at) AS last_at
    FROM voice_submissions s
    JOIN learner ON learner.id = s.user_id
    LEFT JOIN voice_feedback f ON f.submission_id = s.id
    GROUP BY s.lesson_id
  ),
  -- 063's learner definition, for this one user: an enrolment (revoked or
  -- not), an open, an attempt, a take, or a signup acquisition in the course.
  learner_courses AS (
    SELECT r.course_id FROM run_enrolments e
      JOIN course_runs r ON r.id = e.run_id
      JOIN learner ON learner.id = e.user_id
    UNION SELECT l.course_id FROM opens    x JOIN lessons l ON l.id = x.lesson_id
    UNION SELECT l.course_id FROM attempts x JOIN lessons l ON l.id = x.lesson_id
    UNION SELECT l.course_id FROM takes    x JOIN lessons l ON l.id = x.lesson_id
    UNION SELECT sa.course_id FROM signup_acquisitions sa
      JOIN learner ON learner.id = sa.user_id
      WHERE sa.course_id IS NOT NULL
  )
  SELECT
    co.id, co.title,
    l.id, l.title, l.ordinal, l.week,
    (l.published_version_id IS NOT NULL AND l.archived_at IS NULL),
    (o.lesson_id IS NOT NULL OR a.lesson_id IS NOT NULL OR t.lesson_id IS NOT NULL),
    o.first_opened_at, o.last_opened_at,
    a.first_at, a.last_at,
    COALESCE(t.sent, 0), COALESCE(t.answered, 0),
    GREATEST(o.last_opened_at, a.last_at, t.last_at)
  FROM courses_ok co
  JOIN learner_courses lc ON lc.course_id = co.id
  JOIN lessons l ON l.course_id = co.id
  LEFT JOIN opens o    ON o.lesson_id = l.id
  LEFT JOIN attempts a ON a.lesson_id = l.id
  LEFT JOIN takes t    ON t.lesson_id = l.id
  WHERE (l.published_version_id IS NOT NULL AND l.archived_at IS NULL)
     OR o.lesson_id IS NOT NULL OR a.lesson_id IS NOT NULL OR t.lesson_id IS NOT NULL
  ORDER BY co.title, co.id, l.ordinal;
$$;

REVOKE ALL ON FUNCTION learner_lessons(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION learner_lessons(UUID) TO authenticated;

-- ── 2. learner_recordings ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION learner_recordings(p_user_id UUID)
RETURNS TABLE (
  submission_id          UUID,
  course_id              UUID,
  course_title           TEXT,
  enrolment_id           UUID,
  enrolment_revoked_at   TIMESTAMPTZ,
  run_id                 UUID,
  run_title              TEXT,
  run_starts_at          TIMESTAMPTZ,
  lesson_id              UUID,
  lesson_title           TEXT,
  lesson_ordinal         INTEGER,
  week                   INTEGER,
  block_id               TEXT,
  block_prompt           JSONB,
  block_compare          TEXT,
  submitted_at           TIMESTAMPTZ,
  recording_removed      BOOLEAN,
  feedback_body          JSONB,
  feedback_updated_at    TIMESTAMPTZ,
  feedback_published_at  TIMESTAMPTZ
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
    WHERE can_edit_course(c.id, me.uid)
  )
  SELECT
    s.id, co.id, co.title,
    e.id, e.revoked_at,
    r.id, r.title, r.starts_at,
    l.id, l.title, l.ordinal, l.week,
    s.block_id,
    ob.block->'prompt',
    ob.block->>'compare',
    s.submitted_at,
    (s.object_name IS NULL),
    f.body, f.updated_at, f.published_at
  FROM voice_submissions s
  JOIN profiles p      ON p.id = s.user_id AND p.deleted_at IS NULL
  JOIN courses_ok co   ON co.id = s.course_id
  JOIN run_enrolments e ON e.id = s.enrolment_id
  JOIN course_runs r   ON r.id = e.run_id
  JOIN lessons l       ON l.id = s.lesson_id
  LEFT JOIN LATERAL (
    SELECT b AS block
    FROM lesson_versions v
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) b
    WHERE v.id = s.lesson_version_id AND b->>'id' = s.block_id
    LIMIT 1
  ) ob ON TRUE
  LEFT JOIN voice_feedback f ON f.submission_id = s.id
  WHERE s.user_id = p_user_id
  ORDER BY co.title, co.id, r.starts_at, l.ordinal, s.block_id;
$$;

REVOKE ALL ON FUNCTION learner_recordings(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION learner_recordings(UUID) TO authenticated;

COMMIT;
