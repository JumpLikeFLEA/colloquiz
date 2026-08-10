-- ============================================================
-- 032_course_exercise_authoring.sql
--
-- Turns the read-only Exercises tab of the StageEditor into a real editor.
-- 029 made stage THEORY writable through the app; this migration is the
-- exercises half. Same house style: SECURITY DEFINER RPCs, tables SELECT-only
-- to authenticated, can_edit_course() (029) as the sole authorization gate.
--
-- What this adds:
--   • course_stage_exercises — a sibling row per stage holding the concurrency
--     token (updated_at + updated_by) and the explicit group_order TEXT[]. The
--     natural home for a per-stage "someone edited this in-app" marker: without
--     it, the importer has nowhere to look before overwriting.
--   • questions.updated_by — the per-question protect marker. NULL for rows the
--     importer wrote (or reclaimed via --adopt); non-null once the in-app editor
--     touched them. scripts/import-course.ts will learn to skip any question
--     whose updated_by IS NOT NULL unless run with --adopt, mirroring the theory
--     guard 029 introduced.
--   • get_stage_authoring() is REPLACED so its payload also carries authored_key
--     + updated_by per variant (the client shows a "hand-authored" badge for
--     any authored_key matching '%/hand-%'), plus the stage-level group_order
--     and exercises_updated_at. Order is now array_position(group_order, …)
--     with a deterministic label tie-break for groups not in the array — a
--     partially-migrated stage still renders.
--   • save_stage_exercises() — the atomic write. One CAS token per stage; one
--     transactional UPDATE/INSERT/DELETE pass over the stage's questions; the
--     BEFORE DELETE guard trigger (028) is honoured with a 'deletion_blocked'
--     surface. New rows get authored_key '<group>/hand-<short-uuid>' so the
--     partial UNIQUE index applies and future importer files (which use
--     'v1'/'v2'/… ordinals) cannot collide.
--
-- Deliberately NOT here:
--   • Exercise version history / revert. Snapshotting the multi-row payload and
--     re-hydrating stable ids on revert is its own design; ship the base editor
--     without it. Theory's history table is untouched.
--   • Session snapshotting for in-flight learners. The check RPCs derive item
--     payloads from live questions on every call — by design. The save-confirm
--     dialog states plainly that learners with open sessions see updates.
--
-- Safe to re-apply: idempotent (IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY
-- IF EXISTS).
-- ============================================================


-- ── course_stage_exercises ──────────────────────────────────
-- One row per stage. Its updated_at is the optimistic-concurrency token for
-- the whole-stage save; updated_by is the "edited in-app" protect marker the
-- importer will read; group_order is the explicit ordering of variant_group
-- labels for the read path.
CREATE TABLE IF NOT EXISTS course_stage_exercises (
  stage_id      UUID        PRIMARY KEY REFERENCES course_stages(id) ON DELETE CASCADE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID        REFERENCES profiles(id),
  group_order   TEXT[]      NOT NULL DEFAULT '{}'
);

ALTER TABLE course_stage_exercises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_stage_exercises FROM anon, authenticated;
GRANT SELECT ON course_stage_exercises TO authenticated;

-- Readable by anyone who can edit the owning course (the editor read path goes
-- through get_stage_authoring anyway, but keep the table readable so a future
-- admin surface can query it directly).
DROP POLICY IF EXISTS "course_stage_exercises: editor read" ON course_stage_exercises;
CREATE POLICY "course_stage_exercises: editor read"
  ON course_stage_exercises FOR SELECT
  USING (can_edit_course(
           (SELECT s.course_id FROM course_stages s WHERE s.id = course_stage_exercises.stage_id),
           (SELECT auth.uid())));


-- ── questions.updated_by ────────────────────────────────────
-- The per-question protect marker. NULL after an importer upsert (importer
-- never sets it); non-null after an in-app save. import-course.ts will skip
-- any question whose updated_by IS NOT NULL unless run with --adopt, matching
-- the theory guard from 029. No column-level GRANT dance is needed here —
-- migration 006's revoke-and-grant lockdown applied only to profiles.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);


-- ── get_stage_authoring (REPLACED) ──────────────────────────
-- Superset of 029's payload. Adds per-variant authored_key + updated_by, plus
-- stage-level group_order and exercises_updated_at. Ordering: an explicit
-- array_position lookup against group_order puts declared groups first (in
-- declared order); groups not yet in the array (a partially-migrated stage,
-- or a freshly-inserted group before save) fall to the end, tie-broken by
-- label so the order is deterministic.
CREATE OR REPLACE FUNCTION get_stage_authoring(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me                 UUID := (SELECT auth.uid());
  v_course             UUID;
  v_blocks             JSONB;
  v_updated            TIMESTAMPTZ;
  v_groups             JSONB;
  v_group_order        TEXT[];
  v_exercises_updated  TIMESTAMPTZ;
BEGIN
  SELECT course_id INTO v_course FROM course_stages WHERE id = p_stage_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT blocks, updated_at INTO v_blocks, v_updated
  FROM course_stage_theory WHERE stage_id = p_stage_id;

  SELECT group_order, updated_at INTO v_group_order, v_exercises_updated
  FROM course_stage_exercises WHERE stage_id = p_stage_id;
  v_group_order := COALESCE(v_group_order, '{}'::text[]);

  -- Variant groups ordered by array_position(group_order, label). Unknown labels
  -- (array_position → NULL) sort last via NULLS LAST, then by label ASC. Sibling
  -- rows inside each group stay ordered by variant_ordinal.
  SELECT jsonb_agg(g ORDER BY g_pos NULLS LAST, g_group)
  INTO v_groups
  FROM (
    SELECT q.variant_group AS g_group,
           array_position(v_group_order, q.variant_group) AS g_pos,
           jsonb_build_object(
             'variant_group', q.variant_group,
             'siblings', jsonb_agg(
               jsonb_build_object(
                 'id', q.id,
                 'question', q.question,
                 'options', q.options,
                 'correct_answer', q.correct_answer,
                 'explanation', q.explanation,
                 'difficulty', q.difficulty,
                 'variant_ordinal', q.variant_ordinal,
                 'status', q.status,
                 'visibility', q.visibility,
                 'authored_key', q.authored_key,
                 'updated_by', q.updated_by
               ) ORDER BY q.variant_ordinal
             )
           ) AS g
    FROM questions q
    WHERE q.course_stage_id = p_stage_id
    GROUP BY q.variant_group
  ) grouped;

  RETURN jsonb_build_object(
    'ok', true,
    'stage_id', p_stage_id,
    'blocks', COALESCE(v_blocks, '[]'::jsonb),
    'updated_at', v_updated,
    'groups', COALESCE(v_groups, '[]'::jsonb),
    'group_order', to_jsonb(v_group_order),
    'exercises_updated_at', v_exercises_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION get_stage_authoring(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_stage_authoring(UUID) TO authenticated;


-- ── save_stage_exercises ────────────────────────────────────
-- One atomic pass over an entire stage's exercises.
--
-- Payload shape (validated in the API route with lib/exerciseValidate.ts; the
-- structural check here is a fail-closed backstop for a direct RPC caller):
--
--   {
--     "group_order": ["limit-alg-sub", "limit-conjugate", ...],
--     "groups": [
--       {
--         "variant_group": "limit-alg-sub",
--         "siblings": [
--           { "id": "crs-...", "variant_ordinal": 1,
--             "question": "...", "options": ["a","b","c","d"],
--             "correct_answer": "a", "explanation": "...", "difficulty": "easy" },
--           { "_new": true, "variant_ordinal": 3, ... }
--         ]
--       },
--       ...
--     ],
--     "deleted_ids": ["crs-abc...", "crs-def..."]
--   }
--
-- Concurrency: p_base_updated_at against course_stage_exercises.updated_at.
-- A fresh stage (no exercises row) requires a NULL base token, matching theory.
--
-- New rows: id derived from authored_key exactly like the importer does
-- ("crs-" + sha256(authored_key).slice(0,16)), status='approved',
-- visibility='course', subject/tags copied from any surviving sibling in the
-- same stage (all stage questions share subject/tags — the importer sets them
-- from course.subject and the stage's subtopic).
--
-- Delete: honours the BEFORE DELETE trigger (028) — a question referenced by a
-- non-course quiz.question_ids raises, and this function traps that as
-- 'deletion_blocked' with the offending id list rather than letting the whole
-- transaction bomb with a generic message.
CREATE OR REPLACE FUNCTION save_stage_exercises(
  p_stage_id        UUID,
  p_payload         JSONB,
  p_base_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me            UUID := (SELECT auth.uid());
  v_course        UUID;
  v_cur           TIMESTAMPTZ;
  v_exists        BOOLEAN;
  v_new_ts        TIMESTAMPTZ := NOW();
  v_groups        JSONB;
  v_group_order   TEXT[];
  v_deleted       TEXT[];
  v_group         JSONB;
  v_sibling       JSONB;
  v_group_label   TEXT;
  v_id            TEXT;
  v_new_key       TEXT;
  v_new_id        TEXT;
  v_stage_subject TEXT;
  v_stage_tags    TEXT[];
  v_blocked       TEXT[];
BEGIN
  -- Auth
  SELECT course_id INTO v_course FROM course_stages WHERE id = p_stage_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Structural backstop
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;
  v_groups := COALESCE(p_payload->'groups', '[]'::jsonb);
  IF jsonb_typeof(v_groups) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  -- group_order: TEXT[]. Missing/null → derive from groups (declared order).
  IF p_payload ? 'group_order' AND jsonb_typeof(p_payload->'group_order') = 'array' THEN
    SELECT COALESCE(array_agg(value::text), '{}'::text[])
    INTO v_group_order
    FROM jsonb_array_elements_text(p_payload->'group_order');
  ELSE
    SELECT COALESCE(array_agg(g->>'variant_group'), '{}'::text[])
    INTO v_group_order
    FROM jsonb_array_elements(v_groups) g;
  END IF;

  -- deleted_ids: TEXT[]. Missing/null → empty.
  IF p_payload ? 'deleted_ids' AND jsonb_typeof(p_payload->'deleted_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::text), '{}'::text[])
    INTO v_deleted
    FROM jsonb_array_elements_text(p_payload->'deleted_ids');
  ELSE
    v_deleted := '{}'::text[];
  END IF;

  -- CAS on course_stage_exercises. Lock the row (or its absence).
  SELECT updated_at INTO v_cur
  FROM course_stage_exercises WHERE stage_id = p_stage_id FOR UPDATE;
  v_exists := FOUND;

  IF v_exists THEN
    IF p_base_updated_at IS DISTINCT FROM v_cur THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stale');
    END IF;
  ELSE
    IF p_base_updated_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stale');
    END IF;
  END IF;

  -- Discover this stage's subject + tags from any surviving sibling. Every
  -- existing question in the stage shares these (set by the importer from
  -- course.subject and slugifyForTag(stage.subtopic)). If the stage has zero
  -- questions today, fall back to the course.subject and empty tags.
  SELECT q.subject, q.tags INTO v_stage_subject, v_stage_tags
  FROM questions q
  WHERE q.course_stage_id = p_stage_id
    AND (v_deleted IS NULL OR q.id <> ALL (v_deleted))
  LIMIT 1;
  IF v_stage_subject IS NULL THEN
    SELECT subject INTO v_stage_subject FROM courses WHERE id = v_course;
  END IF;
  v_stage_tags := COALESCE(v_stage_tags, '{}'::text[]);

  -- ── DELETE ────────────────────────────────────────────────
  -- The BEFORE DELETE trigger (028) refuses deletion of a question referenced by
  -- a non-course quiz.question_ids. Practically inert for visibility='course'
  -- rows, but trap the RAISE cleanly so the client sees a specific error.
  IF array_length(v_deleted, 1) IS NOT NULL THEN
    BEGIN
      DELETE FROM questions
      WHERE course_stage_id = p_stage_id
        AND id = ANY (v_deleted);
    EXCEPTION WHEN OTHERS THEN
      -- Try to identify which ids the trigger blocked, if any (a fresh
      -- SELECT after ROLLBACK is fine; we're still inside the outer function).
      SELECT COALESCE(array_agg(q.id), '{}'::text[])
      INTO v_blocked
      FROM questions q
      WHERE q.id = ANY (v_deleted)
        AND EXISTS (SELECT 1 FROM quizzes qz WHERE qz.question_ids @> ARRAY[q.id]);
      RETURN jsonb_build_object(
        'ok', false, 'error', 'deletion_blocked',
        'blocked_ids', to_jsonb(v_blocked)
      );
    END;
  END IF;

  -- ── UPSERT groups ─────────────────────────────────────────
  FOR v_group IN SELECT * FROM jsonb_array_elements(v_groups)
  LOOP
    v_group_label := v_group->>'variant_group';
    IF v_group_label IS NULL OR v_group_label = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
    END IF;

    FOR v_sibling IN SELECT * FROM jsonb_array_elements(v_group->'siblings')
    LOOP
      -- Invariants the DB genuinely cannot repair.
      IF jsonb_typeof(v_sibling->'options') <> 'array'
         OR jsonb_array_length(v_sibling->'options') < 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
      END IF;
      IF (v_sibling->>'correct_answer') IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_sibling->'options') o
        WHERE o = (v_sibling->>'correct_answer')
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
      END IF;

      IF (v_sibling->>'_new')::boolean IS TRUE THEN
        -- New sibling: mint authored_key '<group>/hand-<short-uuid>'. The
        -- 'hand-' marker is greppable and can never collide with future
        -- importer JSON (which uses v1/v2/… conventions). Prefix with the
        -- course.slug + stage.key + group to match the importer's key path
        -- (calculus-i/limits/limit-alg-sub/hand-<uuid8>).
        v_new_key := (SELECT c.slug FROM courses c WHERE c.id = v_course)
                     || '/' || (SELECT s.key FROM course_stages s WHERE s.id = p_stage_id)
                     || '/' || v_group_label
                     || '/hand-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
        v_new_id := 'crs-' || substr(encode(digest(v_new_key, 'sha256'), 'hex'), 1, 16);

        INSERT INTO questions (
          id, type, subject, tags, difficulty,
          question, options, correct_answer, explanation,
          source, status, visibility,
          content_hash, variant_group, variant_ordinal, authored_key,
          course_stage_id, updated_by
        ) VALUES (
          v_new_id, 'multiple_choice', v_stage_subject, v_stage_tags,
          COALESCE(v_sibling->>'difficulty', 'medium'),
          v_sibling->>'question',
          ARRAY(SELECT jsonb_array_elements_text(v_sibling->'options')),
          v_sibling->>'correct_answer',
          COALESCE(v_sibling->>'explanation', ''),
          'manual', 'approved', 'course',
          -- content_hash is derived from question + options in the importer;
          -- inside SQL we don't have that helper, so store a stable-enough hash
          -- of the same inputs. Uniqueness of content_hash isn't enforced by a
          -- constraint; it's used for dedup in the generator flow, which never
          -- runs on course-visibility rows.
          encode(digest(
            (v_sibling->>'question') || '|' ||
            (SELECT string_agg(o, '||') FROM jsonb_array_elements_text(v_sibling->'options') o),
            'sha256'
          ), 'hex'),
          v_group_label,
          COALESCE((v_sibling->>'variant_ordinal')::int, 1),
          v_new_key,
          p_stage_id,
          v_me
        );
      ELSE
        v_id := v_sibling->>'id';
        IF v_id IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
        END IF;
        UPDATE questions
        SET question         = v_sibling->>'question',
            options          = ARRAY(SELECT jsonb_array_elements_text(v_sibling->'options')),
            correct_answer   = v_sibling->>'correct_answer',
            explanation      = COALESCE(v_sibling->>'explanation', ''),
            difficulty       = COALESCE(v_sibling->>'difficulty', difficulty),
            variant_group    = v_group_label,
            variant_ordinal  = COALESCE((v_sibling->>'variant_ordinal')::int, variant_ordinal),
            updated_by       = v_me
        WHERE id = v_id AND course_stage_id = p_stage_id;
      END IF;
    END LOOP;
  END LOOP;

  -- ── UPSERT the sibling row (concurrency + group order) ────
  INSERT INTO course_stage_exercises (stage_id, updated_at, updated_by, group_order)
  VALUES (p_stage_id, v_new_ts, v_me, v_group_order)
  ON CONFLICT (stage_id) DO UPDATE
  SET updated_at  = EXCLUDED.updated_at,
      updated_by  = EXCLUDED.updated_by,
      group_order = EXCLUDED.group_order;

  RETURN jsonb_build_object('ok', true, 'updated_at', v_new_ts);
END;
$$;

REVOKE ALL ON FUNCTION save_stage_exercises(UUID, JSONB, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION save_stage_exercises(UUID, JSONB, TIMESTAMPTZ) TO authenticated;
