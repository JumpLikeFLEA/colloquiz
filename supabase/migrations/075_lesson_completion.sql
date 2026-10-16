-- ============================================================
-- 075_lesson_completion.sql
--
-- PROG-006 (#228): the complete-lesson rule of docs/decisions/0143, in SQL.
-- Choices made while writing it are in docs/decisions/0147.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 074_lesson_attempt_response.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies: get_course_attempt_summary from 050; learner_roster from
-- 073 (which re-emitted 063; 073 must be applied before this file, and it is
-- what this file's roster body is copied from); learner_lessons from 064;
-- course_stats from 065. delete_my_account is NOT touched: this migration
-- adds no table and stores nothing.
--
-- The rule (0143 Decisions 1-3):
--   * A lesson with exercises (practice blocks) is complete when every
--     exercise of SOME version the learner played has an attempt row. The
--     exercise count is that version's own document, not
--     lessons.published_item_count, so a republish does not un-complete it.
--   * A lesson whose current published version has no exercises is complete
--     when the learner has a lesson_opens row (056).
--   * Anything between is in progress: it counts toward no "N of M", average
--     or Studio "completed", and reports exercises_answered / exercises_total.
--
-- ONE definition: lesson_completion() below. The four read functions call it;
-- none re-derives completeness. It is SECURITY DEFINER with EXECUTE revoked
-- from everyone (the learner_contact_label precedent, 073): it is callable
-- only from the SECURITY DEFINER functions here, which supply the caller
-- scoping. A NULL p_user_id means ALL users and a NULL p_course_ids means ALL
-- courses, so every caller passes a non-NULL course array
-- (COALESCE(..., '{}')) and gates a NULL auth.uid() before calling.
--
-- Return-type changes need DROP FUNCTION (CREATE OR REPLACE cannot change a
-- result row): get_course_attempt_summary gains complete / exercises_*, and
-- course_stats renames attempted_learners to completed_learners. Both are
-- dropped and re-created with the same grants inside this transaction.
--
-- Written, not applied. Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

-- == 0. lesson_completion: the one definition ==========================
CREATE OR REPLACE FUNCTION lesson_completion(p_user_id UUID, p_course_ids UUID[])
RETURNS TABLE (
  user_id            UUID,
  lesson_id          UUID,
  exercises_answered INTEGER,
  exercises_total    INTEGER,
  complete           BOOLEAN,
  best_percent       INTEGER,
  completed_first_at TIMESTAMPTZ,
  completed_last_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT l.id AS lesson_id, l.published_version_id
    FROM lessons l
    WHERE p_course_ids IS NULL OR l.course_id = ANY (p_course_ids)
  ),
  -- One row per (learner, version, block): its best attempt (the 050 order,
  -- earned / possible) and when it was first and last answered.
  block_best AS (
    SELECT a.user_id, a.lesson_version_id, v.lesson_id, a.block_id,
           min(a.created_at) AS first_at,
           max(a.created_at) AS last_at,
           (array_agg(a.earned   ORDER BY a.earned / a.possible DESC, a.created_at))[1] AS earned,
           (array_agg(a.possible ORDER BY a.earned / a.possible DESC, a.created_at))[1] AS possible
    FROM lesson_attempts a
    JOIN lesson_versions v ON v.id = a.lesson_version_id
    JOIN scope s ON s.lesson_id = v.lesson_id
    WHERE p_user_id IS NULL OR a.user_id = p_user_id
    GROUP BY a.user_id, a.lesson_version_id, v.lesson_id, a.block_id
  ),
  vers AS (
    SELECT lesson_version_id AS version_id FROM block_best
    UNION
    SELECT published_version_id FROM scope WHERE published_version_id IS NOT NULL
  ),
  -- The exercises of each version, from that version's own document.
  practice AS (
    SELECT DISTINCT v.id AS version_id, b->>'id' AS block_id
    FROM vers
    JOIN lesson_versions v ON v.id = vers.version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) b
    WHERE b->>'kind' = 'practice' AND b->>'id' IS NOT NULL
  ),
  totals AS (
    SELECT version_id, count(*)::INTEGER AS n FROM practice GROUP BY version_id
  ),
  -- Answered exercises per (learner, version); an attempt on a block the
  -- version's document does not hold does not count.
  per_version AS (
    SELECT bb.user_id, bb.lesson_id, bb.lesson_version_id,
           count(*)::INTEGER AS answered,
           COALESCE(t.n, 0)  AS total,
           max(bb.first_at)  AS done_at,
           max(bb.last_at)   AS last_at,
           round(100.0 * sum(bb.earned) / sum(bb.possible))::INTEGER AS pct
    FROM block_best bb
    JOIN practice p ON p.version_id = bb.lesson_version_id AND p.block_id = bb.block_id
    LEFT JOIN totals t ON t.version_id = bb.lesson_version_id
    GROUP BY bb.user_id, bb.lesson_id, bb.lesson_version_id, t.n
  ),
  -- Per (learner, lesson): a complete version if any (the highest score among
  -- them), else the furthest-along partial one.
  best AS (
    SELECT DISTINCT ON (user_id, lesson_id)
      user_id, lesson_id, answered, total, pct, done_at, last_at,
      (answered = total AND total > 0) AS done
    FROM per_version
    ORDER BY user_id, lesson_id,
             (answered = total AND total > 0) DESC,
             CASE WHEN answered = total AND total > 0 THEN pct END DESC NULLS LAST,
             answered DESC, last_at DESC
  ),
  opens AS (
    SELECT o.user_id, o.lesson_id, o.first_opened_at, o.last_opened_at
    FROM lesson_opens o
    JOIN scope s ON s.lesson_id = o.lesson_id
    WHERE p_user_id IS NULL OR o.user_id = p_user_id
  ),
  pairs AS (
    SELECT user_id, lesson_id FROM best
    UNION
    SELECT user_id, lesson_id FROM opens
  ),
  rated AS (
    SELECT pr.user_id, pr.lesson_id,
           b.answered AS b_answered, b.total AS b_total, b.pct AS b_pct,
           b.done_at AS b_done_at, b.last_at AS b_last_at,
           o.first_opened_at AS o_first, o.last_opened_at AS o_last,
           COALESCE(b.done, FALSE) AS by_exercises,
           (sc.published_version_id IS NOT NULL
             AND COALESCE(ct.n, 0) = 0
             AND o.lesson_id IS NOT NULL) AS by_open,
           COALESCE(ct.n, 0) AS current_total
    FROM pairs pr
    JOIN scope sc ON sc.lesson_id = pr.lesson_id
    LEFT JOIN best b  ON b.user_id = pr.user_id AND b.lesson_id = pr.lesson_id
    LEFT JOIN opens o ON o.user_id = pr.user_id AND o.lesson_id = pr.lesson_id
    LEFT JOIN totals ct ON ct.version_id = sc.published_version_id
  )
  SELECT
    r.user_id, r.lesson_id,
    CASE WHEN r.by_open AND NOT r.by_exercises THEN 0 ELSE COALESCE(r.b_answered, 0) END,
    CASE WHEN r.by_exercises THEN r.b_total
         WHEN r.by_open THEN 0
         ELSE COALESCE(r.b_total, r.current_total) END,
    (r.by_exercises OR r.by_open),
    CASE WHEN r.by_exercises THEN r.b_pct END,
    CASE WHEN r.by_exercises THEN r.b_done_at WHEN r.by_open THEN r.o_first END,
    CASE WHEN r.by_exercises THEN r.b_last_at WHEN r.by_open THEN r.o_last END
  FROM rated r;
$$;

REVOKE ALL ON FUNCTION lesson_completion(UUID, UUID[]) FROM public, anon, authenticated;


-- == 1. get_course_attempt_summary (re-emitted from 050) ===============
-- Same selector as 050 (the caller's auth.uid(), never a parameter). One row
-- per lesson of the course the learner has answered at least one exercise of,
-- or has completed. best_percent is set only for a lesson completed through
-- its exercises (the highest score among its complete versions); a lesson
-- completed by an open row, and an in-progress lesson, return NULL.
DROP FUNCTION IF EXISTS get_course_attempt_summary(UUID);

CREATE FUNCTION get_course_attempt_summary(p_course_id UUID)
RETURNS TABLE(
  lesson_slug        TEXT,
  best_percent       INT,
  complete           BOOLEAN,
  exercises_answered INT,
  exercises_total    INT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid WHERE auth.uid() IS NOT NULL)
  SELECT l.slug, c.best_percent, c.complete, c.exercises_answered, c.exercises_total
  FROM me
  CROSS JOIN LATERAL lesson_completion(me.uid, ARRAY[p_course_id]) c
  JOIN lessons l ON l.id = c.lesson_id
  WHERE l.course_id = p_course_id
    AND (c.complete OR c.exercises_answered > 0);
$$;

REVOKE ALL ON FUNCTION get_course_attempt_summary(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_course_attempt_summary(UUID) TO authenticated;


-- == 2. learner_roster (re-emitted from 073) ===========================
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
  -- 0143: complete, not merely attempted. Counted over the same lessons as
  -- lessons_total (published), so completed can never exceed total.
  completed AS (
    SELECT cl.course_id, c.user_id, c.lesson_id
    FROM lesson_completion(NULL, COALESCE((SELECT array_agg(id) FROM courses_ok), '{}'::UUID[])) c
    JOIN course_lessons cl ON cl.lesson_id = c.lesson_id
    WHERE c.complete AND cl.published_version_id IS NOT NULL
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
      (SELECT count(*) FROM completed cp
        WHERE cp.course_id = ln.course_id AND cp.user_id = ln.user_id)::INTEGER AS lessons_completed,
      GREATEST(
        (SELECT max(o.at) FROM opens o WHERE o.course_id = ln.course_id AND o.user_id = ln.user_id),
        (SELECT max(a.at) FROM attempts a WHERE a.course_id = ln.course_id AND a.user_id = ln.user_id),
        (SELECT max(t.submitted_at) FROM takes t WHERE t.course_id = ln.course_id AND t.user_id = ln.user_id)
      ) AS last_activity_at
    FROM learners ln
  )
  SELECT
    co.id, co.title,
    ln.user_id, learner_contact_label(ln.user_id),
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
  ORDER BY act.last_activity_at DESC NULLS LAST, learner_contact_label(ln.user_id), en.starts_at;
$$;

REVOKE ALL ON FUNCTION learner_roster(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION learner_roster(UUID, UUID) TO authenticated;


-- == 3. learner_lessons (re-emitted from 064) ==========================
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
  completion AS (
    SELECT c.lesson_id, c.completed_first_at, c.completed_last_at
    FROM lesson_completion(p_user_id, COALESCE((SELECT array_agg(id) FROM courses_ok), '{}'::UUID[])) c
    JOIN learner ON learner.id = c.user_id
    WHERE c.complete
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
    cp.completed_first_at, cp.completed_last_at,
    COALESCE(t.sent, 0), COALESCE(t.answered, 0),
    GREATEST(o.last_opened_at, a.last_at, t.last_at)
  FROM courses_ok co
  JOIN learner_courses lc ON lc.course_id = co.id
  JOIN lessons l ON l.course_id = co.id
  LEFT JOIN opens o    ON o.lesson_id = l.id
  LEFT JOIN attempts a ON a.lesson_id = l.id
  LEFT JOIN completion cp ON cp.lesson_id = l.id
  LEFT JOIN takes t    ON t.lesson_id = l.id
  WHERE (l.published_version_id IS NOT NULL AND l.archived_at IS NULL)
     OR o.lesson_id IS NOT NULL OR a.lesson_id IS NOT NULL OR t.lesson_id IS NOT NULL
  ORDER BY co.title, co.id, l.ordinal;
$$;

REVOKE ALL ON FUNCTION learner_lessons(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION learner_lessons(UUID) TO authenticated;


-- == 4. course_stats (re-emitted from 065) =============================
-- attempted_learners is now completed_learners: distinct live learners who
-- completed the lesson by lesson_completion().
DROP FUNCTION IF EXISTS course_stats(UUID);

CREATE OR REPLACE FUNCTION course_stats(p_course_id UUID)
RETURNS TABLE (
  lesson_id           UUID,
  lesson_title        TEXT,
  lesson_ordinal      INTEGER,
  week                INTEGER,
  opened_learners     INTEGER,
  completed_learners  INTEGER,
  block_id            TEXT,
  block_position      INTEGER,
  block_type          TEXT,
  block_prompt        JSONB,
  block_learners      INTEGER,
  block_avg           NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ok AS (
    SELECT c.id
    FROM courses c
    WHERE c.id = p_course_id
      AND can_edit_course(c.id, (SELECT auth.uid()))
  ),
  listed AS (
    SELECT l.id, l.title, l.ordinal, l.week, l.published_version_id
    FROM lessons l
    JOIN ok ON ok.id = l.course_id
    WHERE l.published_version_id IS NOT NULL AND l.archived_at IS NULL
  ),
  -- Practice blocks of the published version, with their position.
  blocks AS (
    SELECT ls.id AS lesson_id, b.value AS block, b.ordinality::INTEGER AS pos
    FROM listed ls
    JOIN lesson_versions v ON v.id = ls.published_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS b(value, ordinality)
    WHERE b.value->>'kind' = 'practice'
  ),
  -- Every attempt on any version of a listed lesson, by a live account.
  attempts AS (
    SELECT v.lesson_id, v.document, a.user_id, a.block_id, a.earned, a.possible,
           a.created_at, a.id
    FROM lesson_attempts a
    JOIN lesson_versions v ON v.id = a.lesson_version_id
    JOIN listed ls ON ls.id = v.lesson_id
    JOIN profiles p ON p.id = a.user_id AND p.deleted_at IS NULL
  ),
  -- 0143: learners who completed the lesson, not merely attempted it.
  completed AS (
    SELECT c.lesson_id, count(DISTINCT c.user_id)::INTEGER AS n
    FROM lesson_completion(NULL, COALESCE((SELECT array_agg(id) FROM ok), '{}'::UUID[])) c
    JOIN listed ls ON ls.id = c.lesson_id
    JOIN profiles p ON p.id = c.user_id AND p.deleted_at IS NULL
    WHERE c.complete
    GROUP BY c.lesson_id
  ),
  opened AS (
    SELECT x.lesson_id, count(DISTINCT x.user_id)::INTEGER AS n
    FROM (
      SELECT o.lesson_id, o.user_id FROM lesson_opens o
      UNION SELECT a.lesson_id, a.user_id FROM attempts a
      UNION SELECT s.lesson_id, s.user_id FROM voice_submissions s
    ) x
    JOIN listed ls ON ls.id = x.lesson_id
    JOIN profiles p ON p.id = x.user_id AND p.deleted_at IS NULL
    GROUP BY x.lesson_id
  ),
  -- Each learner's first attempt on a block, counting only versions whose
  -- block is identical to the published one.
  first_attempts AS (
    SELECT DISTINCT ON (bl.lesson_id, bl.block->>'id', x.user_id)
      bl.lesson_id, bl.block->>'id' AS block_id, x.user_id,
      x.earned / x.possible AS ratio
    FROM blocks bl
    JOIN attempts x
      ON x.lesson_id = bl.lesson_id AND x.block_id = bl.block->>'id'
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(x.document) = 'array' THEN x.document ELSE '[]'::jsonb END
      ) ob
      WHERE ob->>'id' = bl.block->>'id' AND ob = bl.block
    )
    ORDER BY bl.lesson_id, bl.block->>'id', x.user_id, x.created_at, x.id
  ),
  per_block AS (
    SELECT lesson_id, block_id,
           count(*)::INTEGER AS n,
           avg(ratio) AS avg_ratio
    FROM first_attempts
    GROUP BY lesson_id, block_id
  )
  SELECT
    ls.id, ls.title, ls.ordinal, ls.week,
    COALESCE(op.n, 0), COALESCE(att.n, 0),
    bl.block->>'id',
    bl.pos,
    bl.block->>'type',
    bl.block->'payload'->'prompt',
    CASE WHEN bl.lesson_id IS NULL THEN NULL ELSE COALESCE(pb.n, 0) END,
    CASE WHEN pb.n >= 5 THEN pb.avg_ratio ELSE NULL END
  FROM listed ls
  LEFT JOIN opened op    ON op.lesson_id = ls.id
  LEFT JOIN completed att ON att.lesson_id = ls.id
  LEFT JOIN blocks bl    ON bl.lesson_id = ls.id
  LEFT JOIN per_block pb ON pb.lesson_id = ls.id AND pb.block_id = bl.block->>'id'
  ORDER BY ls.ordinal, ls.id, bl.pos;
$$;

REVOKE ALL ON FUNCTION course_stats(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION course_stats(UUID) TO authenticated;

COMMIT;
