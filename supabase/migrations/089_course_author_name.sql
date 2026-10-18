-- ============================================================
-- 089_course_author_name.sql
--
-- TCH-011 (#225): a non-house teacher's published course says whose it is
-- (docs/decisions/0141 Decision 20; choices in docs/decisions/0172).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 088_listed_courses.sql
--   latest body of the account-delete RPC   -> 086_calendar_feed.sql (NOT
--     re-emitted here: one new read function, no user-keyed table)
-- REQUIRES 028 (courses), 067 (courses.author_id), 082 (author_seats).
--
-- author_seats has no grants (082), so the name cannot be read by the course
-- page directly. course_author_name(course) is the one read: SECURITY DEFINER,
-- executable by anon, returns ONLY the seat's public_name, and only when
--   * the course is published,
--   * its author_id has a seat of kind 'teacher' (a 'house' seat, a course with
--     no author and a deleted author all return NULL: nothing is shown).
-- Nothing else of the seat (contact, notes, expiry, kind) leaves the function.
-- A lapsed seat still returns the name: authorship does not expire (0172).
--
-- Not destructive: one new function. Safe to re-apply (CREATE OR REPLACE).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION course_author_name(p_course UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT btrim(s.public_name)
  FROM courses c
  JOIN author_seats s ON s.user_id = c.author_id AND s.kind = 'teacher'
  WHERE c.id = p_course
    AND c.status = 'published';
$$;

REVOKE ALL ON FUNCTION course_author_name(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION course_author_name(UUID) TO anon, authenticated;

COMMIT;
