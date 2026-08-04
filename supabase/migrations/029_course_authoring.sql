-- ============================================================
-- 029_course_authoring.sql
--
-- The first IN-APP write path for course content. Until now course content
-- (stage theory + questions) entered ONLY through scripts/import-course.ts
-- (service-role, offline); every course table has SELECT-only grants and only
-- SELECT policies (see 028). This migration adds admin/author theory editing:
--
--   • course_editors — per-course delegation. An admin grants a specific author
--     edit rights to a specific course. "Author of THE course", not a global
--     is_author capability and not DB access.
--   • course_stage_theory.updated_by — the marker the importer reads to PROTECT
--     app-edited stages (NULL = importer-written; non-null = edited in-app).
--   • course_stage_theory_versions — history, so a bad edit can be reverted.
--   • can_edit_course() — the authorization helper (is_admin OR course_editor).
--   • get_stage_authoring() — the editor READ path. Bypasses the enrolled-only
--     theory RLS so an editor need not enroll; returns theory + read-only
--     exercises for the walkthrough.
--   • save_stage_theory() — the WRITE. Atomic whole-stage save, optimistic-lock,
--     snapshots history. Content validation (zod + KaTeX) is done in the API
--     route before calling; the structural check here is defence-in-depth.
--   • grant_course_editor() / revoke_course_editor() — admin-only delegation.
--
-- House style throughout: writes go through SECURITY DEFINER RPCs, tables keep
-- SELECT-only grants, policies use (SELECT auth.uid()), and the is_admin() helper
-- (027) is reused rather than inlined (avoids the profiles policy recursion trap).
--
-- Editing works while COURSES_ENABLED is false: none of this is gated on the
-- feature flag (that gate lives in the app routes for LEARNER surfaces only), so
-- content can be prepared/corrected before public launch.
--
-- Per the house rule, this file is written and handed off; migrations are applied
-- by the user, never db push from the agent.
--
-- Safe to re-apply: idempotent.
-- ============================================================


-- ── course_editors ──────────────────────────────────────────
-- Per-course edit delegation. Written only by grant_/revoke_course_editor()
-- (admin-only). granted_by is informational (who delegated). ON DELETE CASCADE on
-- both FKs: a removed user or course takes its grants with it.
CREATE TABLE IF NOT EXISTS course_editors (
  course_id  UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID        REFERENCES profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, user_id)
);

ALTER TABLE course_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_editors FROM anon, authenticated;
GRANT SELECT ON course_editors TO authenticated;

-- A user reads their own grants (to learn which courses they may edit); an admin
-- reads all (the management UI). is_admin() (027) breaks the profiles recursion.
DROP POLICY IF EXISTS "course_editors: self read" ON course_editors;
CREATE POLICY "course_editors: self read"
  ON course_editors FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_editors: admin read" ON course_editors;
CREATE POLICY "course_editors: admin read"
  ON course_editors FOR SELECT
  USING (is_admin((SELECT auth.uid())));


-- ── can_edit_course ─────────────────────────────────────────
-- The authorization helper for every authoring path. Admin (027) OR an explicit
-- course_editors grant. SECURITY DEFINER so it reads course_editors without a
-- direct grant to the caller; STABLE so it evaluates once per statement. Mirrors
-- is_group_member / shares_group_with (014). Defined here, BEFORE the versions
-- policy that calls it — a policy referencing an undefined function fails to create.
CREATE OR REPLACE FUNCTION can_edit_course(p_course_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    is_admin(p_user_id)
    OR EXISTS (SELECT 1 FROM course_editors
               WHERE course_id = p_course_id AND user_id = p_user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION can_edit_course(UUID, UUID) TO authenticated;


-- ── course_stage_theory.updated_by ──────────────────────────
-- The protect-edited marker. NULL after an importer upsert (the importer never
-- sets it); non-null after an in-app save. import-course.ts skips any stage whose
-- theory has updated_by IS NOT NULL unless run with --adopt.
ALTER TABLE course_stage_theory
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);


-- ── course_stage_theory_versions ────────────────────────────
-- Append-only history: one row per SAVE, snapshotting the blocks that were
-- REPLACED. version is per-stage and monotonic. Revert is a normal save of an
-- older version's blocks (never a destructive rewind), so this table is read-only
-- to the app.
CREATE TABLE IF NOT EXISTS course_stage_theory_versions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id   UUID        NOT NULL REFERENCES course_stages(id) ON DELETE CASCADE,
  version    INT         NOT NULL,
  blocks     JSONB       NOT NULL,
  edited_by  UUID        REFERENCES profiles(id),
  edited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, version)
);

CREATE INDEX IF NOT EXISTS course_stage_theory_versions_stage_idx
  ON course_stage_theory_versions (stage_id, version DESC);

ALTER TABLE course_stage_theory_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_stage_theory_versions FROM anon, authenticated;
GRANT SELECT ON course_stage_theory_versions TO authenticated;

-- Readable by anyone who can edit the owning course.
DROP POLICY IF EXISTS "course_stage_theory_versions: editor read" ON course_stage_theory_versions;
CREATE POLICY "course_stage_theory_versions: editor read"
  ON course_stage_theory_versions FOR SELECT
  USING (can_edit_course(
           (SELECT s.course_id FROM course_stages s WHERE s.id = course_stage_theory_versions.stage_id),
           (SELECT auth.uid())));


-- ── get_stage_authoring ─────────────────────────────────────
-- The editor READ path — one call powers the whole editor walkthrough. Guards
-- can_edit_course, then returns (bypassing the enrolled-only theory RLS via
-- SECURITY DEFINER):
--   • blocks + updated_at (the optimistic-concurrency token; null when no theory
--     row exists yet — a fresh stage),
--   • the stage's questions grouped by variant_group, READ-ONLY, for the
--     exercises view (stem, options, correct_answer, ordinal, status). Editing
--     exercises is out of scope; this is review-in-context only.
CREATE OR REPLACE FUNCTION get_stage_authoring(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_course  UUID;
  v_blocks  JSONB;
  v_updated TIMESTAMPTZ;
  v_groups  JSONB;
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

  -- Read-only exercises: variant groups, siblings ordered by variant_ordinal.
  SELECT jsonb_agg(g ORDER BY g_group)
  INTO v_groups
  FROM (
    SELECT q.variant_group AS g_group,
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
                 'visibility', q.visibility
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
    'updated_at', v_updated,          -- null when no theory row yet
    'groups', COALESCE(v_groups, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_stage_authoring(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_stage_authoring(UUID) TO authenticated;


-- ── save_stage_theory ───────────────────────────────────────
-- The WRITE. Atomic whole-stage replace. Guards can_edit_course. Optimistic
-- concurrency on updated_at: the caller sends the updated_at it loaded, and a
-- mismatch means someone else saved in between → 'stale' (no clobber). Snapshots
-- the REPLACED blocks into _versions before overwriting, so history is complete
-- and revert is just another save. Rich content validation (zod + KaTeX compile)
-- runs in the API route BEFORE this; the structural check here is a fail-closed
-- backstop for a direct RPC caller.
CREATE OR REPLACE FUNCTION save_stage_theory(
  p_stage_id        UUID,
  p_blocks          JSONB,
  p_base_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_cur       TIMESTAMPTZ;
  v_cur_blocks JSONB;
  v_exists    BOOLEAN;
  v_next_ver  INT;
  v_new_ts    TIMESTAMPTZ := NOW();
BEGIN
  SELECT course_id INTO v_course FROM course_stages WHERE id = p_stage_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Structural backstop: an array of blocks with known discriminators.
  IF jsonb_typeof(p_blocks) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_blocks) e
    WHERE COALESCE(e->>'type', '') <> ALL (ARRAY['prose','formula','example','callout','list','definition'])
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  END IF;

  -- Lock the row (or its absence) and read current state for the concurrency check.
  SELECT updated_at, blocks INTO v_cur, v_cur_blocks
  FROM course_stage_theory WHERE stage_id = p_stage_id FOR UPDATE;
  v_exists := FOUND;

  -- Optimistic concurrency. A fresh stage (no row) requires a NULL base token.
  IF v_exists THEN
    IF p_base_updated_at IS DISTINCT FROM v_cur THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stale');
    END IF;
  ELSE
    IF p_base_updated_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stale');
    END IF;
  END IF;

  -- Snapshot the blocks being replaced (only if a row existed).
  IF v_exists THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_ver
    FROM course_stage_theory_versions WHERE stage_id = p_stage_id;
    INSERT INTO course_stage_theory_versions (stage_id, version, blocks, edited_by, edited_at)
    VALUES (p_stage_id, v_next_ver, v_cur_blocks, v_me, v_new_ts);
  END IF;

  INSERT INTO course_stage_theory (stage_id, blocks, updated_at, updated_by)
  VALUES (p_stage_id, p_blocks, v_new_ts, v_me)
  ON CONFLICT (stage_id) DO UPDATE
  SET blocks = EXCLUDED.blocks, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

  RETURN jsonb_build_object('ok', true, 'updated_at', v_new_ts);
END;
$$;

REVOKE ALL ON FUNCTION save_stage_theory(UUID, JSONB, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION save_stage_theory(UUID, JSONB, TIMESTAMPTZ) TO authenticated;


-- ── grant_course_editor / revoke_course_editor ──────────────
-- Admin-only delegation. grant takes an EMAIL (the natural handle for "add this
-- author") and resolves it against auth.users — readable here because SECURITY
-- DEFINER runs as the function owner. Idempotent.
CREATE OR REPLACE FUNCTION grant_course_editor(p_course_id UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_user UUID;
BEGIN
  IF NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO course_editors (course_id, user_id, granted_by)
  VALUES (p_course_id, v_user, v_me)
  ON CONFLICT (course_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user);
END;
$$;

REVOKE ALL ON FUNCTION grant_course_editor(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION grant_course_editor(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION revoke_course_editor(p_course_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM course_editors WHERE course_id = p_course_id AND user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION revoke_course_editor(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION revoke_course_editor(UUID, UUID) TO authenticated;
