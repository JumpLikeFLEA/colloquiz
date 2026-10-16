-- ============================================================
-- 073_telegram_learner_label.sql
--
-- AUTH-019. A learner who signs in with Telegram has no email
-- (docs/decisions/0098), so Studio's three RPCs that return
-- auth.users.email returned an empty label. This adds one helper,
-- learner_contact_label(), and re-emits those RPCs with it in place of
-- u.email::TEXT: the email when there is one, else "@username" from the
-- account's Telegram identity (provider custom:telegram,
-- identity_data->>'preferred_username'), else ''. The column keeps its
-- name (learner_email) and type, so the TypeScript readers and the
-- label order (invite name, email, @username) need no change.
--
-- Re-emitted bodies are copied verbatim from the latest definitions, found
-- with `rg "FUNCTION (review_queue|review_final_comments|learner_roster)"
-- supabase/migrations`: review_queue and review_final_comments from 062,
-- learner_roster from 063 (nothing after 072 redefines them). Only the
-- email expression and the ORDER BY tail on that expression change.
--
-- The helper is SECURITY DEFINER and has EXECUTE revoked from everyone: it
-- is called only from the SECURITY DEFINER RPCs below, so no caller can use
-- it to look up an arbitrary account's email or username.
--
-- Written, not applied. Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION learner_contact_label(p_user UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(u.email::TEXT, ''),
    (SELECT '@' || NULLIF(i.identity_data->>'preferred_username', '')
       FROM auth.identities i
      WHERE i.user_id = u.id AND i.provider = 'custom:telegram'
      ORDER BY i.created_at
      LIMIT 1),
    ''
  )
  FROM auth.users u
  WHERE u.id = p_user;
$$;

REVOKE ALL ON FUNCTION learner_contact_label(UUID) FROM public, anon, authenticated;


-- ── 1. review_queue ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION review_queue(
  p_course_id UUID    DEFAULT NULL,
  p_run_id    UUID    DEFAULT NULL,
  p_week      INTEGER DEFAULT NULL,
  p_status    TEXT    DEFAULT NULL
)
RETURNS TABLE (
  course_id             UUID,
  course_title          TEXT,
  run_id                UUID,
  run_title             TEXT,
  run_starts_at         TIMESTAMPTZ,
  run_ends_at           TIMESTAMPTZ,
  enrolment_id          UUID,
  tier                  TEXT,
  user_id               UUID,
  learner_email         TEXT,
  invitee_name          TEXT,
  invitee_contact       TEXT,
  lesson_id             UUID,
  lesson_title          TEXT,
  lesson_ordinal        INTEGER,
  week                  INTEGER,
  opens_at              TIMESTAMPTZ,
  block_id              TEXT,
  block_prompt          JSONB,
  block_max_seconds     INTEGER,
  submission_id         UUID,
  submitted_at          TIMESTAMPTZ,
  recording_removed     BOOLEAN,
  feedback_body         JSONB,
  feedback_updated_at   TIMESTAMPTZ,
  feedback_published_at TIMESTAMPTZ,
  status                TEXT
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
  enrolments AS (
    SELECT e.id AS enrolment_id, e.user_id, e.tier,
           r.id AS run_id, r.title AS run_title, r.starts_at, r.ends_at,
           co.id AS course_id, co.title AS course_title
    FROM run_enrolments e
    JOIN course_runs r ON r.id = e.run_id
    JOIN courses_ok co ON co.id = r.course_id
    WHERE e.revoked_at IS NULL
      AND (p_run_id IS NULL OR r.id = p_run_id)
  ),
  published_blocks AS (
    SELECT l.id AS lesson_id, b->>'id' AS block_id, b AS block
    FROM lessons l
    JOIN courses_ok co ON co.id = l.course_id
    JOIN lesson_versions v ON v.id = l.published_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) b
    WHERE b->>'kind' = 'task' AND b->>'type' = 'voice'
  ),
  slots AS (
    -- Every published voice block for every enrolment of its course…
    SELECT en.enrolment_id, pb.lesson_id, pb.block_id, pb.block
    FROM enrolments en
    JOIN lessons l ON l.course_id = en.course_id
    JOIN published_blocks pb ON pb.lesson_id = l.id
    UNION
    -- …plus a submitted slot whose block is no longer published, described
    -- from the version the take was recorded against.
    SELECT s.enrolment_id, s.lesson_id, s.block_id, ob.block
    FROM voice_submissions s
    JOIN enrolments en ON en.enrolment_id = s.enrolment_id
    LEFT JOIN LATERAL (
      SELECT b AS block
      FROM lesson_versions v
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
      ) b
      WHERE v.id = s.lesson_version_id AND b->>'id' = s.block_id
      LIMIT 1
    ) ob ON TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM published_blocks pb
      WHERE pb.lesson_id = s.lesson_id AND pb.block_id = s.block_id
    )
  ),
  rows AS (
    SELECT
      en.course_id, en.course_title,
      en.run_id, en.run_title, en.starts_at, en.ends_at,
      en.enrolment_id, en.tier, en.user_id,
      learner_contact_label(en.user_id) AS learner_email,
      inv.invitee_name, inv.invitee_contact,
      l.id AS lesson_id, l.title AS lesson_title, l.ordinal AS lesson_ordinal, l.week,
      CASE
        WHEN l.access_level <> 'entitled' THEN en.starts_at
        WHEN l.week IS NULL THEN en.ends_at
        ELSE LEAST(en.starts_at + make_interval(days => 7 * (l.week - 1)), en.ends_at)
      END AS opens_at,
      sl.block_id,
      sl.block->'prompt' AS block_prompt,
      NULLIF(sl.block->>'maxSeconds', '')::INTEGER AS block_max_seconds,
      s.id AS submission_id, s.submitted_at,
      (s.id IS NOT NULL AND s.object_name IS NULL) AS recording_removed,
      f.body AS feedback_body, f.updated_at AS feedback_updated_at, f.published_at AS feedback_published_at
    FROM slots sl
    JOIN enrolments en ON en.enrolment_id = sl.enrolment_id
    JOIN lessons l ON l.id = sl.lesson_id
    JOIN auth.users u ON u.id = en.user_id
    LEFT JOIN LATERAL (
      SELECT i.invitee_name, i.invitee_contact
      FROM run_invites i
      WHERE i.enrolment_id = en.enrolment_id
      ORDER BY i.claimed_at DESC NULLS LAST
      LIMIT 1
    ) inv ON TRUE
    LEFT JOIN voice_submissions s
      ON s.enrolment_id = sl.enrolment_id AND s.lesson_id = sl.lesson_id AND s.block_id = sl.block_id
    LEFT JOIN voice_feedback f ON f.submission_id = s.id
  ),
  labelled AS (
    SELECT rows.*,
      CASE
        WHEN submission_id IS NULL AND opens_at > now() THEN 'not_open'
        WHEN submission_id IS NULL THEN 'not_sent'
        WHEN feedback_body IS NULL THEN 'waiting'
        WHEN feedback_published_at IS NULL THEN 'draft'
        ELSE 'answered'
      END AS status
    FROM rows
  )
  SELECT course_id, course_title, run_id, run_title, starts_at, ends_at,
         enrolment_id, tier, user_id, learner_email, invitee_name, invitee_contact,
         lesson_id, lesson_title, lesson_ordinal, week, opens_at,
         block_id, block_prompt, block_max_seconds,
         submission_id, submitted_at, recording_removed,
         feedback_body, feedback_updated_at, feedback_published_at, status
  FROM labelled
  WHERE (p_week IS NULL OR week = p_week)
    AND (p_status IS NULL OR status = p_status)
  ORDER BY (status = 'waiting') DESC, submitted_at ASC NULLS LAST,
           starts_at, week NULLS FIRST, lesson_ordinal, block_id, learner_email;
$$;

REVOKE ALL ON FUNCTION review_queue(UUID, UUID, INTEGER, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_queue(UUID, UUID, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION review_final_comments(
  p_course_id UUID DEFAULT NULL,
  p_run_id    UUID DEFAULT NULL
)
RETURNS TABLE (
  course_id       UUID,
  course_title    TEXT,
  run_id          UUID,
  run_title       TEXT,
  run_starts_at   TIMESTAMPTZ,
  run_ends_at     TIMESTAMPTZ,
  enrolment_id    UUID,
  tier            TEXT,
  user_id         UUID,
  learner_email   TEXT,
  invitee_name    TEXT,
  invitee_contact TEXT,
  body            JSONB,
  updated_at      TIMESTAMPTZ,
  published_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, r.id, r.title, r.starts_at, r.ends_at,
         e.id, e.tier, e.user_id, learner_contact_label(e.user_id),
         inv.invitee_name, inv.invitee_contact,
         fc.body, fc.updated_at, fc.published_at
  FROM run_enrolments e
  JOIN course_runs r ON r.id = e.run_id
  JOIN courses c     ON c.id = r.course_id
  JOIN auth.users u  ON u.id = e.user_id
  LEFT JOIN LATERAL (
    SELECT i.invitee_name, i.invitee_contact
    FROM run_invites i
    WHERE i.enrolment_id = e.id
    ORDER BY i.claimed_at DESC NULLS LAST
    LIMIT 1
  ) inv ON TRUE
  LEFT JOIN run_final_comments fc ON fc.enrolment_id = e.id
  WHERE e.revoked_at IS NULL
    AND (p_course_id IS NULL OR c.id = p_course_id)
    AND (p_run_id IS NULL OR r.id = p_run_id)
    AND can_edit_course(c.id, (SELECT auth.uid()))
  ORDER BY r.starts_at, c.title, learner_contact_label(e.user_id);
$$;

REVOKE ALL ON FUNCTION review_final_comments(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_final_comments(UUID, UUID) TO authenticated;

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

COMMIT;
