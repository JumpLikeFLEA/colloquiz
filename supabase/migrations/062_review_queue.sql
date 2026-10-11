-- ============================================================
-- 062_review_queue.sql
--
-- VOICE-006. The read path for the Studio review queue (/studio/reviews):
-- which run a voice submission belongs to, which learners a run has, and
-- who they are. Owner-approved as a schema change on 2026-10-11 (#162);
-- choices made while writing it are in docs/decisions/0114.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 061_run_final_comments.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies: none. delete_my_account is NOT touched (this migration
-- adds no table and stores nothing), and no access function is touched.
--
-- Why functions: an editor cannot read run_enrolments (058: owner read
-- only) or auth.users, so nothing they can SELECT says which run a
-- submission is in, who is enrolled in a run that has not sent anything,
-- or the learner's email. Both functions are SECURITY DEFINER, read-only
-- (STABLE), and return rows only for courses where
-- can_edit_course(course, auth.uid()) is true. Writes stay on 060's
-- save_voice_feedback and 061's save_final_comment, which check
-- can_edit_course themselves.
--
-- What an editor sees is privacy-policy.md:188-195's list: email, the
-- invite's contact label, and recordings sent and answered. No score.
--
-- ── 1. review_queue(course?, run?, week?, status?) ──────────────────────
-- One row per (active enrolment × voice block): every voice task in each
-- lesson's PUBLISHED version, plus any slot a submission exists for whose
-- block has since left the published version (so a sent take never drops
-- out of the queue because the lesson was re-published).
--   status:  not_open  no take, and the lesson opens for this run later
--            not_sent  no take, lesson open
--            waiting   a take, no feedback row
--            draft     a take, feedback saved but not published
--            answered  a take, feedback published
--   opens_at is when the lesson opens for this run (058's per-run rule:
--   start + 7 × (week − 1), capped at the run's end; an entitled lesson
--   with no week opens at the end; anyone/signed_in lessons are open from
--   the run's start, so opens_at = starts_at).
-- Revoked enrolments are left out (0114 Decision 3).
-- Order: waiting takes oldest first, then the rest by run, week, lesson,
-- learner.
--
-- ── 2. review_final_comments(course?, run?) ─────────────────────────────
-- One row per active enrolment: the learner, the run, and their final
-- comment (061) if any, draft or published.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: every function CREATE OR REPLACE.
-- ============================================================

BEGIN;

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
      u.email::TEXT AS learner_email,
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


-- ── 2. review_final_comments ────────────────────────────────────────────
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
         e.id, e.tier, e.user_id, u.email::TEXT,
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
  ORDER BY r.starts_at, c.title, u.email;
$$;

REVOKE ALL ON FUNCTION review_final_comments(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_final_comments(UUID, UUID) TO authenticated;

COMMIT;
