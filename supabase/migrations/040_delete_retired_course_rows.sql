-- ============================================================
-- 040_delete_retired_course_rows.sql
--
-- Follow-up to 039 (CNT-001). 0018 Decision 1 says the `courses` and
-- `course_editors` TABLES survive, reshaped by CNT-002 — it does not say
-- their two retired ROWS survive. 039's own header lists them "kept,
-- unaltered by this migration" because CNT-002 was expected to reshape them
-- in place; CNT-002 turned out not to need either row (it adds columns and
-- writes new courses, it does not adopt `calculus-i` or
-- `human-behavioral-biology`), so issue #66's acceptance line "Both courses
-- and all their rows are deleted" was ticked while 2 courses / 2
-- course_editors rows were still live. This migration finishes that line.
--
-- Pre-migration audit (against the live database, printed output,
-- 2026-09-22, after 039 was applied):
--   courses: 2 rows (calculus-i, human-behavioral-biology)
--   course_editors: 2 rows, both referencing the two courses above
--
-- Reference check before writing this file: grepped supabase/migrations,
-- app/, lib/ and scripts/ for every table this repo has ever defined with
-- `REFERENCES courses(id)`. Two hits: course_stages (028) and
-- course_editors (029). course_stages was dropped by 039, so the only
-- surviving inbound FK to `courses` is course_editors.course_id, which 029
-- declares `ON DELETE CASCADE`. No other table, view, RPC body or app-code
-- string references either course's id or slug outside historical
-- migration files (028, 032, 039) and docs/decisions/0018 — confirmed with
-- `rg` for both slugs across the repo.
--
-- Consequence: deleting the 2 `courses` rows is sufficient. Postgres cascades
-- the matching `course_editors` rows itself; no explicit DELETE FROM
-- course_editors is needed or written, so there is only one way for the two
-- tables' row counts to end up out of step with each other.
--
-- courses/course_editors themselves, their columns, grants, RLS policies,
-- can_edit_course() and the editor-grant RPCs are UNCHANGED by this
-- migration — CNT-002 reshapes those; this file only removes the two
-- retired rows so CNT-002 starts from an empty table.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Wrapped in one explicit transaction, consistent with 039: two DELETEs,
-- both idempotent in effect (a second run deletes zero rows) but this is a
-- one-time cleanup, not a steady-state schema change.
-- ============================================================

BEGIN;

DELETE FROM courses
WHERE slug IN ('calculus-i', 'human-behavioral-biology');

COMMIT;
