-- ============================================================
-- 035_course_editor_read.sql
--
-- BUG FIX: admins/editors could not see a draft course at all.
--
-- 028 gave `courses` and `course_stages` a single SELECT policy each,
-- "published read", gated on status = 'published'. 029/030/032 then built the
-- whole in-app authoring path (get_stage_authoring / save_stage_theory /
-- delete_stage_theory_version / exercise authoring) on can_edit_course(), and
-- the admin course-list/detail pages (app/(main)/admin/courses/**) were
-- written assuming a matching "admin/editor can read any course" RLS bypass
-- existed on the courses/course_stages TABLES themselves — see the comment in
-- app/(main)/admin/courses/[slug]/page.tsx, which describes this bypass as
-- already in place. It was never added. A draft course (e.g. one just
-- imported by scripts/import-course.ts, which defaults nothing to published)
-- is therefore invisible to getEditableCourses() and to the course detail
-- page's direct `courses`/`course_stages` reads, even for an admin — RLS
-- blocks the row before the app's own isAdmin/course_editors check ever runs.
--
-- Fix: add a second, permissive SELECT policy to each table using the
-- existing can_edit_course() helper (029). Postgres OR-combines multiple
-- permissive policies for the same command, so this only ADDS visibility
-- (admins, plus editors with an explicit course_editors grant) on top of the
-- existing published-read policy — no learner-facing behavior changes.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Safe to re-apply: idempotent.
-- ============================================================

DROP POLICY IF EXISTS "courses: editor read" ON courses;
CREATE POLICY "courses: editor read"
  ON courses FOR SELECT
  USING (can_edit_course(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "course_stages: editor read" ON course_stages;
CREATE POLICY "course_stages: editor read"
  ON course_stages FOR SELECT
  USING (can_edit_course(course_stages.course_id, (SELECT auth.uid())));
