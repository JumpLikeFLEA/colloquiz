-- ============================================================
-- 043_lesson_slug.sql
--
-- CNT-004. Adds `lessons.slug`, the natural re-import key the lesson
-- importer matches on — see docs/decisions/0023-lesson-import-keys.md for
-- why this replaces the `authored_key` convention 0018 named but never
-- actually specified a column for.
--
-- `courses.slug` already exists (migration 028) and is already the
-- importer's course-matching key; this file only adds the lesson-level
-- counterpart.
--
-- NOT NULL with no DEFAULT, safe because `lessons` is confirmed EMPTY on
-- the hosted project: `SELECT count(*) FROM lessons` via the service-role
-- client printed 0 immediately before this file was written (2026-09-22) —
-- CNT-002/041 shipped no lesson-creation UI, and CNT-004 (this card) is the
-- first writer, so there is no existing row a NOT NULL column could
-- conflict with. If a future re-run of this migration from scratch ever
-- finds `lessons` non-empty, STOP: a writer has shipped since this
-- assumption was checked, and it needs re-verifying before ADD COLUMN
-- ... NOT NULL is safe to keep as-is (042's `courses.level` header carries
-- the same warning for the same reason).
--
-- Slug is IMMUTABLE once created: no RPC, policy, or code path in this
-- migration or the importer ever updates an existing row's slug, and it
-- must stay that way — the importer's whole idempotency story (matching an
-- existing lesson by (course slug, lesson slug) on re-import) breaks if a
-- slug can silently change under it. It also doubles as M2's lesson URL
-- segment, which is a second, independent reason it must not move once a
-- link exists.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Wrapped in one explicit transaction, consistent with 041/042.
--
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS is idempotent, the CHECK
-- constraint is added inside a DO block guarded by a pg_constraint lookup
-- (025/042 precedent), and the unique index uses IF NOT EXISTS.
-- ============================================================

BEGIN;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL;

-- Lowercase kebab-case only — matches the shape `courses.slug` values
-- already take in practice (028) and the shape a URL segment needs, so no
-- separate "is this URL-safe" check is needed anywhere downstream.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_slug_check'
  ) THEN
    ALTER TABLE lessons
      ADD CONSTRAINT lessons_slug_check
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;
END $$;

-- Unique per course, not globally: two different courses may each have a
-- lesson slugged "intro" (mirrors lessons.ordinal, which is also
-- course-scoped, not global).
CREATE UNIQUE INDEX IF NOT EXISTS lessons_course_slug_idx ON lessons (course_id, slug);

COMMIT;
