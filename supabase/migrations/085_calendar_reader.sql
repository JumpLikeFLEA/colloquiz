-- ============================================================
-- 085_calendar_reader.sql
--
-- COH-015 (#218): one SQL read of the dates that matter to a viewer, for the
-- learner's /my and the teacher's /studio/calendar (docs/decisions/0141
-- Decisions 15 and 16; choices made while writing this file are in
-- docs/decisions/0159). No new table, no new write.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 084_calendar_events.sql
--   latest body of the account-delete RPC   -> 082_author_seats.sql (NOT
--     re-emitted here: this file adds no table and stores nothing about a user)
-- REQUIRES 058 (course_runs, run_enrolments, run_calls, _lesson_access_at's
-- unlock formula), 029 (can_edit_course), 080 (my_homework,
-- teacher_homework_list) and 084 (calendar_events).
--
-- ── my_calendar(p_role) ─────────────────────────────────────────────────
-- p_role is 'learner' or 'teacher'; anything else is an error. Rows:
--   run_start / run_end   a run's start and stored end
--   week_open             the moment week N of a run opens, for every week
--                         that has an entitled lesson, past weeks included.
--                         Same formula as _lesson_access_at (058):
--                         LEAST(starts_at + 7 x (N-1) days, ends_at)
--   call                  a run's call, by course_calls' rule: a learner
--                         needs a live `extended` enrolment, an editor sees
--                         every run's calls
--   homework_due          a homework due date (an all-day DATE, never a
--                         moment: nothing here gives it a time zone)
--   event                 a COH-014 event
-- learner: the runs the caller has a LIVE enrolment in (revoked ones are
--   gone), of published courses; their homework (my_homework); the events of
--   those runs and of the groups they are in (a member's row has no group id,
--   084).
-- teacher: every run of a course the caller can edit (can_edit_course, so an
--   admin has them all), including drafts; their own assignments
--   (teacher_homework_list); the events they can manage.
-- Who may see an event, a call or a homework row is still decided by the
-- readers this function calls (calendar_events, my_homework,
-- teacher_homework_list) and by the predicates above; none is restated.
-- A learner's rows never carry a group id.
--
-- Not destructive: one new function; no DROP, no TRUNCATE, no UPDATE or DELETE.
-- Safe to re-apply: CREATE OR REPLACE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION my_calendar(p_role TEXT)
RETURNS TABLE (
  key           TEXT,
  kind          TEXT,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  due_on        DATE,
  title         TEXT,
  course_id     UUID,
  course_slug   TEXT,
  course_title  TEXT,
  lesson_slug   TEXT,
  week          INTEGER,
  run_id        UUID,
  group_id      UUID,
  assignment_id UUID,
  link          TEXT,
  done          BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('learner', 'teacher') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH runs AS (
    SELECT r.id AS rid, r.course_id AS cid, r.title AS rtitle, r.starts_at AS rstart,
           r.ends_at AS rend, c.slug AS cslug, c.title AS ctitle,
           COALESCE(en.tier = 'extended', FALSE) AS ext
    FROM course_runs r
    JOIN courses c ON c.id = r.course_id
    LEFT JOIN run_enrolments en
           ON en.run_id = r.id AND en.user_id = v_me AND en.revoked_at IS NULL
    WHERE (p_role = 'learner' AND en.user_id IS NOT NULL AND c.status = 'published')
       OR (p_role = 'teacher' AND can_edit_course(r.course_id, v_me))
  ),
  weeks AS (
    SELECT DISTINCT ru.rid, l.week AS w
    FROM runs ru
    JOIN lessons l ON l.course_id = ru.cid
                  AND l.access_level = 'entitled'
                  AND l.week IS NOT NULL
                  AND (p_role = 'teacher'
                       OR (l.published_version_id IS NOT NULL AND l.archived_at IS NULL))
  ),
  hw AS (
    SELECT h.assignment_id AS aid, h.course_id AS cid, h.course_slug AS cslug,
           h.course_title AS ctitle, h.lesson_slug AS lslug,
           COALESCE(h.lesson_title, h.course_title) AS htitle, h.due_on AS due, h.done AS hdone
    FROM my_homework() h
    WHERE p_role = 'learner' AND h.due_on IS NOT NULL
    UNION ALL
    SELECT t.assignment_id, t.course_id, t.course_slug, t.course_title, NULL::text,
           COALESCE(t.lesson_title, t.course_title), t.due_on, NULL::boolean
    FROM teacher_homework_list() t
    WHERE p_role = 'teacher' AND t.due_on IS NOT NULL
  )
  SELECT q.* FROM (
    SELECT 'run_start:' || ru.rid, 'run_start'::text, ru.rstart, NULL::timestamptz, NULL::date,
           ru.rtitle, ru.cid, ru.cslug, ru.ctitle, NULL::text, NULL::int, ru.rid, NULL::uuid,
           NULL::uuid, NULL::text, NULL::boolean
    FROM runs ru
    UNION ALL
    SELECT 'run_end:' || ru.rid, 'run_end', ru.rend, NULL, NULL,
           ru.rtitle, ru.cid, ru.cslug, ru.ctitle, NULL, NULL, ru.rid, NULL, NULL, NULL, NULL
    FROM runs ru
    UNION ALL
    SELECT 'week:' || ru.rid || ':' || wk.w, 'week_open',
           LEAST(ru.rstart + make_interval(days => 7 * (wk.w - 1)), ru.rend), NULL, NULL,
           ru.rtitle, ru.cid, ru.cslug, ru.ctitle, NULL, wk.w, ru.rid, NULL, NULL, NULL, NULL
    FROM runs ru
    JOIN weeks wk ON wk.rid = ru.rid
    UNION ALL
    SELECT 'call:' || k.id, 'call', k.starts_at, NULL, NULL,
           k.title, ru.cid, ru.cslug, ru.ctitle, NULL, NULL, ru.rid, NULL, NULL, k.meet_url, NULL
    FROM runs ru
    JOIN run_calls k ON k.run_id = ru.rid
    WHERE p_role = 'teacher' OR ru.ext
    UNION ALL
    SELECT 'homework:' || hw.aid, 'homework_due', NULL, NULL, hw.due,
           hw.htitle, hw.cid, hw.cslug, hw.ctitle, hw.lslug, NULL, NULL, NULL, hw.aid, NULL, hw.hdone
    FROM hw
    UNION ALL
    SELECT 'event:' || ce.event_id, 'event', ce.starts_at, ce.ends_at, NULL,
           ce.title, ru.cid, ru.cslug, ru.ctitle, NULL, NULL, ce.run_id,
           CASE WHEN p_role = 'teacher' THEN ce.group_id END, NULL, ce.link, NULL
    FROM calendar_events() ce
    LEFT JOIN runs ru ON ru.rid = ce.run_id
    WHERE (p_role = 'teacher' AND ce.can_manage)
       OR (p_role = 'learner'
           AND ((ce.scope = 'run' AND ru.rid IS NOT NULL)
             OR (ce.scope = 'group' AND ce.group_id IS NULL)))
  ) AS q(c_key, c_kind, c_starts, c_ends, c_due, c_title, c_course, c_slug, c_ctitle,
         c_lesson, c_week, c_run, c_group, c_assign, c_link, c_done)
  ORDER BY COALESCE(q.c_starts, q.c_due::timestamptz), q.c_key;
END;
$$;

REVOKE ALL ON FUNCTION my_calendar(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_calendar(TEXT) TO authenticated;

COMMIT;
