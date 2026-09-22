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
-- Pre-migration audit (against the live database, printed output,
-- 2026-09-21 — re-verified after the first draft of this file; see the
-- CNT-001 issue thread for the full session):
--   courses: calculus-i (published), human-behavioral-biology (draft)
--   Row counts, every table this migration touches:
--     courses: 2, course_editors: 2, course_stages: 8,
--     course_stage_theory: 8, course_stage_theory_versions: 23,
--     course_stage_exercises: 1, course_enrollments: 2,
--     course_stage_progress: 0, course_check_attempts: 0,
--     course_variant_seen: 1
--   questions: 3578 total, visibility='course': 95, visibility='shared': 3323,
--     course_stage_id IS NOT NULL: 158, authored_key IS NOT NULL: 158
--   quizzes.question_ids referencing a visibility='course' question: 0
--   quizzes.question_ids referencing ANY course-linked question: 5 quizzes,
--     all 5 referencing only the 63 promoted visibility='shared' rows
--     (158 course-linked − 95 visibility='course' = 63 promoted/shared)
--   results rows on those 5 quizzes: 3
--   get_subject_stats() per subject, sum 3158 (unaffected by this migration
--     — nothing it does touches visibility/status/subject/difficulty on any
--     surviving row; compare against this exact breakdown post-apply):
--       biology: easy=89 medium=127 hard=51 total=267
--       chemistry: easy=30 medium=30 hard=30 total=90
--       computer_science: easy=89 medium=80 hard=30 total=199
--       data_analysis: easy=34 medium=34 hard=33 total=101
--       esports_history: easy=30 medium=30 hard=30 total=90
--       geography: easy=98 medium=98 hard=49 total=245
--       history: easy=216 medium=176 hard=158 total=550
--       literature: easy=32 medium=32 hard=30 total=94
--       mathematics: easy=30 medium=38 hard=30 total=98
--       music: easy=30 medium=30 hard=30 total=90
--       philosophy: easy=176 medium=203 hard=93 total=472
--       physics: easy=30 medium=30 hard=30 total=90
--       psychology: easy=177 medium=202 hard=93 total=472
--       science_history: easy=30 medium=30 hard=30 total=90
--       sports_history: easy=45 medium=45 hard=30 total=120
--       trivium: easy=30 medium=30 hard=30 total=90
--   sampleQuestions()-shape query (mathematics, visibility='shared',
--     status='approved', limit 10): 10 rows, mixing gen-* and crs-* ids —
--     the promoted crs- siblings already serve through Quick Play today and
--     this migration never touches their visibility/status/content.
--   Full export of every row this migration deletes (the 8 course tables +
--     the 95 visibility='course' questions) PLUS `courses` (2 rows) and
--     `course_editors` (2 rows) — both kept, exported anyway as a complete
--     pre-migration snapshot of everything course-shaped — written to a
--     local, gitignored file (authored/_migration_039_export/*.json) before
--     this migration runs, as a restore point independent of the audit above.
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
-- visibility='shared' questions, indistinguishable from any other. Because
-- their visibility/status/subject/difficulty/question/options never change,
-- sampleQuestions() and get_subject_stats() are unaffected by this migration
-- — nothing in it touches a column either function reads.
--
-- Kept, unaltered by this migration (reshaped by 040 instead):
--   courses, course_editors, can_edit_course(), grant_course_editor(),
--   revoke_course_editor(), questions.updated_by (032's generic "edited
--   in-app" marker — not course-specific, has no course dependency),
--   the questions_block_referenced_delete trigger (028 — generically useful
--   now that it exists; guards quizzes.question_ids regardless of course).
--   Verified: no migration outside 028/029/030/032/035 references any
--   object this file drops, and can_edit_course()/grant_course_editor()/
--   revoke_course_editor() (029) touch only course_editors, courses and
--   is_admin() — none of which this migration alters. No app code
--   (app/, lib/, scripts/) references course_stage_id, variant_group,
--   variant_ordinal, authored_key, updated_by, or visibility='course' as of
--   this migration's commit — grepped clean, including the general question
--   importer and the admin review/promote path.
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
--   the "course_stage_theory: enrolled read" policy (explicit, see below —
--     not left to the table's CASCADE, which runs too late)
--   the "course_stages: published read" / "course_stages: editor read"
--     policies (028/035) — go with the course_stages table when it is
--     dropped (its own policies; no separate action needed); courses' own
--     two policies are untouched (see below)
--
-- Dependency ordering, load-bearing. Two of the four rounds below were only
-- found because a real apply attempt failed against the live database —
-- inspection alone missed them the first two times. Postgres tracks a real
-- catalog dependency (pg_depend) for a POLICY's USING clause and for a
-- LANGUAGE SQL function's body (both are parsed at creation time), but NOT
-- for a LANGUAGE plpgsql function's body (opaque text, dependency-free
-- until it's actually called). That distinction is what makes the ordering
-- non-obvious: most of the dropped functions are plpgsql and impose no
-- ordering constraint at all; the exceptions below are exactly the ones
-- that aren't.
--
-- 1. "questions: enrolled course read" reads course_stage_id and calls
--    my_enrolled_stage_ids() — both dropped later in this file. First apply
--    attempt failed exactly here: "ERROR: 2BP01: cannot drop column
--    course_stage_id of table questions because other objects depend on it
--    — policy questions: enrolled course read on table questions depends
--    on column course_stage_id." Confirmed the whole file rolled back
--    cleanly (one transaction; see below) before reordering.
-- 2. "course_stage_theory: enrolled read" (course_stage_theory's own
--    policy) also calls my_enrolled_stage_ids(). Second apply attempt
--    would have failed on this one next — relying on course_stage_theory's
--    own DROP TABLE (step 6) to cascade the policy away is too late,
--    because my_enrolled_stage_ids() is dropped earlier, in step 4. Both
--    hazard policies are therefore dropped explicitly in step 3, before
--    anything they reference.
-- 3. Three of the thirteen dropped functions are LANGUAGE SQL, not plpgsql,
--    so their bodies ARE dependency-tracked: my_enrolled_stage_ids() reads
--    course_stages and course_enrollments; is_enrolled() reads
--    course_enrollments; get_course_progress() reads course_stages,
--    course_stage_progress, course_variant_seen and
--    questions.course_stage_id, and calls is_stage_unlocked(). Every one of
--    those is dropped later in this file, so all three SQL functions (and,
--    transitively, is_stage_unlocked() via get_course_progress's call) are
--    dropped in step 4, before step 5 touches the questions columns and
--    before step 6 touches the tables.
-- 4. questions.course_stage_id carries a live FK into course_stages (028:
--    `REFERENCES course_stages(id) ON DELETE SET NULL`), and questions
--    survives this migration. `DROP TABLE course_stages` therefore cannot
--    run before that column (and the FK constraint it carries) is gone.
--    Every other dropped table's inbound FKs come only from OTHER tables
--    this same migration drops (course_stage_theory,
--    course_stage_theory_versions, course_stage_exercises,
--    course_stage_progress and course_check_attempts all FK into
--    course_stages; nothing outside this dropped cluster FKs into any of
--    them), so course_stages is the only FK-ordering hazard. Step 5 (drop
--    the questions columns) therefore runs before step 6 (drop the tables).
--
-- Net order: 3 (drop the 2 policies) → 4 (drop the 13 RPCs) → 5 (drop the
-- questions columns + narrow the CHECK) → 6 (drop the 8 tables,
-- course_stages last). No CASCADE is used anywhere in this file: every drop
-- is ordered so it is never needed, which is easier to audit than relying
-- on CASCADE to paper over a dependency — and, per the two failures above,
-- easier to get wrong by inspection alone. If applying this file still
-- fails, treat the failure as a hypothesis-breaker, not a prompt to add
-- CASCADE: re-derive from the actual error the same way these two were
-- found, since the transaction wrap (below) guarantees a clean rollback to
-- retry from.
--
-- 039_theory_heading_block.sql (written, never applied — a CREATE OR REPLACE
-- of save_stage_theory(), which this migration drops) is deleted from the
-- repo in the same commit as this file. This migration takes its number, 039.
--
-- Wrapped in one explicit transaction: this migration mixes DELETEs, column
-- drops and table drops across a dependent cluster of objects, and every
-- statement in it is transactional DDL/DML in Postgres, so a mid-migration
-- failure must not leave the schema half-retired. Run as one script (e.g.
-- `psql -f` or pasted whole into the SQL Editor) so BEGIN/COMMIT bracket the
-- entire file — if the tool used also wraps its own transaction around the
-- whole script, this BEGIN is a no-op inside it, not a conflict.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- NOT safe to blindly re-apply: the DELETE FROM questions statement is
-- idempotent in effect (a second run deletes zero rows), but this migration
-- is a one-time retirement, not a steady-state schema change.
-- ============================================================

BEGIN;

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


-- ── 3. Drop the two policies with a real catalog dependency on something ───
--      below (a plain function CALL inside a plpgsql body is opaque and
--      creates no dependency; a policy's USING clause and a LANGUAGE SQL
--      function's body are both PARSED at creation time and DO create real
--      pg_depend edges on every column/function/table they reference — this
--      is why these two policies specifically, and not any other course
--      policy, block later steps):
--   - "questions: enrolled course read" (on questions, kept) — reads
--     course_stage_id and calls my_enrolled_stage_ids(). Confirmed live:
--     the first apply attempt failed here with "policy ... depends on
--     column ... — use DROP ... CASCADE" when this ran after the column
--     drop instead of before it.
--   - "course_stage_theory: enrolled read" (on course_stage_theory, itself
--     dropped in step 6) — also calls my_enrolled_stage_ids(). Relying on
--     step 6's DROP TABLE to cascade this away is too late: step 4 below
--     drops my_enrolled_stage_ids() itself, which must happen while this
--     policy is already gone, not merely queued to go later.
-- courses' own two policies ("courses: published read" from 028, "courses:
-- editor read" from 035) are untouched — courses is not dropped, and
-- neither policy references anything this migration drops.
DROP POLICY IF EXISTS "questions: enrolled course read" ON questions;
DROP POLICY IF EXISTS "course_stage_theory: enrolled read" ON course_stage_theory;


-- ── 4. Drop course-only RPCs, BEFORE the questions columns and BEFORE the
--      course tables ──────────────────────────────────────────────────────
-- Three of these — my_enrolled_stage_ids, is_enrolled, get_course_progress —
-- are LANGUAGE SQL (not plpgsql), so Postgres parses their bodies at CREATE
-- time and tracks real dependencies on what they reference:
--   my_enrolled_stage_ids() -> course_stages, course_enrollments
--   is_enrolled()           -> course_enrollments
--   get_course_progress()   -> course_stages, course_stage_progress,
--                              course_variant_seen, questions.course_stage_id,
--                              and calls is_stage_unlocked()
-- Every one of those referenced tables/columns is dropped later in this
-- file (steps 5-6), so all three SQL functions — and, transitively,
-- is_stage_unlocked() via get_course_progress's call to it — must be
-- dropped here, before step 5 touches the questions columns and before
-- step 6 touches the tables. The other ten functions are plpgsql (opaque
-- bodies, no tracked dependency either way) and can drop in any order;
-- get_course_progress is listed before is_stage_unlocked purely to keep
-- the one real function-to-function dependency in reading order.
DROP FUNCTION IF EXISTS submit_stage_check(UUID, JSONB);
DROP FUNCTION IF EXISTS start_stage_check(UUID);
DROP FUNCTION IF EXISTS get_course_progress(UUID);
DROP FUNCTION IF EXISTS is_stage_unlocked(UUID);
DROP FUNCTION IF EXISTS record_practice_answer(TEXT, TEXT);
DROP FUNCTION IF EXISTS draw_practice_item(UUID);
DROP FUNCTION IF EXISTS enroll_in_course(TEXT);
DROP FUNCTION IF EXISTS is_enrolled(UUID, UUID);
DROP FUNCTION IF EXISTS my_enrolled_stage_ids();
DROP FUNCTION IF EXISTS save_stage_exercises(UUID, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS save_stage_theory(UUID, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_stage_authoring(UUID);
DROP FUNCTION IF EXISTS delete_stage_theory_version(UUID);


-- ── 5. Drop the course columns on questions (BEFORE the course tables — see
--      the FK-ordering note above: this removes the questions_course_stage_id
--      FK into course_stages, which step 6's DROP TABLE would otherwise hit;
--      by this point get_course_progress, the one SQL function that read
--      course_stage_id, is already gone from step 4) ──────────────────────
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


-- ── 6. Drop course-only tables ──────────────────────────────────────────────
-- No CASCADE: by this point nothing outside this cluster references any of
-- these tables — the two policies (step 3), the three SQL-language
-- functions (step 4) and the questions.course_stage_id FK (step 5) that
-- would otherwise have blocked these drops are already gone. Order here is
-- for readability only, except course_stages, which must be last (every
-- other dropped table FKs into it).
DROP TABLE IF EXISTS course_check_attempts;
DROP TABLE IF EXISTS course_variant_seen;
DROP TABLE IF EXISTS course_stage_progress;
DROP TABLE IF EXISTS course_enrollments;
DROP TABLE IF EXISTS course_stage_exercises;
DROP TABLE IF EXISTS course_stage_theory_versions;
DROP TABLE IF EXISTS course_stage_theory;
DROP TABLE IF EXISTS course_stages;

COMMIT;
