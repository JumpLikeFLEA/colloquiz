-- ============================================================
-- 039_retire_courses.sql
--
-- Retires the Colloquiz course feature (Calculus I, human-behavioral-biology)
-- per docs/decisions/0018-alliengll-content-model.md Decision 1. Both courses
-- and every row built around them are deleted; the tables/RPCs/columns that
-- fit the new Alliengll lesson-document model are dropped so CNT-002 (040)
-- can create their replacements clean. `courses`, `course_editors`,
-- `can_edit_course()` and the editor-grant RPCs survive unchanged — they are
-- reshaped, not dropped, by 040.
--
-- Pre-migration audit (scripts/_tmp_audit_course_retire.ts against the live
-- database, printed output, 2026-09-21):
--   courses: calculus-i (published), human-behavioral-biology (draft)
--   questions.course_stage_id IS NOT NULL: 158 total
--     visibility='course': 95   (the "95 course questions" 0018 refers to)
--     visibility='shared': 63   (promoted/spillover siblings — see below)
--   quizzes.question_ids referencing a visibility='course' question: 0
--   quizzes.question_ids referencing ANY course-linked question: 5 quizzes,
--     all 5 referencing only the 63 promoted visibility='shared' rows
--   results rows on those 5 quizzes: 3
--   course_editors: 2, course_stage_theory: 8, course_stage_theory_versions: 23,
--   course_stage_exercises: 1, course_enrollments: 2, course_stage_progress: 0,
--   course_check_attempts: 0, course_variant_seen: 1
--
-- Consequence: the 95 visibility='course' rows are deleted outright (never
-- referenced by any quiz — course practice/checks mint no quizzes row, see
-- 028's design notes). The 63 promoted visibility='shared' rows are NOT
-- deleted — 5 live quizzes and 3 results rows depend on them staying in
-- History (get_quiz_history derives a result's subject from
-- quizzes.question_ids[1] -> questions.subject; deleting a referenced
-- question would also be refused outright by the questions_block_referenced_
-- delete trigger from 028, which this migration keeps). They are unlinked
-- from the course by nulling their course columns before those columns are
-- dropped, and otherwise left exactly as they are: ordinary
-- visibility='shared' questions, indistinguishable from any other.
--
-- Kept, unaltered by this migration (reshaped by 040 instead):
--   courses, course_editors, can_edit_course(), grant_course_editor(),
--   revoke_course_editor(), questions.updated_by (032's generic "edited
--   in-app" marker — not course-specific, has no course dependency),
--   the questions_block_referenced_delete trigger (028 — generically useful
--   now that it exists; guards quizzes.question_ids regardless of course).
--
-- Dropped:
--   course_stages, course_stage_theory, course_stage_theory_versions,
--   course_stage_exercises, course_enrollments, course_stage_progress,
--   course_check_attempts, course_variant_seen
--   my_enrolled_stage_ids, is_enrolled, is_stage_unlocked,
--   enroll_in_course, draw_practice_item, record_practice_answer,
--   start_stage_check, submit_stage_check, get_course_progress,
--   get_stage_authoring, save_stage_theory, save_stage_exercises,
--   delete_stage_theory_version
--   questions.course_stage_id, questions.variant_group,
--   questions.variant_ordinal, questions.authored_key
--   'course' from the questions.visibility CHECK constraint
--   the "questions: enrolled course read" policy on questions
--   the "courses: editor read" / "course_stages: editor read" policies from
--     035 — course_stages is dropped in this migration; the "courses: editor
--     read" policy is recreated identically since courses survives (DROP
--     TABLE would have taken it with the table, but courses isn't dropped,
--     so it must be re-stated explicitly, matching 035's DROP POLICY IF
--     EXISTS / CREATE POLICY idiom).
--
-- 039_theory_heading_block.sql (written, never applied — a CREATE OR REPLACE
-- of save_stage_theory(), which this migration drops) is deleted from the
-- repo in the same commit as this file. This migration takes its number, 039.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- NOT safe to blindly re-apply: the DELETE FROM courses / questions
-- statements are idempotent in effect (a second run deletes zero rows), but
-- this migration is a one-time retirement, not a steady-state schema change.
-- ============================================================


-- ── 1. Unlink promoted (visibility='shared') questions from courses ────────
-- These rows are staying — see the audit note above. Strip their course
-- metadata before the columns that hold it are dropped, so nothing is lost
-- silently mid-migration if a step below fails and this file is re-run by
-- hand up to this point.
UPDATE questions
SET course_stage_id = NULL,
    variant_group    = NULL,
    variant_ordinal  = NULL,
    authored_key     = NULL
WHERE course_stage_id IS NOT NULL
  AND visibility = 'shared';


-- ── 2. Delete the course questions (visibility='course') ───────────────────
-- Safe: the pre-migration audit found zero quizzes.question_ids references to
-- any visibility='course' row. The questions_block_referenced_delete trigger
-- (028, kept) would refuse this DELETE anyway if that were wrong — a second,
-- structural guard on top of the printed audit.
DELETE FROM questions WHERE visibility = 'course';


-- ── 3. Drop course-only RPCs (reverse dependency order) ─────────────────────
DROP FUNCTION IF EXISTS submit_stage_check(UUID, JSONB);
DROP FUNCTION IF EXISTS start_stage_check(UUID);
DROP FUNCTION IF EXISTS get_course_progress(UUID);
DROP FUNCTION IF EXISTS record_practice_answer(TEXT, TEXT);
DROP FUNCTION IF EXISTS draw_practice_item(UUID);
DROP FUNCTION IF EXISTS enroll_in_course(TEXT);
DROP FUNCTION IF EXISTS is_stage_unlocked(UUID);
DROP FUNCTION IF EXISTS is_enrolled(UUID, UUID);
DROP FUNCTION IF EXISTS my_enrolled_stage_ids();
DROP FUNCTION IF EXISTS save_stage_exercises(UUID, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS save_stage_theory(UUID, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_stage_authoring(UUID);
DROP FUNCTION IF EXISTS delete_stage_theory_version(UUID);


-- ── 4. Drop the "questions: enrolled course read" policy ───────────────────
-- The other course-shaped policy on a kept table. courses/course_stages
-- policies are addressed in step 5 below, once course_stages is dropped.
DROP POLICY IF EXISTS "questions: enrolled course read" ON questions;


-- ── 5. Drop course-only tables ──────────────────────────────────────────────
-- CASCADE drops each table's own policies, indexes and FKs. Order matters for
-- readability only — CASCADE means it would work in any order, but this
-- mirrors creation order reversed.
DROP TABLE IF EXISTS course_check_attempts;
DROP TABLE IF EXISTS course_variant_seen;
DROP TABLE IF EXISTS course_stage_progress;
DROP TABLE IF EXISTS course_enrollments;
DROP TABLE IF EXISTS course_stage_exercises;
DROP TABLE IF EXISTS course_stage_theory_versions;
DROP TABLE IF EXISTS course_stage_theory;
DROP TABLE IF EXISTS course_stages;

-- course_stages carried its own two policies ("course_stages: published
-- read" from 028, "course_stages: editor read" from 035); CASCADE took them
-- with the table. courses survives untouched — its policies ("courses:
-- published read" from 028, "courses: editor read" from 035) are on the
-- table already and need no action here.


-- ── 6. Drop the course columns on questions ─────────────────────────────────
ALTER TABLE questions
  DROP COLUMN IF EXISTS course_stage_id,
  DROP COLUMN IF EXISTS variant_group,
  DROP COLUMN IF EXISTS variant_ordinal,
  DROP COLUMN IF EXISTS authored_key;

-- Narrow the visibility CHECK back to the pre-028 + group value (014's
-- shape). Same idiom as 014/028 — the constraint is always named
-- questions_visibility_check regardless of which migration last touched it.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_visibility_check;
ALTER TABLE questions ADD  CONSTRAINT questions_visibility_check
  CHECK (visibility IN ('shared', 'private', 'group'));
