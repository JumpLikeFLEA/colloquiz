-- ============================================================
-- 028_courses.sql
--
-- Structured, stage-by-stage learning: a third content mode on top of the quiz
-- bank. A COURSE (Calculus I first) is ordered STAGES, each with theory,
-- unlimited free practice, and a graded knowledge check that gates the next
-- stage. Two ideas make it more than a playlist:
--
-- • Variant siblings. Every idea is authored as 2–4 complete MCQ variants of the
--   same problem with different numbers, sharing a variant_group. The learner
--   meets one, and meets a different sibling later mixed into a later check —
--   repetition without answer-key memorisation.
-- • Spillover. Exactly one sibling per group is flagged for promotion into the
--   public quick-play bank (visibility='shared'); the rest stay visibility=
--   'course', invisible to the grid/Random Quiz/Deep Dive by construction.
--
-- Design notes
-- ------------
-- • Course questions live in the EXISTING questions table with nullable course
--   columns (course_stage_id, variant_group, variant_ordinal, authored_key).
--   Quick play is untouched: sampleQuestions() and get_subject_stats() filter
--   visibility='shared', so 'course' rows never reach them.
--
-- • Entitlement seam. courses.access + course_enrollments exist so a future
--   Stripe webhook inserts source='purchase' and nothing else changes.
--   Everything ships free; enroll_in_course() refuses access='paid' with no row.
--
-- • needs_review is DERIVED, never stored — see get_course_progress. A stored
--   amber flag with a write path has no clear path; the truth already lives in
--   course_variant_seen.last_correct, tested per variant GROUP (latest answer),
--   restricted to complete stages. Self-corrects on re-import and regrouping.
--
-- • course_variant_seen is the ONE table that drives all selection: unseen-first
--   picking, LRS recycling, wrong-first ordering, and the review mix. Modelled
--   on user_question_xp (015): composite PK, SELECT-only grant, written only by
--   the definer functions below. Deliberately NO denormalized variant_group /
--   stage_id — every selection query joins questions anyway, so reading them
--   live is free and removes the staleness class on regroup/move.
--
-- • ON DELETE SET NULL on questions.course_stage_id, never CASCADE — a dropped
--   stage must not destroy a promoted sibling now living in the public bank and
--   referenced by quizzes.question_ids (a TEXT[] with no FK). A BEFORE DELETE
--   guard additionally refuses to delete any question referenced by a quiz. The
--   importer never DELETEs — it archives stages and soft-rejects retired
--   variants. Three layers, all fail-closed.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Safe to re-apply.
-- ============================================================


-- ── courses ─────────────────────────────────────────────────
-- Deliberately NO check_size: the gate is scored on new items only, so a
-- total-size setting would make the denominator vary (7 vs 10) and quietly move
-- the pass bar. new_count IS the gate denominator; review_slots is a maximum.
CREATE TABLE IF NOT EXISTS courses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT        NOT NULL UNIQUE,
  title          TEXT        NOT NULL,
  subtitle       TEXT,
  description    TEXT,
  subject        TEXT        NOT NULL DEFAULT 'mathematics',
  icon           TEXT,
  color          TEXT,
  access         TEXT        NOT NULL DEFAULT 'free'  CHECK (access IN ('free', 'paid')),
  status         TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  pass_threshold NUMERIC     NOT NULL DEFAULT 80,
  new_count      INT         NOT NULL DEFAULT 7,
  review_slots   INT         NOT NULL DEFAULT 3,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE courses FROM anon, authenticated;
GRANT SELECT ON courses TO authenticated;


-- ── course_stages ───────────────────────────────────────────
-- Metadata only — NO theory column. Browsable by any signed-in user; it renders
-- the syllabus preview. archived_at, never a DELETE: a stage absent from the
-- authored file is archived (the realistic trigger is a typo'd key in JSON).
-- The (course_id, position) index is NOT unique so a re-import can reorder.
CREATE TABLE IF NOT EXISTS course_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  position    INT         NOT NULL DEFAULT 0,
  title       TEXT        NOT NULL,
  summary     TEXT,
  subtopic    TEXT,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, key)
);

CREATE INDEX IF NOT EXISTS course_stages_position_idx ON course_stages (course_id, position);

ALTER TABLE course_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_stages FROM anon, authenticated;
GRANT SELECT ON course_stages TO authenticated;


-- ── course_stage_theory ─────────────────────────────────────
-- The gated half, split into its own table so plain row-level RLS can gate it —
-- a column-level SELECT grant on course_stages would booby-trap select('*') and
-- PostgREST embeds forever (see the migration notes / plan §2). One row/stage.
CREATE TABLE IF NOT EXISTS course_stage_theory (
  stage_id   UUID        PRIMARY KEY REFERENCES course_stages(id) ON DELETE CASCADE,
  blocks     JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE course_stage_theory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_stage_theory FROM anon, authenticated;
GRANT SELECT ON course_stage_theory TO authenticated;


-- ── course_enrollments ──────────────────────────────────────
-- The entitlement seam. Written only by enroll_in_course() (self) or a future
-- Stripe webhook (purchase). Enrollment is the ONLY gate — it protects theory
-- AND course questions via my_enrolled_stage_ids().
CREATE TABLE IF NOT EXISTS course_enrollments (
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id  UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  source     TEXT        NOT NULL DEFAULT 'self' CHECK (source IN ('self', 'purchase', 'grant')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id)
);

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_enrollments FROM anon, authenticated;
GRANT SELECT ON course_enrollments TO authenticated;


-- ── course_stage_progress ───────────────────────────────────
-- No needs_review column — it is derived (see get_course_progress). Once
-- 'complete' a stage never re-locks: submit_stage_check keeps it complete.
CREATE TABLE IF NOT EXISTS course_stage_progress (
  user_id      UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  stage_id     UUID        NOT NULL REFERENCES course_stages(id) ON DELETE CASCADE,
  state        TEXT        NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'complete')),
  best_score   NUMERIC,
  attempts     INT         NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, stage_id)
);

ALTER TABLE course_stage_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_stage_progress FROM anon, authenticated;
GRANT SELECT ON course_stage_progress TO authenticated;


-- ── course_variant_seen ─────────────────────────────────────
-- last_correct is NOT NULL: a row exists only because an answer happened, and
-- bool_or() (used in the needs_review derivation) skips NULLs silently, so a
-- nullable column here would fail open. question_id carries an EXPLICIT
-- ON DELETE CASCADE — it points downstream, and a genuinely-deleted question's
-- seen-record is worthless. That asymmetry with course_stage_id (SET NULL) is
-- deliberate.
CREATE TABLE IF NOT EXISTS course_variant_seen (
  user_id       UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  question_id   TEXT        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  seen_count    INT         NOT NULL DEFAULT 0,
  correct_count INT         NOT NULL DEFAULT 0,
  last_correct  BOOLEAN     NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

ALTER TABLE course_variant_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_variant_seen FROM anon, authenticated;
GRANT SELECT ON course_variant_seen TO authenticated;


-- ── course_check_attempts ───────────────────────────────────
-- score is over NEW items only. One open attempt per (user, stage), enforced
-- structurally by the partial unique index — the same idiom 009 uses for
-- quiz_sessions. Without it a user opens five attempts, sees fifteen questions,
-- and submits the easiest.
CREATE TABLE IF NOT EXISTS course_check_attempts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  stage_id       UUID        NOT NULL REFERENCES course_stages(id) ON DELETE CASCADE,
  question_ids   TEXT[]      NOT NULL DEFAULT '{}',
  answers        JSONB,
  new_correct    INT,
  new_total      INT,
  review_correct INT,
  review_total   INT,
  score          NUMERIC,
  passed         BOOLEAN,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS course_check_attempts_open_idx
  ON course_check_attempts (user_id, stage_id) WHERE submitted_at IS NULL;

ALTER TABLE course_check_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_check_attempts FROM anon, authenticated;
GRANT SELECT ON course_check_attempts TO authenticated;


-- ── questions: course columns ───────────────────────────────
ALTER TABLE questions
  -- SET NULL, *never* CASCADE. A dropped stage must not destroy a promoted
  -- sibling in the public bank referenced by quizzes.question_ids.
  ADD COLUMN IF NOT EXISTS course_stage_id UUID REFERENCES course_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_group   TEXT,
  ADD COLUMN IF NOT EXISTS variant_ordinal INT,
  ADD COLUMN IF NOT EXISTS authored_key    TEXT;

-- Widen the visibility CHECK to admit 'course'. Same idiom as 014:294-296 — the
-- constraint was created inline by 006's ADD COLUMN, so Postgres named it
-- questions_visibility_check.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_visibility_check;
ALTER TABLE questions ADD  CONSTRAINT questions_visibility_check
  CHECK (visibility IN ('shared', 'private', 'group', 'course'));

-- authored_key is the stable re-import key (e.g. calculus-i/limits/limit-alg-sub/v2):
-- a typo fix changes content_hash but must not orphan progress, so upsert keys
-- on this, not the hash.
CREATE UNIQUE INDEX IF NOT EXISTS questions_authored_key_idx
  ON questions (authored_key) WHERE authored_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS questions_course_stage_idx
  ON questions (course_stage_id, variant_group, variant_ordinal);


-- ── RLS helpers ─────────────────────────────────────────────
-- Per-row-safe: returns the readable stage set ONCE, uncorrelated, so the
-- questions policy below hoists it into an InitPlan instead of a per-row SubPlan.
-- SECURITY DEFINER is house style (is_group_member, shares_group_with) and
-- avoids granting anon/authenticated direct SELECT on course_enrollments. The
-- GRANT ... TO anon is MANDATORY: the anon key reads questions via
-- getSubjectStats(), and a policy whose helper it cannot execute raises.
CREATE OR REPLACE FUNCTION my_enrolled_stage_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
  FROM course_stages s
  JOIN course_enrollments e ON e.course_id = s.course_id
  WHERE e.user_id = (SELECT auth.uid());
$$;
GRANT EXECUTE ON FUNCTION my_enrolled_stage_ids() TO anon, authenticated;

-- Single-row gate, for enroll_in_course() and record_practice_answer().
CREATE OR REPLACE FUNCTION is_enrolled(p_course_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM course_enrollments
                 WHERE course_id = p_course_id AND user_id = p_user_id);
$$;
GRANT EXECUTE ON FUNCTION is_enrolled(UUID, UUID) TO anon, authenticated;

-- Unlocking, defined ONCE and used by both the syllabus (get_course_progress)
-- and enforcement (start_stage_check). A stage is unlocked when it already has a
-- progress row (ANY state) OR every earlier non-archived stage is complete. The
-- first clause is what makes the non-unique (course_id, position) reorder
-- property genuinely safe — inserting a stage between 2 and 3 must not re-lock
-- stages a user already finished. A stage never re-locks.
CREATE OR REPLACE FUNCTION is_stage_unlocked(p_stage_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_pos    INT;
BEGIN
  IF v_me IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT course_id, position INTO v_course, v_pos FROM course_stages WHERE id = p_stage_id;
  IF v_course IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Clause 1: any progress row on this stage (proof it was legitimately reached).
  IF EXISTS (
    SELECT 1 FROM course_stage_progress
    WHERE user_id = v_me AND stage_id = p_stage_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Clause 2: every earlier non-archived stage is complete.
  RETURN NOT EXISTS (
    SELECT 1 FROM course_stages s
    WHERE s.course_id = v_course
      AND s.archived_at IS NULL
      AND s.position < v_pos
      AND NOT EXISTS (
        SELECT 1 FROM course_stage_progress p
        WHERE p.user_id = v_me AND p.stage_id = s.id AND p.state = 'complete'
      )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION is_stage_unlocked(UUID) TO authenticated;


-- ── policies ────────────────────────────────────────────────
-- Every policy uses (SELECT auth.uid()), never bare auth.uid() (which is STABLE,
-- so it re-evaluates per row). Writes to all course tables go through the
-- SECURITY DEFINER RPCs or the service-role importer, so only SELECT policies
-- exist.

DROP POLICY IF EXISTS "courses: published read" ON courses;
CREATE POLICY "courses: published read"
  ON courses FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "course_stages: published read" ON course_stages;
CREATE POLICY "course_stages: published read"
  ON course_stages FOR SELECT
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.id = course_stages.course_id AND c.status = 'published'));

DROP POLICY IF EXISTS "course_stage_theory: enrolled read" ON course_stage_theory;
CREATE POLICY "course_stage_theory: enrolled read"
  ON course_stage_theory FOR SELECT
  USING (stage_id = ANY ((SELECT my_enrolled_stage_ids())::uuid[]));

DROP POLICY IF EXISTS "course_enrollments: owner read" ON course_enrollments;
CREATE POLICY "course_enrollments: owner read"
  ON course_enrollments FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_stage_progress: owner read" ON course_stage_progress;
CREATE POLICY "course_stage_progress: owner read"
  ON course_stage_progress FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_variant_seen: owner read" ON course_variant_seen;
CREATE POLICY "course_variant_seen: owner read"
  ON course_variant_seen FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_check_attempts: owner read" ON course_check_attempts;
CREATE POLICY "course_check_attempts: owner read"
  ON course_check_attempts FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Additive (RLS policies are OR'd): enrolled users can read their course
-- questions. The ::uuid[] cast is load-bearing — it forces the array form of
-- = ANY so the uncorrelated scalar subquery hoists into an InitPlan instead of
-- being parsed as a row-set sublink (which errors: UUID = UUID[]).
DROP POLICY IF EXISTS "questions: enrolled course read" ON questions;
CREATE POLICY "questions: enrolled course read"
  ON questions FOR SELECT
  USING (visibility = 'course' AND status = 'approved'
         AND course_stage_id = ANY ((SELECT my_enrolled_stage_ids())::uuid[]));


-- ── questions: refuse deleting a referenced row ─────────────
-- quizzes.question_ids is a TEXT[] with no FK, so deleting a question referenced
-- by a quiz corrupts it silently (a 10-question quiz serves 9, resume breaks).
-- The codebase already routes around this: resolve_question_reports(...,
-- 'removed') sets status='rejected' rather than DELETE. This guard makes the
-- rule structural, closing a latent bug that predates courses. The GIN index on
-- question_ids from 001 makes the @> cheap.
CREATE OR REPLACE FUNCTION tg_questions_block_referenced_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM quizzes WHERE question_ids @> ARRAY[OLD.id]) THEN
    RAISE EXCEPTION 'question % is referenced by a quiz; set status=''rejected'' instead', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS questions_block_referenced_delete ON questions;
CREATE TRIGGER questions_block_referenced_delete
  BEFORE DELETE ON questions
  FOR EACH ROW EXECUTE FUNCTION tg_questions_block_referenced_delete();


-- ── enroll_in_course ────────────────────────────────────────
-- Idempotent; refuses access='paid' without an existing row (the entitlement
-- seam). Everything ships free, so this path is dormant until Stripe.
CREATE OR REPLACE FUNCTION enroll_in_course(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_access TEXT;
  v_status TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT id, access, status INTO v_course, v_access, v_status FROM courses WHERE slug = p_slug;
  IF v_course IS NULL OR v_status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  IF is_enrolled(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', true, 'course_id', v_course, 'already', true);
  END IF;

  IF v_access = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_required');
  END IF;

  INSERT INTO course_enrollments (user_id, course_id, source)
  VALUES (v_me, v_course, 'self')
  ON CONFLICT (user_id, course_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'course_id', v_course);
END;
$$;

REVOKE ALL ON FUNCTION enroll_in_course(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION enroll_in_course(TEXT) TO authenticated;


-- ── draw_practice_item ──────────────────────────────────────
-- One question + a seed (for option shuffling; courses mint no quizzes row so
-- there is no quizId to seed from). Order: unseen siblings first (groups last
-- answered WRONG first), then seen siblings least-recently-seen first. Never a
-- dead end — it recycles the oldest once unseen siblings are exhausted. Includes
-- correct_answer because practice shows immediate feedback (like the quiz
-- engine); the CHECK deliberately does not.
CREATE OR REPLACE FUNCTION draw_practice_item(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_qid    TEXT;
  v_q      questions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT course_id INTO v_course FROM course_stages WHERE id = p_stage_id AND archived_at IS NULL;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;
  IF NOT is_enrolled(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enrolled');
  END IF;

  WITH grp AS (
    SELECT DISTINCT ON (q2.variant_group) q2.variant_group, vs.last_correct
    FROM course_variant_seen vs
    JOIN questions q2 ON q2.id = vs.question_id
    WHERE vs.user_id = v_me AND q2.course_stage_id = p_stage_id
    ORDER BY q2.variant_group, vs.last_seen_at DESC
  )
  SELECT q.id INTO v_qid
  FROM questions q
  LEFT JOIN course_variant_seen v ON v.question_id = q.id AND v.user_id = v_me
  LEFT JOIN grp ON grp.variant_group = q.variant_group
  WHERE q.course_stage_id = p_stage_id AND q.visibility = 'course' AND q.status = 'approved'
  ORDER BY
    (v.question_id IS NOT NULL) ASC,                       -- unseen first
    (grp.last_correct IS FALSE) DESC,                      -- wrong-group first
    COALESCE(v.last_seen_at, 'epoch'::timestamptz) ASC,    -- seen: least-recently-seen
    random()
  LIMIT 1;

  IF v_qid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
  END IF;

  SELECT * INTO v_q FROM questions WHERE id = v_qid;

  RETURN jsonb_build_object(
    'ok', true,
    'seed', gen_random_uuid()::text,
    'question', jsonb_build_object(
      'id', v_q.id,
      'question', v_q.question,
      'options', v_q.options,
      'correct_answer', v_q.correct_answer,
      'explanation', v_q.explanation,
      'difficulty', v_q.difficulty,
      'subject', v_q.subject,
      'variant_group', v_q.variant_group
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION draw_practice_item(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION draw_practice_item(UUID) TO authenticated;


-- ── record_practice_answer ──────────────────────────────────
-- Upserts course_variant_seen only; never touches progress or gating. Takes the
-- ANSWER, not a client boolean — last_correct drives the wrong-first draw order
-- AND the derived needs_review, so grading is server truth (the same rule
-- /api/results enforces). Guards enrollment.
CREATE OR REPLACE FUNCTION record_practice_answer(p_question_id TEXT, p_answer TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_answer  TEXT;
  v_course  UUID;
  v_correct BOOLEAN;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT q.correct_answer, s.course_id INTO v_answer, v_course
  FROM questions q
  JOIN course_stages s ON s.id = q.course_stage_id
  WHERE q.id = p_question_id AND q.visibility = 'course' AND q.status = 'approved';

  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT is_enrolled(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enrolled');
  END IF;

  v_correct := (p_answer IS NOT NULL AND p_answer = v_answer);

  INSERT INTO course_variant_seen (user_id, question_id, seen_count, correct_count, last_correct, last_seen_at)
  VALUES (v_me, p_question_id, 1, (v_correct)::int, v_correct, NOW())
  ON CONFLICT (user_id, question_id) DO UPDATE
  SET seen_count    = course_variant_seen.seen_count + 1,
      correct_count = course_variant_seen.correct_count + EXCLUDED.correct_count,
      last_correct  = EXCLUDED.last_correct,
      last_seen_at  = EXCLUDED.last_seen_at;

  RETURN jsonb_build_object('ok', true, 'correct', v_correct, 'correct_answer', v_answer);
END;
$$;

REVOKE ALL ON FUNCTION record_practice_answer(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION record_practice_answer(TEXT, TEXT) TO authenticated;


-- ── start_stage_check ───────────────────────────────────────
-- Returns an EXISTING open attempt as-is (idempotent-start, backed by the
-- partial unique index) before evaluating unlock; otherwise the caller must be
-- enrolled and the stage is_stage_unlocked(). new_count new items (one per
-- variant group, DISTINCT ON, unseen preferred) + up to review_slots review
-- items from completed earlier stages (wrong-then-oldest). Review slots are a
-- MAXIMUM, not a quota, and unfilled slots are dropped — the gate denominator is
-- always exactly new_total. correct_answer is NOT shipped (a graded check).
CREATE OR REPLACE FUNCTION start_stage_check(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me           UUID := (SELECT auth.uid());
  v_course       UUID;
  v_pos          INT;
  v_new_count    INT;
  v_review_slots INT;
  v_attempt_id   UUID;
  v_question_ids TEXT[];
  v_new          TEXT[];
  v_review       TEXT[];
  v_items        JSONB;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT s.course_id, s.position, c.new_count, c.review_slots
  INTO v_course, v_pos, v_new_count, v_review_slots
  FROM course_stages s
  JOIN courses c ON c.id = s.course_id
  WHERE s.id = p_stage_id AND s.archived_at IS NULL;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;
  IF NOT is_enrolled(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enrolled');
  END IF;

  -- Return an already-open attempt as-is (no reroll, no dead end). Only when
  -- none exists do we gate on unlock and mint one.
  SELECT id, question_ids INTO v_attempt_id, v_question_ids
  FROM course_check_attempts
  WHERE user_id = v_me AND stage_id = p_stage_id AND submitted_at IS NULL;

  IF v_attempt_id IS NULL THEN
    IF NOT is_stage_unlocked(p_stage_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'locked');
    END IF;

    -- New items: one sibling per group (unseen preferred, then oldest), then
    -- order groups unseen-first / wrong-first / oldest and cap at new_count.
    -- Degrades below new_count when the stage has fewer groups (guarded at
    -- import, but --sync can drop a group after the fact).
    WITH grp AS (
      SELECT DISTINCT ON (q2.variant_group) q2.variant_group, vs.last_correct
      FROM course_variant_seen vs
      JOIN questions q2 ON q2.id = vs.question_id
      WHERE vs.user_id = v_me AND q2.course_stage_id = p_stage_id
      ORDER BY q2.variant_group, vs.last_seen_at DESC
    ),
    picks AS (
      SELECT DISTINCT ON (q.variant_group)
        q.id,
        (v.question_id IS NOT NULL)                        AS seen,
        COALESCE(v.last_seen_at, 'epoch'::timestamptz)     AS lseen,
        (grp.last_correct IS FALSE)                        AS grp_wrong
      FROM questions q
      LEFT JOIN course_variant_seen v ON v.question_id = q.id AND v.user_id = v_me
      LEFT JOIN grp ON grp.variant_group = q.variant_group
      WHERE q.course_stage_id = p_stage_id AND q.visibility = 'course' AND q.status = 'approved'
      ORDER BY q.variant_group, (v.question_id IS NOT NULL) ASC, COALESCE(v.last_seen_at, 'epoch'::timestamptz) ASC
    )
    SELECT array_agg(id) INTO v_new FROM (
      SELECT id FROM picks
      ORDER BY seen ASC, grp_wrong DESC, lseen ASC, random()
      LIMIT v_new_count
    ) x;

    -- Review items: completed earlier non-archived stages, one sibling per group
    -- (seen preferred), groups wrong-then-oldest, capped at review_slots.
    WITH grpc AS (
      SELECT DISTINCT ON (q2.variant_group) q2.variant_group, vs.last_correct
      FROM course_variant_seen vs
      JOIN questions q2 ON q2.id = vs.question_id
      WHERE vs.user_id = v_me
      ORDER BY q2.variant_group, vs.last_seen_at DESC
    ),
    picks AS (
      SELECT DISTINCT ON (q.variant_group)
        q.id,
        COALESCE(v.last_seen_at, 'epoch'::timestamptz) AS lseen,
        (grpc.last_correct IS FALSE)                   AS grp_wrong
      FROM questions q
      JOIN course_stages s ON s.id = q.course_stage_id
      JOIN course_stage_progress p ON p.stage_id = s.id AND p.user_id = v_me AND p.state = 'complete'
      LEFT JOIN course_variant_seen v ON v.question_id = q.id AND v.user_id = v_me
      LEFT JOIN grpc ON grpc.variant_group = q.variant_group
      WHERE s.course_id = v_course AND s.position < v_pos AND s.archived_at IS NULL
        AND q.visibility = 'course' AND q.status = 'approved'
      ORDER BY q.variant_group, (v.question_id IS NOT NULL) DESC, COALESCE(v.last_seen_at, 'epoch'::timestamptz) ASC
    )
    SELECT array_agg(id) INTO v_review FROM (
      SELECT id FROM picks
      ORDER BY grp_wrong DESC, lseen ASC, random()
      LIMIT v_review_slots
    ) x;

    v_question_ids := COALESCE(v_new, '{}'::text[]) || COALESCE(v_review, '{}'::text[]);

    IF array_length(v_question_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
    END IF;

    -- Race-safe: double-clicking "Start check" must not mint two attempts.
    INSERT INTO course_check_attempts (user_id, stage_id, question_ids)
    VALUES (v_me, p_stage_id, v_question_ids)
    ON CONFLICT (user_id, stage_id) WHERE submitted_at IS NULL DO NOTHING
    RETURNING id INTO v_attempt_id;

    IF v_attempt_id IS NULL THEN
      SELECT id, question_ids INTO v_attempt_id, v_question_ids
      FROM course_check_attempts
      WHERE user_id = v_me AND stage_id = p_stage_id AND submitted_at IS NULL;
    END IF;
  END IF;

  -- Build the item payload in the recorded order. is_review is derived from the
  -- item's own stage — review items come from earlier stages, so this needs no
  -- stored split and survives resume. No correct_answer (graded server-side).
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', q.id,
             'question', q.question,
             'options', q.options,
             'difficulty', q.difficulty,
             'is_review', (q.course_stage_id IS DISTINCT FROM p_stage_id)
           ) ORDER BY u.ord
         )
  INTO v_items
  FROM unnest(v_question_ids) WITH ORDINALITY AS u(qid, ord)
  JOIN questions q ON q.id = u.qid;

  RETURN jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt_id,
    'stage_id', p_stage_id,
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION start_stage_check(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION start_stage_check(UUID) TO authenticated;


-- ── submit_stage_check ──────────────────────────────────────
-- Grades against questions.correct_answer in SQL, over the RECORDED question_ids
-- (never the payload), scores the gate on NEW items only, and upserts progress.
-- SECURITY DEFINER bypasses RLS, so the three guards below ARE the authorization
-- in this path.
CREATE OR REPLACE FUNCTION submit_stage_check(p_attempt_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me             UUID := (SELECT auth.uid());
  v_stage_id       UUID;
  v_question_ids   TEXT[];
  v_threshold      NUMERIC;
  v_new_total      INT;
  v_new_correct    INT;
  v_review_total   INT;
  v_review_correct INT;
  v_score          NUMERIC;
  v_passed         BOOLEAN;
  v_results        JSONB;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Guards 1 (ownership) + 2 (single submission) as ONE update — the statement
  -- is its own lock, so two concurrent submissions cannot both see NULL.
  UPDATE course_check_attempts
     SET submitted_at = NOW()
   WHERE id = p_attempt_id
     AND user_id = v_me
     AND submitted_at IS NULL
  RETURNING stage_id, question_ids INTO v_stage_id, v_question_ids;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_unavailable');
  END IF;

  SELECT c.pass_threshold INTO v_threshold
  FROM course_stages s JOIN courses c ON c.id = s.course_id
  WHERE s.id = v_stage_id;

  -- Guard 3: record seen-rows for the RECORDED questions, looking each answer up
  -- in p_answers. Extra payload entries are ignored; omissions score unanswered.
  INSERT INTO course_variant_seen (user_id, question_id, seen_count, correct_count, last_correct, last_seen_at)
  SELECT v_me, q.id, 1,
         (CASE WHEN (p_answers ->> q.id) IS NOT NULL AND (p_answers ->> q.id) = q.correct_answer THEN 1 ELSE 0 END),
         ((p_answers ->> q.id) IS NOT NULL AND (p_answers ->> q.id) = q.correct_answer),
         NOW()
  FROM unnest(v_question_ids) AS u(qid)
  JOIN questions q ON q.id = u.qid
  ON CONFLICT (user_id, question_id) DO UPDATE
  SET seen_count    = course_variant_seen.seen_count + 1,
      correct_count = course_variant_seen.correct_count + EXCLUDED.correct_count,
      last_correct  = EXCLUDED.last_correct,
      last_seen_at  = EXCLUDED.last_seen_at;

  SELECT
    count(*) FILTER (WHERE is_new),
    count(*) FILTER (WHERE is_new AND correct),
    count(*) FILTER (WHERE NOT is_new),
    count(*) FILTER (WHERE NOT is_new AND correct)
  INTO v_new_total, v_new_correct, v_review_total, v_review_correct
  FROM (
    SELECT (q.course_stage_id IS NOT DISTINCT FROM v_stage_id) AS is_new,
           ((p_answers ->> q.id) IS NOT NULL AND (p_answers ->> q.id) = q.correct_answer) AS correct
    FROM unnest(v_question_ids) AS u(qid)
    JOIN questions q ON q.id = u.qid
  ) g;

  v_score  := CASE WHEN v_new_total > 0 THEN ROUND(100.0 * v_new_correct / v_new_total, 2) ELSE 0 END;
  v_passed := v_score >= v_threshold;

  -- Upsert progress. Once complete, stays complete (never re-locks).
  INSERT INTO course_stage_progress (user_id, stage_id, state, best_score, attempts, completed_at, updated_at)
  VALUES (v_me, v_stage_id,
          CASE WHEN v_passed THEN 'complete' ELSE 'in_progress' END,
          v_score, 1,
          CASE WHEN v_passed THEN NOW() END,
          NOW())
  ON CONFLICT (user_id, stage_id) DO UPDATE
  SET state        = CASE WHEN course_stage_progress.state = 'complete' OR v_passed THEN 'complete' ELSE 'in_progress' END,
      best_score   = GREATEST(COALESCE(course_stage_progress.best_score, 0), v_score),
      attempts     = course_stage_progress.attempts + 1,
      completed_at = COALESCE(course_stage_progress.completed_at, CASE WHEN v_passed THEN NOW() END),
      updated_at   = NOW();

  UPDATE course_check_attempts
     SET answers = p_answers,
         new_correct = v_new_correct, new_total = v_new_total,
         review_correct = v_review_correct, review_total = v_review_total,
         score = v_score, passed = v_passed
   WHERE id = p_attempt_id;

  SELECT jsonb_agg(
           jsonb_build_object(
             'question_id', q.id,
             'is_review', (q.course_stage_id IS DISTINCT FROM v_stage_id),
             'correct', ((p_answers ->> q.id) IS NOT NULL AND (p_answers ->> q.id) = q.correct_answer),
             'correct_answer', q.correct_answer,
             'given', (p_answers ->> q.id)
           ) ORDER BY u.ord
         )
  INTO v_results
  FROM unnest(v_question_ids) WITH ORDINALITY AS u(qid, ord)
  JOIN questions q ON q.id = u.qid;

  RETURN jsonb_build_object(
    'ok', true,
    'score', v_score,
    'passed', v_passed,
    'new_correct', v_new_correct, 'new_total', v_new_total,
    'review_correct', v_review_correct, 'review_total', v_review_total,
    'results', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_stage_check(UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_stage_check(UUID, JSONB) TO authenticated;


-- ── get_course_progress ─────────────────────────────────────
-- Feeds the syllabus: one row per non-archived stage with state, best_score,
-- attempts, DERIVED needs_review, and unlocked (shared with enforcement via
-- is_stage_unlocked). SECURITY INVOKER — RLS already scopes course_variant_seen
-- to its owner and questions to enrolled stages.
--
-- needs_review collapses to one row per variant GROUP before testing
-- (DISTINCT ON ... last_seen_at DESC = latest answer per group), restricted to
-- complete stages, filtering retired (status<>'approved') variants. A naive
-- per-row bool_or would leave a group permanently amber after one wrong sibling
-- even once a later sibling is answered right.
CREATE OR REPLACE FUNCTION get_course_progress(p_course_id UUID)
RETURNS TABLE (
  stage_id     UUID,
  state        TEXT,
  best_score   NUMERIC,
  attempts     INT,
  needs_review BOOLEAN,
  unlocked     BOOLEAN
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (q.course_stage_id, q.variant_group)
           q.course_stage_id AS sid,
           v.last_correct
    FROM course_variant_seen v
    JOIN questions q ON q.id = v.question_id
    WHERE v.user_id = (SELECT auth.uid())
      AND q.status = 'approved'
      AND q.course_stage_id IS NOT NULL
    ORDER BY q.course_stage_id, q.variant_group, v.last_seen_at DESC
  ),
  nr AS (
    SELECT sid, bool_or(NOT last_correct) AS needs_review
    FROM latest
    GROUP BY sid
  )
  SELECT
    s.id,
    p.state,
    p.best_score,
    COALESCE(p.attempts, 0),
    COALESCE(p.state = 'complete' AND nr.needs_review, FALSE),
    is_stage_unlocked(s.id)
  FROM course_stages s
  LEFT JOIN course_stage_progress p ON p.stage_id = s.id AND p.user_id = (SELECT auth.uid())
  LEFT JOIN nr ON nr.sid = s.id
  WHERE s.course_id = p_course_id AND s.archived_at IS NULL
  ORDER BY s.position;
$$;

REVOKE ALL ON FUNCTION get_course_progress(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_course_progress(UUID) TO authenticated;
