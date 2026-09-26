-- ============================================================
-- 046_lesson_slug_transliteration.sql
--
-- CNT-010. Two problems found while working SHELL-005 and recorded in
-- docs/decisions/0044's addendum (2026-09-26):
--
-- 1. create_lesson's slug step (migration 044, line 229) is ASCII-only
--    (lower(regexp_replace(btrim(p_title), '[^a-zA-Z0-9]+', '-', 'g'))), so
--    a Cyrillic-only title — the norm for this audience, not the exception
--    (docs/handoff.md) — collapses to the empty-title fallback "lesson",
--    deduped only by creation order into lesson/lesson-2/lesson-3/…. Fix:
--    the RPC no longer slugifies p_title itself. The slug is now computed
--    by lib/lessonSlug.ts (which transliterates Cyrillic before ASCII-
--    folding) and passed in as p_slug; this function validates its format
--    and still suffixes on collision, exactly as before, against the
--    caller's base instead of one it derived.
--
-- 2. EditLessonDialog lets a lesson's title be renamed with the slug frozen
--    underneath (0023) and never shown, so a placeholder working title's
--    slug can silently outlive the real one. Fix: the slug stays editable
--    (new update_lesson_slug RPC) until the lesson has EVER been published
--    — tracked by a new slug_frozen_at column, set once by publish_lesson
--    and never cleared by anything (not set_lesson_archived, not any future
--    unpublish path — checked: no RPC in 041/044/045 clears
--    published_version_id either, so there is no existing "unpublish"
--    behaviour this column could accidentally race today; it exists so one
--    can be added later without silently unfreezing every previously-
--    published lesson's slug).
--
-- No re-slug migration for existing rows: audited against the hosted
-- database immediately before this file was written (2026-09-26, service-
-- role client, printed output) — 10 lesson rows across 2 courses, every
-- title plain ASCII, none published. The new transliteration step changes
-- nothing for an ASCII title, so there is nothing for a re-slug migration to
-- change; a lesson added after this migration lands gets the new slugging
-- automatically via create_lesson, and today's 10 unpublished rows can still
-- have their slug corrected through update_lesson_slug (below) if any of
-- them ever needed it, since none are frozen.
--
-- courses.slug has no equivalent bug: create_course takes p_slug as raw
-- author-typed text (CoursesListView.tsx's manual "slug-like-this" field) —
-- it has no slugify step to have this bug in. Confirmed against the 2 real
-- course rows (auth003-smoke-test, future-imperfect), both author-typed
-- ASCII. Left unchanged.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
-- ============================================================

BEGIN;

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS slug_frozen_at TIMESTAMPTZ;

-- ── create_lesson: slug supplied by the caller, not derived here ───────────
-- DROP FUNCTION first (045's own precedent): the argument LIST changes (three
-- params -> four), and CREATE OR REPLACE does not replace a function with a
-- different signature — it would add a second overload, leaving the old
-- ASCII-only 3-arg version callable indefinitely by a stale client.
DROP FUNCTION IF EXISTS create_lesson(UUID, TEXT, TEXT);

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

  INSERT INTO lessons (course_id, ordinal, title, description, in_free_sample, slug)
  VALUES (p_course_id, v_ordinal, p_title, p_description, v_is_first, v_slug)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'lesson_id', v_id, 'in_free_sample', v_is_first, 'slug', v_slug);
END;
$$;

REVOKE ALL ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ── update_lesson_slug: explicit action, separate from update_lesson ───────
-- Same "explicit action, not a side effect" pattern this file already uses
-- for in_free_sample/archived_at — slug is deliberately NOT a parameter of
-- update_lesson (044's comment there still holds: "immutable once created,
-- no RPC path may change it" now means "no RPC path may change it AFTER
-- slug_frozen_at is set", not "ever").
--
-- Refuses outright on a collision (slug_taken) rather than silently
-- suffixing the way create_lesson does — an author who typed a specific
-- slug should be told it's taken, not silently handed a different one.
--
-- Locks the lessons row FOR UPDATE before reading slug_frozen_at, the same
-- guard publish_lesson takes on its own row (045), so an edit can't
-- interleave with a concurrent first publish: either this transaction's
-- lock wins and publish_lesson blocks until it commits (seeing the new slug,
-- then freezing it), or publish_lesson's lock wins and this transaction
-- blocks until it commits (then sees slug_frozen_at already set and
-- refuses) — never a lost update.
CREATE OR REPLACE FUNCTION update_lesson_slug(p_lesson_id UUID, p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_frozen_at TIMESTAMPTZ;
BEGIN
  SELECT course_id, slug_frozen_at INTO v_course, v_frozen_at
  FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_frozen');
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF EXISTS (
    SELECT 1 FROM lessons WHERE course_id = v_course AND slug = p_slug AND id <> p_lesson_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_slug_taken');
  END IF;

  UPDATE lessons SET slug = p_slug WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'slug', p_slug);
END;
$$;

REVOKE ALL ON FUNCTION update_lesson_slug(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_lesson_slug(UUID, TEXT) TO authenticated;

-- ── publish_lesson: freeze the slug on first publish only ──────────────────
-- Signature unchanged (three args, same as 045) — CREATE OR REPLACE is
-- sufficient, no DROP needed. COALESCE means a re-publish (a newer draft
-- published over an already-published lesson) leaves slug_frozen_at exactly
-- as it was set the first time, never refreshed to "now".
CREATE OR REPLACE FUNCTION publish_lesson(
  p_lesson_id            UUID,
  p_expected_version_id  UUID,
  p_item_count           INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_latest_id  UUID;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_item_count IS NULL OR p_item_count < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_item_count');
  END IF;

  SELECT id INTO v_latest_id FROM lesson_versions
  WHERE lesson_id = p_lesson_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_latest_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_draft');
  END IF;

  IF p_expected_version_id IS DISTINCT FROM v_latest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale');
  END IF;

  UPDATE lessons
  SET published_version_id = p_expected_version_id,
      published_item_count = p_item_count,
      slug_frozen_at = COALESCE(slug_frozen_at, now())
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_expected_version_id, 'item_count', p_item_count);
END;
$$;

COMMIT;
