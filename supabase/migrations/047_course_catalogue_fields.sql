-- ============================================================
-- 047_course_catalogue_fields.sql
--
-- CNT-009. The catalogue is course cards — cover, title, short summary
-- (owner, 2026-09-24, docs/handoff.md). Only `cover_image_url` is genuinely
-- new here.
--
-- ── The issue's premise was wrong, checked before writing this file ────────
-- CNT-009 (issue #93) states "neither field exists on courses today (confirmed
-- against migrations 041-045: only author_id, level and slug were added/kept;
-- description stays the long-form text on the course page)". Checked against
-- the LIVE table (service-role SELECT, not migration-reading alone) rather
-- than trusting that claim: `courses.subtitle` — added by 028, before the
-- Alliengll schema existed, and never dropped by 039/040/041 the way
-- subject/icon/color/pass_threshold/new_count/review_slots were left in place
-- but abandoned — is ALREADY the short-summary field. It is wired end-to-end:
-- `lib/lessons/courseFile.ts:42` (`subtitle: authoredString(1).optional()`),
-- written by `scripts/import-lesson.ts:282,296`, and populated for the one
-- real seeded course (`authored/courses/future-imperfect.json`: "Predictions
-- that came true, and ones that didn't. Present perfect vs past simple.").
-- Adding a second `summary` column would have duplicated a field the import
-- pipeline already fills. Decision: REUSE `subtitle`, add ONLY
-- `cover_image_url`. Full reasoning in docs/decisions/0050.
--
-- `courses.subtitle` was previously writable only by the offline
-- service-role importer — `update_course` (044) never exposed it. This
-- migration is what first lets an editor (not just the importer) set it,
-- via the extended `update_course` below.
--
-- ── Nullable, not NOT NULL (level's 042 precedent doesn't apply) ───────────
-- `courses` is NOT empty (2 seeded draft rows, checked live) and both new
-- writable slots (`cover_image_url`, `subtitle`) are already NULL on at
-- least one of them — a plain NOT NULL would fail immediately. Both stay
-- nullable in DRAFT; "required to publish" is enforced by
-- `courses_published_requires_catalogue_fields` below instead, which is the
-- correct translation of "NOT NULL at publish" for a field that's optional
-- until the author actually publishes, not "every row must always have one"
-- the way `level` is.
--
-- ── Length cap ───────────────────────────────────────────────────────────
-- `authoredString()` (lib/authoredString.ts) imposes no max length on
-- `subtitle` at the course-file-validation layer — this migration adds the
-- first one. 200 chars: long enough for a one-line catalogue-card subtitle
-- (the seeded example is 89 chars), short enough that a catalogue card
-- can't be handed a paragraph. `lib/courseCatalogue.ts`'s
-- `COURSE_SUBTITLE_MAX_LENGTH` mirrors this — keep the two in step, same
-- as `lib/courseLevels.ts`'s relationship to `courses_level_check` (042).
--
-- ── Enforcement lives in two places on purpose ──────────────────────────
-- `courses_published_requires_catalogue_fields` (a CHECK) is the backstop
-- that holds regardless of which code path flips `status` — the
-- SECURITY DEFINER RPCs below, a future admin script, anything. But a raw
-- CHECK violation surfaces as an unhandled Postgres exception, not this
-- schema's usual `{ok:false, error:'...'}` JSON contract
-- (lib/courseAuthoringErrors.ts). So `publish_course` AND `update_course`
-- (the only two paths that can make the CHECK's condition true or false)
-- both pre-check and return a clean error before ever reaching the UPDATE
-- that could trip it — the CHECK never actually fires in normal operation,
-- it exists for the path that skips the RPCs.
--
-- ── Bucket: reuse lesson-images, no new bucket ──────────────────────────
-- A cover is course-owned, exactly like a lesson image (041's own
-- reasoning for that bucket's write policy: "a lesson image belongs to the
-- course, not the uploader" — equally true of a cover). The existing
-- policies already gate writes on `can_edit_course((storage.foldername(name))[1]::uuid, ...)`
-- with no restriction on what the object actually depicts, so no bucket or
-- policy change is needed — `lib/lessonImages.ts`'s naming
-- (`lessonImageObjectPath`) is generic enough to cover a cover upload too,
-- left to AUTH-008 (the editor UI) to actually call.
--
-- ── Stored shape: full public URL, not a bucket-relative path ───────────
-- Matches the only precedent that exists — `profiles.avatar_url` (022) and
-- both authored image-reference shapes lesson documents already use
-- (`lib/lessons/theoryBlocks.ts`'s `ImageBlockSchema.url`,
-- `lib/items/matching.ts`'s image `src`, both confirmed full public URLs by
-- `scripts/sweep-lesson-images.ts`'s own doc comment). There is no
-- "store a bare path" convention anywhere in this codebase to follow instead.
--
-- ── AUTH-006's orphan sweep ──────────────────────────────────────────────
-- `scripts/sweep-lesson-images.ts` only scanned `lesson_versions.document`
-- for referenced paths — a cover living in the same bucket would be
-- reported as an orphan the first time this sweep runs. Updated in this
-- same commit (small; one query, one loop) to also treat every course's
-- `cover_image_url` as referenced.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Wrapped in one explicit transaction. ADD COLUMN IF NOT EXISTS and the
-- pg_constraint-guarded CHECK adds are idempotent (025 precedent, reused by
-- 042 and here); DROP FUNCTION + CREATE OR REPLACE for update_course
-- (045/046 precedent: the argument list changes, and CREATE OR REPLACE
-- alone would add a second overload rather than replacing the four-arg
-- version) is safe to re-run — DROP FUNCTION IF EXISTS is a no-op once the
-- old signature is gone.
-- ============================================================

BEGIN;

-- ── courses.cover_image_url ──────────────────────────────────────────────
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- ── courses.subtitle: length cap (new; the column itself already existed) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_subtitle_length_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_subtitle_length_check
      CHECK (subtitle IS NULL OR char_length(subtitle) <= 200);
  END IF;
END $$;

-- ── Required at publish: DB-level backstop ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_published_requires_catalogue_fields'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_published_requires_catalogue_fields
      CHECK (status <> 'published' OR (cover_image_url IS NOT NULL AND subtitle IS NOT NULL));
  END IF;
END $$;


-- ── update_course: gains p_subtitle and p_cover_image_url ────────────────
-- Full-record replace, same contract title/description/level already have
-- (the one caller, app/api/admin/courses/[id]/route.ts, always resends the
-- caller's complete desired state — this is not a partial-patch RPC).
-- Explicitly clearing subtitle or cover_image_url on an already-published
-- course is caught here with the same clean error codes publish_course
-- uses below, so the CHECK constraint above is never what the caller
-- actually sees.
DROP FUNCTION IF EXISTS update_course(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION update_course(
  p_course_id       UUID,
  p_title           TEXT,
  p_description     TEXT,
  p_level           TEXT,
  p_subtitle        TEXT,
  p_cover_image_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_status TEXT;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_level');
  END IF;
  IF p_subtitle IS NOT NULL AND char_length(p_subtitle) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subtitle_too_long');
  END IF;

  SELECT status INTO v_status FROM courses WHERE id = p_course_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF v_status = 'published' AND p_cover_image_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_cover');
  END IF;
  IF v_status = 'published' AND p_subtitle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_subtitle');
  END IF;

  UPDATE courses
  SET title = p_title,
      description = p_description,
      level = p_level,
      subtitle = p_subtitle,
      cover_image_url = p_cover_image_url
  WHERE id = p_course_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_course(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_course(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── publish_course: refuses without a cover and a subtitle ──────────────
-- Signature unchanged ((UUID)), so CREATE OR REPLACE alone is enough — no
-- second overload risk (045's rule only bites when the argument LIST
-- changes).
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

  UPDATE courses SET status = 'published' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION publish_course(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION publish_course(UUID) TO authenticated;

COMMIT;
