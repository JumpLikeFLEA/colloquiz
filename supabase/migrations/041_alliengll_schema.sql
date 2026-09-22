-- ============================================================
-- 041_alliengll_schema.sql
--
-- CNT-002. Implements docs/decisions/0018-alliengll-content-model.md
-- Decisions 2, 4 and 6 as one migration: reshape `courses`, create
-- `lessons`, `lesson_versions` and `course_entitlements`, write
-- `can_read_lesson`, the RLS, the save/publish/free-sample RPCs, and the
-- lesson-image bucket. Runs after 039 (CNT-001, drops the Colloquiz course
-- feature) and 040 (deletes the two retired `courses`/`course_editors`
-- rows), so `courses` and `course_editors` are empty when this file runs —
-- confirmed by replaying 001-040 against a local Supabase (`supabase start`
-- + `db reset`) before writing this file's DDL against that empty state.
--
-- `courses`, `course_editors`, `can_edit_course()`, `grant_course_editor()`
-- and `revoke_course_editor()` (028/029/035) survive this migration
-- unchanged except where noted below (0018 Decision 1: "kept").
--
-- ── Scope boundary with CNT-003 (the lesson document validator) ────────────
-- `lesson_versions.document` is opaque JSONB here beyond "is it a JSON
-- array" — the exact block shape (theory vs. practice, item type
-- discriminators) is CNT-003's decision, not yet made, and this migration
-- must not guess at it. Two consequences, both decisions made unattended
-- during this card and recorded in docs/decisions/0019-cnt002-schema.md:
--   1. `publish_lesson` takes the practice-item count as a parameter
--      (`p_item_count`) rather than deriving it by introspecting the
--      document. The caller (a future server route, once CNT-003 exists)
--      validates the document with the CNT-003 validator and passes the
--      count it already computed — the same "API route validates, RPC does
--      a structural backstop only" split 029 uses for stage theory.
--   2. `save_lesson_version`'s structural check is limited to
--      `jsonb_typeof(document) = 'array'`. Per-block validation is CNT-003's
--      job; 0018 Decision 2 accepts the residual risk of a direct RPC caller
--      storing a structurally-valid-but-block-invalid draft.
--
-- ── Draft-lesson visibility (a non-obvious read of 0018) ────────────────────
-- 0018 does not say in so many words whether an unpublished LESSON's
-- metadata (title/description/item count) is visible to a non-editor when
-- its COURSE is published. The handoff's "title, description and item count
-- are visible for every lesson, including paid ones" is written in the
-- free-vs-paid contrast, not the draft-vs-published one — Decision 4
-- ("a lesson is playable when it has a published_version_id") is the
-- governing clause here, and by the same logic that hides a draft COURSE
-- from non-editors (the pre-existing "courses: published read" policy,
-- gated on courses.status), a draft LESSON must stay invisible to
-- non-editors too: otherwise an author could not stage new lesson content
-- inside an already-published course without it leaking early. The
-- "lessons: published read" policy below therefore ANDs
-- `published_version_id IS NOT NULL` with the course being published, and
-- this is one of the twelve cells the full verification protocol below
-- checks explicitly (published course x unpublished lesson x each of the
-- four roles) rather than leaving it inferred.
--
-- ── Storage bucket ───────────────────────────────────────────────────────
-- "lesson-images", public (free-sample images must load for anonymous
-- visitors — same accepted trade as 0018's "guessable-once-seen" note).
-- Limits (5 MB, PNG/JPEG/WebP) live in lib/lessonImages.ts AND on the bucket
-- (avatars precedent, 022). Writes are scoped to course editors via
-- can_edit_course on the path's course_id folder segment, not to an owning
-- user — a lesson image belongs to the course, not the uploader.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Wrapped in one explicit transaction: table creation, an FK added after
-- the fact (lessons.published_version_id -> lesson_versions, added because
-- the two tables reference each other), RLS and RPCs all land together or
-- not at all.
--
-- NOT safe to blindly re-apply: CREATE TABLE / DROP COLUMN / ADD COLUMN use
-- IF [NOT] EXISTS and every function/policy is CREATE OR REPLACE / DROP ...
-- IF EXISTS, so a second run is a no-op — but the bucket INSERT uses
-- ON CONFLICT DO UPDATE (idempotent) and there is no data migration here to
-- re-run against.
-- ============================================================

BEGIN;

-- ── 1. Reshape `courses` (0018 Decision 1) ──────────────────────────────────
-- `access` is dropped: a course whose every lesson is in_free_sample is
-- free, so a second flag would be a second place that can disagree (0018
-- Decision 6). Confirmed no app code references courses.access (CNT-001
-- removed every course route; `rg` over app/, lib/, scripts/ for
-- "courses" returns nothing at all as of this commit).
--
-- author_id is added NULLABLE, not NOT NULL: no course-creation RPC exists
-- yet (that is CNT-004's importer or a future authoring UI), so there is no
-- write path in this migration that could prove a NOT NULL constraint is
-- satisfiable. Tightening it to NOT NULL is that future card's job once a
-- writer exists to always supply it. No ON DELETE action, matching the
-- granted_by / updated_by / edited_by convention already used throughout
-- this schema for "informational owner" columns (029, 032).
ALTER TABLE courses DROP COLUMN IF EXISTS access;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id);

-- 0018 Decision 6: "Published course and lesson metadata is readable by
-- anon and authenticated." 028 granted SELECT on courses to authenticated
-- only (anonymous play did not exist yet). Anon needs it now for the
-- free-sample read path. Grants are additive; the existing "courses:
-- published read" / "courses: editor read" policies (028/035) are
-- untouched — they already read entirely off courses.status /
-- can_edit_course, neither of which this migration alters.
GRANT SELECT ON TABLE courses TO anon;


-- ── 2. `lessons` (0018 Decision 2) ──────────────────────────────────────────
-- published_version_id has no FK yet — lesson_versions doesn't exist until
-- step 3. Added as a constraint in step 4, after both tables exist.
-- ordinal is display order only, never read by entitlement (0018): no
-- uniqueness on (course_id, ordinal), matching course_stages' (course_id,
-- position) precedent (028) — reordering must not require a temporary swap.
CREATE TABLE IF NOT EXISTS lessons (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  ordinal               INT         NOT NULL DEFAULT 0,
  title                 TEXT        NOT NULL,
  description           TEXT,
  in_free_sample        BOOLEAN     NOT NULL DEFAULT FALSE,
  published_version_id  UUID,
  published_item_count  INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lessons_course_ordinal_idx ON lessons (course_id, ordinal);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lessons FROM anon, authenticated;
GRANT SELECT ON TABLE lessons TO anon, authenticated;


-- ── 3. `lesson_versions` (0018 Decision 2) ──────────────────────────────────
-- Append-only: no UPDATE/DELETE grant to any app role, ever — this is what
-- gives practice blocks the revert history Calculus exercises lacked, and
-- what makes "the latest row is the draft, its id is the concurrency token"
-- (0018) a safe claim to build save_lesson_version's locking on.
CREATE TABLE IF NOT EXISTS lesson_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID        NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  document    JSONB       NOT NULL,
  source      TEXT        NOT NULL CHECK (source IN ('import', 'editor')),
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_versions_lesson_idx ON lesson_versions (lesson_id, created_at DESC);

ALTER TABLE lesson_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lesson_versions FROM anon, authenticated;
GRANT SELECT ON TABLE lesson_versions TO anon, authenticated;


-- ── 4. Close the lessons <-> lesson_versions cycle ──────────────────────────
-- ON DELETE SET NULL is belt-and-braces only: lesson_versions rows are never
-- deleted by any grant or RPC in this migration (see step 3), so this
-- should never actually fire.
ALTER TABLE lessons
  ADD CONSTRAINT lessons_published_version_id_fkey
  FOREIGN KEY (published_version_id) REFERENCES lesson_versions(id) ON DELETE SET NULL;


-- ── 5. `course_entitlements` (0018 Decision 6) ──────────────────────────────
-- Stays empty until M3 (the merchant-of-record webhook, service role, is its
-- only writer). No grant allows any app role to INSERT/UPDATE/DELETE it —
-- the service role bypasses grants entirely, so none is needed for M3's
-- webhook either. No expiry column, no app delete path: purchasers keep
-- access indefinitely (handoff). source is constrained to the two ways a
-- row can be created without self-enrollment ever existing for paid
-- content: an actual purchase, or an admin grant (comped access).
CREATE TABLE IF NOT EXISTS course_entitlements (
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id   UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source      TEXT        NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase', 'grant')),
  source_ref  TEXT,
  PRIMARY KEY (user_id, course_id)
);

ALTER TABLE course_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_entitlements FROM anon, authenticated;
GRANT SELECT ON TABLE course_entitlements TO authenticated;

DROP POLICY IF EXISTS "course_entitlements: owner read" ON course_entitlements;
CREATE POLICY "course_entitlements: owner read"
  ON course_entitlements FOR SELECT
  USING (user_id = (SELECT auth.uid()));


-- ── 6. can_read_lesson (0018 Decision 6) ────────────────────────────────────
-- LANGUAGE sql (not plpgsql) so its body is dependency-tracked, matching the
-- my_enrolled_stage_ids / is_enrolled house style (028) — Postgres parses a
-- SQL function's body at CREATE time and refuses to drop anything it reads
-- without CASCADE, which is the safety property that made 039's own
-- migration ordering tractable. auth.uid() is NULL for anonymous visitors,
-- so the entitlement EXISTS check and the editor check both fail closed for
-- them, leaving exactly the free-sample clause — no anon-specific branch is
-- needed (0018: "M2 therefore needs no change to this function").
-- COALESCE guards a lesson id that doesn't exist (bare SELECT returns no
-- row, not FALSE) so the contract is genuinely BOOLEAN, never NULL.
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
         AND (
           l.in_free_sample
           OR EXISTS (
             SELECT 1 FROM course_entitlements ce
             WHERE ce.user_id = (SELECT auth.uid()) AND ce.course_id = l.course_id
           )
         )
       )
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE l.id = p_lesson_id),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION can_read_lesson(UUID) TO anon, authenticated;


-- ── 7. RLS: lessons ──────────────────────────────────────────────────────
-- Two permissive policies, OR'd (same idiom as courses' published/editor
-- pair, 028/035). See the file header for why "published read" also
-- requires published_version_id IS NOT NULL, not just the course's status.
DROP POLICY IF EXISTS "lessons: published read" ON lessons;
CREATE POLICY "lessons: published read"
  ON lessons FOR SELECT
  USING (
    published_version_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND c.status = 'published')
  );

DROP POLICY IF EXISTS "lessons: editor read" ON lessons;
CREATE POLICY "lessons: editor read"
  ON lessons FOR SELECT
  USING (can_edit_course(lessons.course_id, (SELECT auth.uid())));


-- ── 8. RLS: lesson_versions ──────────────────────────────────────────────
-- can_read_lesson is the ONLY thing the non-editor policy calls (CNT-002
-- acceptance). It is not sufficient on its own, though: can_read_lesson
-- answers "may this person read the lesson at all", not "is this
-- particular version row the published one" — an entitled buyer must not
-- see a superseded or not-yet-published draft. The `id = published_version_id`
-- clause carries that half. Editors get a second, separate policy straight
-- off can_edit_course so they can read every version (draft history,
-- concurrency-token lookups) regardless of publish state.
DROP POLICY IF EXISTS "lesson_versions: published content read" ON lesson_versions;
CREATE POLICY "lesson_versions: published content read"
  ON lesson_versions FOR SELECT
  USING (
    id = (SELECT l.published_version_id FROM lessons l WHERE l.id = lesson_versions.lesson_id)
    AND can_read_lesson(lesson_versions.lesson_id)
  );

DROP POLICY IF EXISTS "lesson_versions: editor read" ON lesson_versions;
CREATE POLICY "lesson_versions: editor read"
  ON lesson_versions FOR SELECT
  USING (can_edit_course(
    (SELECT l.course_id FROM lessons l WHERE l.id = lesson_versions.lesson_id),
    (SELECT auth.uid())
  ));


-- ── 9. create_lesson ─────────────────────────────────────────────────────
-- Not itself named in the CNT-002 acceptance list, but required machinery
-- for the line it exists to satisfy: "creating a course's first lesson writes
-- in_free_sample = true, every later lesson defaults false, nothing derives
-- it from ordinal" — lessons has no direct INSERT grant (house style: writes
-- go through SECURITY DEFINER RPCs), so something has to decide "is this
-- the first lesson" AT INSERT TIME and freeze it into the row, which is
-- exactly 0018's "written as data at creation time, not derived from
-- ordinal at read time." Locks the owning course row FOR UPDATE first so
-- two concurrent creates for the same course can't both observe zero
-- existing lessons and both claim in_free_sample = true.
CREATE OR REPLACE FUNCTION create_lesson(p_course_id UUID, p_title TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_ordinal  INT;
  v_is_first BOOLEAN;
  v_id       UUID;
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

  SELECT COUNT(*) = 0, COALESCE(MAX(ordinal), 0) + 1
  INTO v_is_first, v_ordinal
  FROM lessons WHERE course_id = p_course_id;

  INSERT INTO lessons (course_id, ordinal, title, description, in_free_sample)
  VALUES (p_course_id, v_ordinal, p_title, p_description, v_is_first)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'lesson_id', v_id, 'in_free_sample', v_is_first);
END;
$$;

REVOKE ALL ON FUNCTION create_lesson(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lesson(UUID, TEXT, TEXT) TO authenticated;


-- ── 10. save_lesson_version ──────────────────────────────────────────────
-- Optimistic concurrency: the caller sends the id of the version it loaded
-- (or NULL for a fresh lesson with no draft yet); a mismatch against the
-- true latest is 'stale' — no clobber, same contract as 029's
-- save_stage_theory. The lessons row is locked FOR UPDATE for the duration
-- of the read-compare-insert sequence, so two concurrent saves against the
-- same lesson can't both pass the staleness check against the same base
-- version (this is also why lesson_versions needs no separate ordinal/
-- version column to break ties — the lock makes ties impossible).
CREATE OR REPLACE FUNCTION save_lesson_version(
  p_lesson_id        UUID,
  p_document         JSONB,
  p_base_version_id  UUID
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
  v_new_id     UUID;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Structural backstop only — see the file header. Per-block validation is
  -- CNT-003's job, run in the API route before this RPC is ever called.
  IF jsonb_typeof(p_document) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_document');
  END IF;

  SELECT id INTO v_latest_id FROM lesson_versions
  WHERE lesson_id = p_lesson_id
  ORDER BY created_at DESC LIMIT 1;

  IF p_base_version_id IS DISTINCT FROM v_latest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale');
  END IF;

  INSERT INTO lesson_versions (lesson_id, document, source, created_by)
  VALUES (p_lesson_id, p_document, 'editor', v_me)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'version_id', v_new_id);
END;
$$;

REVOKE ALL ON FUNCTION save_lesson_version(UUID, JSONB, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION save_lesson_version(UUID, JSONB, UUID) TO authenticated;


-- ── 11. publish_lesson ───────────────────────────────────────────────────
-- Sets published_version_id and published_item_count in the SAME statement
-- (CNT-002 acceptance: "together") — there is no window where one is
-- updated and not the other, so a concurrent reader never sees a lesson
-- whose item count doesn't match its just-published content. p_item_count
-- is supplied by the caller rather than derived from the document — see the
-- file header's scope-boundary note. Publishes the current latest draft
-- (there is no "publish an older version" path; 0018 Decision 4 describes
-- publish as always moving forward from the latest save).
CREATE OR REPLACE FUNCTION publish_lesson(p_lesson_id UUID, p_item_count INT)
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

  UPDATE lessons
  SET published_version_id = v_latest_id,
      published_item_count = p_item_count
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'version_id', v_latest_id, 'item_count', p_item_count);
END;
$$;

REVOKE ALL ON FUNCTION publish_lesson(UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION publish_lesson(UUID, INT) TO authenticated;


-- ── 12. set_lesson_free_sample ───────────────────────────────────────────
-- Deliberately separate from both save and publish (CNT-002 acceptance:
-- "neither save nor publish touches in_free_sample") — 0018 Decision 4:
-- author intent is frozen into data via an explicit action, never a side
-- effect of saving or publishing content.
CREATE OR REPLACE FUNCTION set_lesson_free_sample(p_lesson_id UUID, p_in_free_sample BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_course  UUID;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE lessons SET in_free_sample = p_in_free_sample WHERE id = p_lesson_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_free_sample(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_free_sample(UUID, BOOLEAN) TO authenticated;


-- ── 13. Lesson-image storage bucket ──────────────────────────────────────
-- Public (free-sample images must load for anonymous visitors). 5 MB,
-- raster types only — kept in sync with lib/lessonImages.ts, which states
-- the same limits in the UI before the picker opens (avatars precedent,
-- 022). Object naming is "<course_id>/<uuid>.<ext>": the FIRST path segment
-- is the owning COURSE (not the uploader), because a lesson image belongs
-- to the course and any of its editors may replace it, not just whoever
-- uploaded it first.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-images',
  'lesson-images',
  TRUE,
  5242880,                                               -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "lesson_images: public read" ON storage.objects;
CREATE POLICY "lesson_images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-images');

-- storage.foldername(name))[1] is the course_id segment; can_edit_course
-- guards writes exactly like every other authoring path in this file. A
-- non-UUID folder segment makes the ::uuid cast raise, which Postgres
-- surfaces as a failed WITH CHECK / USING (i.e. permission denied), not a
-- crash — safe by construction, no separate format check needed.
DROP POLICY IF EXISTS "lesson_images: editor insert" ON storage.objects;
CREATE POLICY "lesson_images: editor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-images'
    AND can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "lesson_images: editor update" ON storage.objects;
CREATE POLICY "lesson_images: editor update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lesson-images'
    AND can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "lesson_images: editor delete" ON storage.objects;
CREATE POLICY "lesson_images: editor delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lesson-images'
    AND can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
  );

COMMIT;
