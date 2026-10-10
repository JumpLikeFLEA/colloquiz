-- ============================================================
-- 055_lesson_access_levels.sql
--
-- CNT-012. Writes what CNT-011 decided (docs/decisions/0094): the per-lesson
-- `in_free_sample` boolean becomes a three-value `access_level`, and the
-- learner surfaces get a lesson STATE function to render from instead of
-- deciding "free / sign in / paid" in TypeScript (CNT-014 moves the readers).
-- Choices made while writing it are recorded in docs/decisions/0099.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 054_current_terms_version.sql
--   latest body of the account-delete RPC   -> 053_signup_acquisition.sql
-- (the exact commands are in the section header; they are not quoted here
-- because quoting the second one's pattern would make this file match it).
-- This migration does not touch the account-delete RPC: lessons carries no
-- user key. Re-emitted bodies, each from its latest definition (rg over
-- supabase/migrations):
--   can_read_lesson         044:139
--   create_lesson           046:61
--   publish_course          047:200
--   set_lesson_free_sample  041:437
--
-- ── 1. lessons.access_level (0094 Decision 1) ───────────────────────────
-- One job: WHO may open this lesson. `anyone` (the free sample),
-- `signed_in` (any account, which is free), `entitled` (a grant or, from
-- COH-002, an enrolment). Not a schedule and not a general-purpose lock.
-- DEFAULT 'entitled' equals the old DEFAULT FALSE, so scripts/import-lesson.ts
-- (which omits both columns) needs no change.
-- Backfill: in_free_sample true -> 'anyone', false -> 'entitled'. This
-- changes no behaviour (0094 Decision 1).
--
-- in_free_sample stays, unread by SQL, until CNT-014 has moved the TS
-- readers off it (lib/coursePage.ts, lib/coursePageProgress.ts,
-- lib/courseAuthoring.ts); a later migration drops it. Until then the TS
-- readers and RLS must not disagree, so the old column is pinned to the new
-- one by a CHECK: in_free_sample = (access_level = 'anyone'). Every writer
-- below sets both from ONE value, and any other writer that sets one
-- without the other fails loudly instead of diverging (0099 Decision 2).
--
-- ── 2. can_read_lesson (re-emitted from 044:139) ────────────────────────
-- Same three branches; only the free-sample branch changes:
--   editor   — unchanged.
--   level    — course published, lesson published, NOT archived, and
--              access_level = 'anyone', or 'signed_in' with a non-NULL
--              auth.uid(). auth.uid() is NULL for anon, so 'signed_in'
--              fails closed for anon with no anon-specific branch.
--   entitled — unchanged; bypasses status, archived_at AND access_level.
-- The cohort schedule is not here yet: COH-002 adds it to the entitled
-- branch only (0094 Decision 4).
--
-- ── 3. The policies (044:183, 041:256) need no change ───────────────────
-- "lessons: published read" carries no free-sample clause (metadata is a
-- preview for every lesson, docs/handoff.md "Preview, precisely"), and
-- "lesson_versions: published content read" decides content access by
-- calling can_read_lesson, so both follow the new column through the
-- function. The protocol in 0099 shows each cell.
--
-- ── 4. course_lesson_states / lesson_state ──────────────────────────────
-- The state the UI renders, per lesson, for the CALLER:
--   open              — can_read_lesson() is true;
--   needs_sign_in     — not open, the level is 'signed_in' (so the caller
--                       is anonymous);
--   needs_entitlement — anything else.
-- The state is derived from can_read_lesson, never recomputed beside it,
-- so the two cannot disagree. access_level is returned too, so a "free"
-- badge (level 'anyone') is a lookup, not a TS decision. opens_at is NULL
-- until COH-002 (cohort weeks) fills it.
-- Rows: every lesson with a published version that is either listed (not
-- archived, course published: the "lessons: published read" base case) or
-- readable by the caller (can_read_lesson: an entitled learner's archived
-- lesson, an editor's archived lesson or unpublished course, as PLAY-006's
-- matrix shows them playable, docs/decisions/0056 Decision 4). Never-
-- published drafts are excluded for everyone, editors included: the public
-- page cannot render them. SECURITY INVOKER, so RLS applies on top.
-- lesson_state(p_lesson_id) is the single-lesson form getPublicLesson will
-- use; it filters course_lesson_states, so there is one definition.
--
-- ── 5. lesson_teaser (0094 Decision 3, option b) ────────────────────────
-- For 'signed_in' lessons only, in a published course, published, not
-- archived: the theory blocks BEFORE the first interactive block (a
-- practice block, a self_check block, or any block whose kind is not
-- 'theory'), whitelisted by type (heading, prose, example, callout, list,
-- image, video, table) so a type added later is excluded by default. No
-- interactive block at all -> no rows (otherwise the whole lesson would be
-- readable behind a wall). SECURITY DEFINER because the denied caller
-- cannot read lesson_versions; the cut is made here, so no practice payload
-- or self_check modelAnswer is ever returned.
--
-- ── 6. Editor functions ─────────────────────────────────────────────────
-- set_lesson_access_level replaces set_lesson_free_sample (0094 Decision
-- 1). set_lesson_free_sample stays callable, as a wrapper over it, until
-- AUTH-009 replaces the editor toggle and deletes both the RPC and its
-- route (0094: "deleted in CNT-014/AUTH-009"); the wrapper means today's
-- editor toggle obeys the new rules instead of writing the old column.
-- Rule (0094 Decision 2): a published course keeps at least one
-- non-archived 'anyone' lesson. publish_course refuses without one, and
-- set_lesson_access_level refuses to remove the last one. Every course is
-- self-paced until COH-002 adds courses.format, which then limits the rule
-- to self_paced (0099 Decision 1). create_lesson writes 'anyone' for a
-- course's first lesson, 'entitled' for every later one (046:111's
-- behaviour, renamed).
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS, the backfill only touches
-- rows still at the column default that disagree with in_free_sample, the
-- CHECK is dropped and re-added, every function is CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. access_level ─────────────────────────────────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'entitled';

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_access_level_check;
ALTER TABLE lessons
  ADD CONSTRAINT lessons_access_level_check
  CHECK (access_level IN ('anyone', 'signed_in', 'entitled'));

UPDATE lessons SET access_level = 'anyone'
WHERE in_free_sample AND access_level = 'entitled';

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_in_free_sample_mirrors_access_level;
ALTER TABLE lessons
  ADD CONSTRAINT lessons_in_free_sample_mirrors_access_level
  CHECK (in_free_sample = (access_level = 'anyone'));

COMMENT ON COLUMN lessons.access_level IS
  'Who may open this lesson: anyone | signed_in | entitled. Not a schedule, not a general lock (docs/decisions/0094).';
COMMENT ON COLUMN lessons.in_free_sample IS
  'DEPRECATED: mirror of access_level = ''anyone'' (CHECK), kept until CNT-014 moves the readers; dropped after.';


-- ── 2. can_read_lesson ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION can_read_lesson(p_lesson_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT
       can_edit_course(l.course_id, (SELECT auth.uid()))
       OR (
         c.status = 'published'
         AND l.published_version_id IS NOT NULL
         AND l.archived_at IS NULL
         AND (
           l.access_level = 'anyone'
           OR (l.access_level = 'signed_in' AND (SELECT auth.uid()) IS NOT NULL)
         )
       )
       OR (
         l.published_version_id IS NOT NULL
         AND has_course_entitlement(l.course_id)
       )
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE l.id = p_lesson_id),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION can_read_lesson(UUID) TO anon, authenticated;


-- ── 4. course_lesson_states / lesson_state ──────────────────────────────
CREATE OR REPLACE FUNCTION course_lesson_states(p_course_id UUID)
RETURNS TABLE (lesson_id UUID, access_level TEXT, state TEXT, opens_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    l.id,
    l.access_level,
    CASE
      WHEN can_read_lesson(l.id) THEN 'open'
      WHEN l.access_level = 'signed_in' THEN 'needs_sign_in'
      ELSE 'needs_entitlement'
    END,
    NULL::TIMESTAMPTZ
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.course_id = p_course_id
    AND l.published_version_id IS NOT NULL
    AND (
      (l.archived_at IS NULL AND c.status = 'published')
      OR can_read_lesson(l.id)
    )
  ORDER BY l.ordinal, l.id;
$$;

REVOKE ALL ON FUNCTION course_lesson_states(UUID) FROM public;
GRANT EXECUTE ON FUNCTION course_lesson_states(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION lesson_state(p_lesson_id UUID)
RETURNS TABLE (lesson_id UUID, access_level TEXT, state TEXT, opens_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT s.lesson_id, s.access_level, s.state, s.opens_at
  FROM course_lesson_states((SELECT l.course_id FROM lessons l WHERE l.id = p_lesson_id)) s
  WHERE s.lesson_id = p_lesson_id;
$$;

REVOKE ALL ON FUNCTION lesson_state(UUID) FROM public;
GRANT EXECUTE ON FUNCTION lesson_state(UUID) TO anon, authenticated;


-- ── 5. lesson_teaser ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lesson_teaser(p_lesson_id UUID)
RETURNS TABLE (block_index INT, block JSONB)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH doc AS (
    SELECT v.document
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN lesson_versions v ON v.id = l.published_version_id
    WHERE l.id = p_lesson_id
      AND l.access_level = 'signed_in'
      AND l.archived_at IS NULL
      AND c.status = 'published'
      AND jsonb_typeof(v.document) = 'array'
  ),
  blocks AS (
    SELECT e.ord::INT AS ord, e.b
    FROM doc, jsonb_array_elements(doc.document) WITH ORDINALITY AS e(b, ord)
  ),
  cut AS (
    SELECT MIN(ord) AS first_interactive
    FROM blocks
    WHERE (b->>'kind') IS DISTINCT FROM 'theory'
       OR (b->>'type') = 'self_check'
  )
  SELECT blocks.ord, blocks.b
  FROM blocks, cut
  WHERE cut.first_interactive IS NOT NULL
    AND blocks.ord < cut.first_interactive
    AND (blocks.b->>'type') IN ('heading', 'prose', 'example', 'callout', 'list', 'image', 'video', 'table')
  ORDER BY blocks.ord;
$$;

REVOKE ALL ON FUNCTION lesson_teaser(UUID) FROM public;
GRANT EXECUTE ON FUNCTION lesson_teaser(UUID) TO anon, authenticated;


-- ── 6a. set_lesson_access_level ─────────────────────────────────────────
-- Same shape as set_lesson_free_sample (041:437): SECURITY DEFINER, gated on
-- can_edit_course, separate from save and publish (0018 Decision 4). The
-- course row is locked FOR UPDATE (create_lesson's precedent, 044) so two
-- concurrent demotions cannot each see the other's lesson as "still open"
-- and leave a published course with none.
CREATE OR REPLACE FUNCTION set_lesson_access_level(p_lesson_id UUID, p_level TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_course  UUID;
  v_status  TEXT;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('anyone', 'signed_in', 'entitled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_access_level');
  END IF;

  SELECT status INTO v_status FROM courses WHERE id = v_course FOR UPDATE;

  IF v_status = 'published'
     AND p_level <> 'anyone'
     AND NOT EXISTS (
       SELECT 1 FROM lessons
       WHERE course_id = v_course
         AND id <> p_lesson_id
         AND access_level = 'anyone'
         AND archived_at IS NULL
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE lessons
  SET access_level = p_level,
      in_free_sample = (p_level = 'anyone')
  WHERE id = p_lesson_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_access_level(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_access_level(UUID, TEXT) TO authenticated;


-- ── 6b. set_lesson_free_sample: wrapper until AUTH-009 deletes it ────────
CREATE OR REPLACE FUNCTION set_lesson_free_sample(p_lesson_id UUID, p_in_free_sample BOOLEAN)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT set_lesson_access_level(
    p_lesson_id,
    CASE WHEN p_in_free_sample THEN 'anyone' ELSE 'entitled' END
  );
$$;

REVOKE ALL ON FUNCTION set_lesson_free_sample(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_free_sample(UUID, BOOLEAN) TO authenticated;


-- ── 6c. create_lesson (re-emitted from 046:61) ──────────────────────────
-- Signature unchanged, so CREATE OR REPLACE alone is enough. Only the
-- INSERT and the returned object change: the first lesson is 'anyone',
-- every later one 'entitled'. The result keeps its in_free_sample key for
-- the current caller and adds access_level.
CREATE OR REPLACE FUNCTION create_lesson(
  p_course_id   UUID,
  p_title       TEXT,
  p_slug        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_ordinal   INT;
  v_is_first  BOOLEAN;
  v_level     TEXT;
  v_id        UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 1;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id FOR UPDATE) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;

  -- Format only — never trust a caller-supplied string, even though the app's
  -- only caller (the lessons API route) always runs this through
  -- lib/lessonSlug.ts's slugifyLessonTitle first, which already produces
  -- something matching this. Same pattern lessons_slug_check (043) enforces
  -- at the column level.
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;

  v_base_slug := p_slug;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM lessons WHERE course_id = p_course_id AND slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  SELECT COUNT(*) = 0, COALESCE(MAX(ordinal), 0) + 1
  INTO v_is_first, v_ordinal
  FROM lessons WHERE course_id = p_course_id;

  v_level := CASE WHEN v_is_first THEN 'anyone' ELSE 'entitled' END;

  INSERT INTO lessons (course_id, ordinal, title, description, access_level, in_free_sample, slug)
  VALUES (p_course_id, v_ordinal, p_title, p_description, v_level, v_is_first, v_slug)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'lesson_id', v_id, 'access_level', v_level,
    'in_free_sample', v_is_first, 'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── 6d. publish_course (re-emitted from 047:200) ────────────────────────
-- One added check, after the catalogue-field checks: at least one
-- non-archived 'anyone' lesson. Published-version state is NOT required:
-- the owner decided on 2026-09-22 (044 header) that publishing a course
-- with zero published lessons is allowed, and this check does not reverse
-- that (0099 Decision 3).
CREATE OR REPLACE FUNCTION publish_course(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_cover    TEXT;
  v_subtitle TEXT;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT cover_image_url, subtitle INTO v_cover, v_subtitle
  FROM courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF v_cover IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_cover');
  END IF;
  IF v_subtitle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_subtitle');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lessons
    WHERE course_id = p_course_id AND access_level = 'anyone' AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE courses SET status = 'published' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION publish_course(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION publish_course(UUID) TO authenticated;

COMMIT;
