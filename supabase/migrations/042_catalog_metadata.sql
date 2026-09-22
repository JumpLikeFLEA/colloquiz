-- ============================================================
-- 042_catalog_metadata.sql
--
-- CNT-008. Implements docs/decisions/0022-alliengll-first-course-structure.md
-- Decision 5: `courses.level` (CEFR, required — "the audience is segmented
-- by level") and `lessons.estimated_minutes` (author-declared, never
-- derived from content — the same reasoning `published_item_count`
-- already uses, migration 041).
--
-- Metadata only, per CNT-008's acceptance list ("no entitlement matrix is
-- needed"): no new RLS policy, no new grant, no new RPC. `courses` and
-- `lessons` already grant SELECT to anon and authenticated (migration 041,
-- steps 1 and 2) and are already gated by the existing "published read" /
-- "editor read" policy pairs, which operate at ROW granularity — a new
-- column on an already-readable row is readable by the same principals with
-- no policy change. Writes to both columns go through a future authoring
-- RPC (AUTH-001/AUTH-002's course-creation and lesson-metadata forms, not
-- yet built), matching 041's "writes go through SECURITY DEFINER RPCs"
-- house style — this migration adds no writer.
--
-- `courses.level` lands NOT NULL with no DEFAULT. This is only possible
-- because `courses` is confirmed empty: 040 deleted the two retired rows
-- CNT-002/041 inherited, and no course-creation RPC has been written since
-- (041's `author_id` was added NULLABLE for exactly this reason — no writer
-- yet proves a NOT NULL constraint satisfiable). Re-verified empty
-- immediately before writing this file (see the local-replay log below);
-- if a future session ever finds `courses` non-empty when re-running this
-- migration from scratch, STOP — that means a writer has shipped between
-- 041 and this file, and the empty-table assumption needs re-checking
-- before ADD COLUMN ... NOT NULL is safe to keep as-is.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Wrapped in one explicit transaction, consistent with 041.
--
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS is idempotent, and each CHECK
-- constraint is added inside a DO block guarded by a pg_constraint lookup
-- (025's `profiles_theme_preference_check` precedent) so a second run adds
-- neither column nor constraint twice.
-- ============================================================

BEGIN;

-- ── courses.level ────────────────────────────────────────────────────────
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_level_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_level_check
      CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
  END IF;
END $$;

-- ── lessons.estimated_minutes ────────────────────────────────────────────
-- Nullable: a draft lesson may not have this filled in yet by the author;
-- unlike courses.level there is no "every row must always have one" claim
-- in 0022 Decision 5 for this column.
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS estimated_minutes INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_estimated_minutes_check'
  ) THEN
    ALTER TABLE lessons
      ADD CONSTRAINT lessons_estimated_minutes_check
      CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);
  END IF;
END $$;

COMMIT;
