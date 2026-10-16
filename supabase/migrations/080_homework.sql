-- ============================================================
-- 080_homework.sql
--
-- TCH-005 (#215): a teacher assigns a lesson or a whole course to linked
-- students and/or groups, with an optional due date that never locks, and
-- tracks it (docs/decisions/0141 Decisions 13 and 14; choices made while
-- writing this file are in docs/decisions/0152).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 079_teacher_messages.sql
--   latest body of the account-delete RPC   -> 079_teacher_messages.sql
-- Re-emitted: delete_my_account (079, two added DELETEs, section 7);
-- linked_student_attempts and linked_student_lesson_scores (078, section 5).
-- REQUIRES 075 (lesson_completion), 076 (_teacher_linked, _is_teacher), 077
-- (teacher_groups, teacher_group_members), 078 and 058 (_lesson_access_at).
--
-- ── 1. homework_assignments / homework_targets ──────────────────────────
-- An assignment is (teacher, course, optional lesson, optional due date,
-- optional note). Its targets are students or groups, one row each. No
-- grants, no policy: every read and write is a SECURITY DEFINER function
-- below. The due date is a DATE (no time zone), information only: nothing in
-- this file reads it to decide anything (0141 Decision 14).
--
-- ── 2. One definition of "who receives it": _homework_recipients ────────
-- A student receives an assignment when they are a direct target, or a
-- member of a targeted group RIGHT NOW (membership is read live, so a
-- student added to a group later receives the group's open homework), and
-- the teacher's link to them is active. "Open" means "not deleted": there is
-- no closed state. Every reader and the TCH-003 widening in section 5 go
-- through this function.
--
-- ── 3. A link that ends takes the student's direct targets with it ──────
-- A trigger on teacher_student_links, the 077 pattern (the link ends through
-- end_teacher_link, delete_my_account and whatever TCH-008 adds; the trigger
-- covers all of them). A group target needs no cleanup: 077's trigger
-- already removes the student from that teacher's groups. Relinking does not
-- bring the homework back.
--
-- ── 4. Teacher and learner functions ────────────────────────────────────
-- assign_homework / update_homework / delete_homework, teacher_homework_list,
-- teacher_homework_targets, teacher_homework_progress, homework_assignable;
-- my_homework and my_homework_export for the learner.
--
-- ── 5. TCH-003's readers, widened ───────────────────────────────────────
-- linked_student_attempts and linked_student_lesson_scores now read the
-- lessons returned by _teacher_readable_lessons(teacher, student): every
-- lesson of a course the teacher edits (as 078) plus the lessons covered by
-- an assignment that student receives from that teacher. A single-lesson
-- assignment covers that lesson only; a course assignment covers the
-- course's lessons (docs/decisions/0144 Q5; privacy-policy.md §5).
-- linked_student_assigned_lessons lists the assigned lessons the teacher does
-- not edit, so Studio can title them.
--
-- ── 6. Learner reads ────────────────────────────────────────────────────
-- my_homework() returns only assignments whose course is published; the
-- access state of an assigned lesson is _lesson_access_at's, the one
-- function (nothing is decided here). "Done" is lesson_completion's (075).
--
-- ── 7. Deletion ─────────────────────────────────────────────────────────
-- delete_my_account re-emitted from 079 with two added DELETEs: the caller's
-- own assignments (targets cascade) and the caller's direct targets as a
-- student.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE ... IF NOT EXISTS, every function CREATE OR
-- REPLACE, DROP TRIGGER IF EXISTS.
-- ============================================================

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework_assignments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id  UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  lesson_id  UUID                 REFERENCES lessons(id)  ON DELETE CASCADE,
  due_on     DATE,
  note       TEXT        CHECK (note IS NULL OR (note = btrim(note) AND char_length(note) BETWEEN 1 AND 500)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT homework_assignments_id_teacher_key UNIQUE (id, teacher_id)
);
CREATE INDEX IF NOT EXISTS homework_assignments_teacher_idx
  ON homework_assignments (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS homework_assignments_course_idx
  ON homework_assignments (course_id);

ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE homework_assignments FROM PUBLIC, anon, authenticated;


-- teacher_id is stored on the target so composite FKs make "the target
-- belongs to the assignment's own teacher" and "the group is that teacher's
-- own" constraints, not conventions (the 077 teacher_group_members shape).
-- A student target must be a live linked student of that teacher:
-- assign_homework() enforces it on the way in, the trigger in section 3 on
-- the way out.
CREATE TABLE IF NOT EXISTS homework_targets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID        NOT NULL,
  teacher_id    UUID        NOT NULL,
  student_id    UUID                 REFERENCES profiles(id) ON DELETE CASCADE,
  group_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT homework_targets_one_kind CHECK ((student_id IS NULL) <> (group_id IS NULL)),
  CONSTRAINT homework_targets_assignment_fk
    FOREIGN KEY (assignment_id, teacher_id) REFERENCES homework_assignments (id, teacher_id) ON DELETE CASCADE,
  CONSTRAINT homework_targets_group_fk
    FOREIGN KEY (group_id, teacher_id) REFERENCES teacher_groups (id, teacher_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS homework_targets_student_uniq
  ON homework_targets (assignment_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS homework_targets_group_uniq
  ON homework_targets (assignment_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS homework_targets_student_idx
  ON homework_targets (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS homework_targets_group_idx
  ON homework_targets (group_id) WHERE group_id IS NOT NULL;

ALTER TABLE homework_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE homework_targets FROM PUBLIC, anon, authenticated;


-- ── 2. _homework_recipients ─────────────────────────────────────────────
-- (assignment, student) pairs that currently apply. Exactly one of the two
-- arguments is normally given; NULL means "any". Both NULL returns nothing,
-- so a NULL auth.uid() can never turn into "everyone".
CREATE OR REPLACE FUNCTION _homework_recipients(p_teacher UUID, p_student UUID)
RETURNS TABLE (assignment_id UUID, student_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT r.assignment_id, r.student_id
  FROM (
    SELECT a.id AS assignment_id, a.teacher_id, t.student_id
    FROM homework_assignments a
    JOIN homework_targets t ON t.assignment_id = a.id AND t.student_id IS NOT NULL
    WHERE (p_teacher IS NULL OR a.teacher_id = p_teacher)
      AND (p_student IS NULL OR t.student_id = p_student)
    UNION ALL
    SELECT a.id, a.teacher_id, m.student_id
    FROM homework_assignments a
    JOIN homework_targets t ON t.assignment_id = a.id AND t.group_id IS NOT NULL
    JOIN teacher_group_members m ON m.group_id = t.group_id
    WHERE (p_teacher IS NULL OR a.teacher_id = p_teacher)
      AND (p_student IS NULL OR m.student_id = p_student)
  ) r
  WHERE (p_teacher IS NOT NULL OR p_student IS NOT NULL)
    AND _teacher_linked(r.teacher_id, r.student_id)
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.student_id AND p.deleted_at IS NULL);
$$;

REVOKE ALL ON FUNCTION _homework_recipients(UUID, UUID) FROM PUBLIC, anon, authenticated;


-- ── 3. A link that ends takes the student's direct targets ──────────────
CREATE OR REPLACE FUNCTION _teacher_link_ended_drop_homework()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM homework_targets
   WHERE teacher_id = OLD.teacher_id AND student_id = OLD.student_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION _teacher_link_ended_drop_homework() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teacher_link_ended_drop_homework_upd ON teacher_student_links;
CREATE TRIGGER teacher_link_ended_drop_homework_upd
  AFTER UPDATE OF ended_at ON teacher_student_links
  FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION _teacher_link_ended_drop_homework();

DROP TRIGGER IF EXISTS teacher_link_ended_drop_homework_del ON teacher_student_links;
CREATE TRIGGER teacher_link_ended_drop_homework_del
  AFTER DELETE ON teacher_student_links
  FOR EACH ROW
  EXECUTE FUNCTION _teacher_link_ended_drop_homework();


-- ── 4a. Teacher: assign / update / delete ───────────────────────────────
-- The content is a course the caller edits OR a published course, and, for a
-- lesson, a published non-archived lesson OF THAT COURSE. A course the caller
-- cannot edit and that is not published answers course_not_found, the same as
-- one that does not exist. Targets: students must be the caller's live linked
-- students; groups must be the caller's own. All or nothing.
CREATE OR REPLACE FUNCTION assign_homework(
  p_course   UUID,
  p_lesson   UUID,
  p_due      DATE,
  p_note     TEXT,
  p_students UUID[],
  p_groups   UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_note     TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_students UUID[];
  v_groups   UUID[];
  v_id       UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _is_teacher(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = p_course AND (c.status = 'published' OR can_edit_course(c.id, v_me))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  IF p_lesson IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lessons l
    WHERE l.id = p_lesson AND l.course_id = p_course
      AND l.published_version_id IS NOT NULL AND l.archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_note');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::UUID[]) INTO v_students
  FROM unnest(COALESCE(p_students, ARRAY[]::UUID[])) AS s;
  SELECT COALESCE(array_agg(DISTINCT g), ARRAY[]::UUID[]) INTO v_groups
  FROM unnest(COALESCE(p_groups, ARRAY[]::UUID[])) AS g;

  IF cardinality(v_students) + cardinality(v_groups) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_targets');
  END IF;
  IF cardinality(v_students) > 500 OR cardinality(v_groups) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_students) AS s WHERE NOT _teacher_linked(v_me, s)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_groups) AS g
    WHERE NOT EXISTS (SELECT 1 FROM teacher_groups tg WHERE tg.id = g AND tg.teacher_id = v_me)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'group_not_found');
  END IF;

  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id, due_on, note)
  VALUES (v_me, p_course, p_lesson, p_due, v_note)
  RETURNING id INTO v_id;

  INSERT INTO homework_targets (assignment_id, teacher_id, student_id)
  SELECT v_id, v_me, s FROM unnest(v_students) AS s;
  INSERT INTO homework_targets (assignment_id, teacher_id, group_id)
  SELECT v_id, v_me, g FROM unnest(v_groups) AS g;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION assign_homework(UUID, UUID, DATE, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assign_homework(UUID, UUID, DATE, TEXT, UUID[], UUID[]) TO authenticated;


-- Only the due date and the note change; the content and the targets do not
-- (delete and assign again). NULL clears.
CREATE OR REPLACE FUNCTION update_homework(p_assignment UUID, p_due DATE, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_note');
  END IF;

  UPDATE homework_assignments SET due_on = p_due, note = v_note
   WHERE id = p_assignment AND teacher_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_homework(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_homework(UUID, DATE, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION delete_homework(p_assignment UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  DELETE FROM homework_assignments WHERE id = p_assignment AND teacher_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_homework(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_homework(UUID) TO authenticated;


-- ── 4b. Teacher: reads ──────────────────────────────────────────────────
-- The caller's own assignments, newest first. course_published is false for a
-- draft course the caller edits: students do not see those (section 6).
CREATE OR REPLACE FUNCTION teacher_homework_list()
RETURNS TABLE (
  assignment_id    UUID,
  course_id        UUID,
  course_title     TEXT,
  course_slug      TEXT,
  course_published BOOLEAN,
  lesson_id        UUID,
  lesson_title     TEXT,
  due_on           DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.course_id, c.title, c.slug, (c.status = 'published'),
         a.lesson_id, l.title, a.due_on, a.note, a.created_at
  FROM homework_assignments a
  JOIN courses c ON c.id = a.course_id
  LEFT JOIN lessons l ON l.id = a.lesson_id
  WHERE a.teacher_id = (SELECT auth.uid())
  ORDER BY a.created_at DESC, a.id;
$$;

REVOKE ALL ON FUNCTION teacher_homework_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_homework_list() TO authenticated;


-- The caller's targets, as chosen (a student or a group), for the "who" line.
CREATE OR REPLACE FUNCTION teacher_homework_targets()
RETURNS TABLE (
  assignment_id UUID,
  student_id    UUID,
  group_id      UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.assignment_id, t.student_id, t.group_id
  FROM homework_targets t
  WHERE t.teacher_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION teacher_homework_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_homework_targets() TO authenticated;


-- Per (assignment, recipient): how far along, from lesson_completion (075),
-- the one definition of "complete" and "best". A lesson assignment's scope is
-- that lesson; a course assignment's is the course's published non-archived
-- lessons. total_lessons = 0 (the lesson was archived since) is never "done".
-- For a course the best score is the average over its COMPLETED lessons that
-- have one, the handoff's second progress number. Scores reach the teacher
-- only for their own recipients, on exactly the lessons the assignment covers
-- (docs/decisions/0144 Q5).
CREATE OR REPLACE FUNCTION _homework_progress(p_teacher UUID)
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
  done_lessons     INTEGER,
  total_lessons    INTEGER,
  best_percent     INTEGER,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recips AS (
    SELECT r.assignment_id, r.student_id FROM _homework_recipients(p_teacher, NULL) r
  ),
  scope AS (
    SELECT a.id AS assignment_id, l.id AS lesson_id
    FROM homework_assignments a
    JOIN lessons l ON l.course_id = a.course_id
                  AND l.published_version_id IS NOT NULL
                  AND l.archived_at IS NULL
    WHERE a.teacher_id = p_teacher AND (a.lesson_id IS NULL OR l.id = a.lesson_id)
  ),
  students AS (SELECT DISTINCT student_id FROM recips),
  course_ids AS (
    SELECT COALESCE(array_agg(DISTINCT a.course_id), ARRAY[]::UUID[]) AS ids
    FROM homework_assignments a WHERE a.teacher_id = p_teacher
  ),
  comp AS (
    SELECT s.student_id, c.lesson_id, c.complete, c.best_percent
    FROM students s
    CROSS JOIN course_ids ci
    CROSS JOIN LATERAL lesson_completion(s.student_id, ci.ids) c
  ),
  act AS (
    SELECT x.user_id, x.lesson_id, max(x.at) AS at
    FROM (
      SELECT a.user_id, v.lesson_id, a.created_at AS at
      FROM lesson_attempts a
      JOIN lesson_versions v ON v.id = a.lesson_version_id
      WHERE a.user_id IN (SELECT student_id FROM students)
      UNION ALL
      SELECT o.user_id, o.lesson_id, o.last_opened_at
      FROM lesson_opens o
      WHERE o.user_id IN (SELECT student_id FROM students)
    ) x
    GROUP BY x.user_id, x.lesson_id
  )
  SELECT rc.assignment_id, rc.student_id,
         (count(*) FILTER (WHERE cp.complete))::INTEGER,
         (SELECT count(*) FROM scope s2 WHERE s2.assignment_id = rc.assignment_id)::INTEGER,
         round(avg(cp.best_percent) FILTER (WHERE cp.complete AND cp.best_percent IS NOT NULL))::INTEGER,
         max(ac.at)
  FROM recips rc
  LEFT JOIN scope sc ON sc.assignment_id = rc.assignment_id
  LEFT JOIN comp cp  ON cp.student_id = rc.student_id AND cp.lesson_id = sc.lesson_id
  LEFT JOIN act ac   ON ac.user_id = rc.student_id AND ac.lesson_id = sc.lesson_id
  GROUP BY rc.assignment_id, rc.student_id;
$$;

REVOKE ALL ON FUNCTION _homework_progress(UUID) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION teacher_homework_progress()
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
  done_lessons     INTEGER,
  total_lessons    INTEGER,
  done             BOOLEAN,
  best_percent     INTEGER,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.assignment_id, p.student_id, p.done_lessons, p.total_lessons,
         (p.total_lessons > 0 AND p.done_lessons = p.total_lessons),
         p.best_percent, p.last_activity_at
  FROM _homework_progress((SELECT auth.uid())) p;
$$;

REVOKE ALL ON FUNCTION teacher_homework_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_homework_progress() TO authenticated;


-- What the assign dialog may offer: published courses and courses the caller
-- edits, each with its published non-archived lessons. Nothing for a
-- non-teacher.
CREATE OR REPLACE FUNCTION homework_assignable()
RETURNS TABLE (
  course_id      UUID,
  course_title   TEXT,
  course_slug    TEXT,
  course_edited  BOOLEAN,
  lesson_id      UUID,
  lesson_title   TEXT,
  lesson_ordinal INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.slug, can_edit_course(c.id, (SELECT auth.uid())),
         l.id, l.title, l.ordinal
  FROM courses c
  JOIN lessons l ON l.course_id = c.id
                AND l.published_version_id IS NOT NULL
                AND l.archived_at IS NULL
  WHERE _is_teacher((SELECT auth.uid()))
    AND (c.status = 'published' OR can_edit_course(c.id, (SELECT auth.uid())))
  ORDER BY can_edit_course(c.id, (SELECT auth.uid())) DESC, lower(c.title), c.id, l.ordinal, l.id;
$$;

REVOKE ALL ON FUNCTION homework_assignable() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION homework_assignable() TO authenticated;


-- ── 5. TCH-003's readers, widened ───────────────────────────────────────
-- Every lesson the teacher may read answers for, for one linked student: the
-- lessons of courses the teacher edits (078's rule) plus the lessons covered
-- by an assignment the student receives from this teacher. Empty unless the
-- link is active.
CREATE OR REPLACE FUNCTION _teacher_readable_lessons(p_teacher UUID, p_student UUID)
RETURNS TABLE (lesson_id UUID, course_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hw AS MATERIALIZED (
    SELECT a.course_id, a.lesson_id
    FROM _homework_recipients(p_teacher, p_student) r
    JOIN homework_assignments a ON a.id = r.assignment_id
    WHERE a.teacher_id = p_teacher
  )
  SELECT l.id, l.course_id
  FROM lessons l
  WHERE _teacher_linked(p_teacher, p_student)
    AND (
      can_edit_course(l.course_id, p_teacher)
      OR EXISTS (
        SELECT 1 FROM hw
        WHERE hw.course_id = l.course_id AND (hw.lesson_id IS NULL OR hw.lesson_id = l.id)
      )
    );
$$;

REVOKE ALL ON FUNCTION _teacher_readable_lessons(UUID, UUID) FROM PUBLIC, anon, authenticated;


-- Re-emitted from 078: the final can_edit_course filter becomes the join on
-- _teacher_readable_lessons. Same columns, same ordering.
CREATE OR REPLACE FUNCTION linked_student_attempts(p_student UUID)
RETURNS TABLE (
  attempt_id         UUID,
  course_id          UUID,
  lesson_id          UUID,
  lesson_version_id  UUID,
  block_id           TEXT,
  earned             NUMERIC,
  possible           NUMERIC,
  response           JSONB,
  created_at         TIMESTAMPTZ,
  block              JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id, l.course_id, l.id, a.lesson_version_id, a.block_id,
    a.earned, a.possible, a.response, a.created_at,
    ob.block
  FROM lesson_attempts a
  JOIN lesson_versions v ON v.id = a.lesson_version_id
  JOIN lessons l         ON l.id = v.lesson_id
  JOIN profiles p        ON p.id = a.user_id AND p.deleted_at IS NULL
  JOIN _teacher_readable_lessons((SELECT auth.uid()), p_student) rl ON rl.lesson_id = l.id
  LEFT JOIN LATERAL (
    SELECT b AS block
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) b
    WHERE b->>'id' = a.block_id AND b->>'kind' = 'practice'
    LIMIT 1
  ) ob ON TRUE
  WHERE a.user_id = p_student
    AND _teacher_linked((SELECT auth.uid()), p_student)
  ORDER BY l.course_id, l.ordinal, a.block_id, a.created_at;
$$;

REVOKE ALL ON FUNCTION linked_student_attempts(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION linked_student_attempts(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION linked_student_lesson_scores(p_student UUID)
RETURNS TABLE (
  course_id          UUID,
  lesson_id          UUID,
  best_percent       INTEGER,
  complete           BOOLEAN,
  exercises_answered INTEGER,
  exercises_total    INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.course_id, c.lesson_id, c.best_percent, c.complete,
         c.exercises_answered, c.exercises_total
  FROM lesson_completion(
         p_student,
         ARRAY(SELECT DISTINCT rl.course_id FROM _teacher_readable_lessons((SELECT auth.uid()), p_student) rl)
       ) c
  JOIN lessons l ON l.id = c.lesson_id
  JOIN _teacher_readable_lessons((SELECT auth.uid()), p_student) rl ON rl.lesson_id = l.id
  WHERE _teacher_linked((SELECT auth.uid()), p_student)
    AND p_student IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION linked_student_lesson_scores(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION linked_student_lesson_scores(UUID) TO authenticated;


-- The assigned lessons the teacher does NOT edit, titled, so Studio can show
-- the answers it now returns for them. Published, non-archived lessons only.
CREATE OR REPLACE FUNCTION linked_student_assigned_lessons(p_student UUID)
RETURNS TABLE (
  course_id      UUID,
  course_title   TEXT,
  lesson_id      UUID,
  lesson_title   TEXT,
  lesson_ordinal INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.course_id, c.title, l.id, l.title, l.ordinal
  FROM _teacher_readable_lessons((SELECT auth.uid()), p_student) rl
  JOIN lessons l ON l.id = rl.lesson_id
  JOIN courses c ON c.id = l.course_id
  WHERE NOT can_edit_course(l.course_id, (SELECT auth.uid()))
    AND l.published_version_id IS NOT NULL
    AND l.archived_at IS NULL
  ORDER BY lower(c.title), c.id, l.ordinal, l.id;
$$;

REVOKE ALL ON FUNCTION linked_student_assigned_lessons(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION linked_student_assigned_lessons(UUID) TO authenticated;


-- ── 6. Learner reads ────────────────────────────────────────────────────
-- plpgsql so a NULL auth.uid() returns before lesson_completion(NULL, ...),
-- which would otherwise mean "all users" (075 header).
CREATE OR REPLACE FUNCTION my_homework()
RETURNS TABLE (
  assignment_id UUID,
  teacher_name  TEXT,
  course_id     UUID,
  course_slug   TEXT,
  course_title  TEXT,
  lesson_id     UUID,
  lesson_slug   TEXT,
  lesson_title  TEXT,
  due_on        DATE,
  note          TEXT,
  created_at    TIMESTAMPTZ,
  done          BOOLEAN,
  done_lessons  INTEGER,
  total_lessons INTEGER,
  state         TEXT,
  opens_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH hw AS (
    SELECT a.*
    FROM homework_assignments a
    JOIN _homework_recipients(NULL, v_me) r ON r.assignment_id = a.id
    JOIN courses c ON c.id = a.course_id AND c.status = 'published'
    LEFT JOIN lessons l ON l.id = a.lesson_id
    WHERE a.lesson_id IS NULL
       OR (l.published_version_id IS NOT NULL AND l.archived_at IS NULL)
  ),
  scope AS (
    SELECT h.id AS aid, l.id AS lid
    FROM hw h
    JOIN lessons l ON l.course_id = h.course_id
                  AND l.published_version_id IS NOT NULL
                  AND l.archived_at IS NULL
    WHERE h.lesson_id IS NULL OR l.id = h.lesson_id
  ),
  comp AS (
    SELECT c.lesson_id AS lid, c.complete
    FROM lesson_completion(v_me, ARRAY(SELECT DISTINCT h.course_id FROM hw h)) c
  ),
  prog AS (
    SELECT s.aid,
           (count(*) FILTER (WHERE cp.complete))::INTEGER AS done_n,
           count(*)::INTEGER AS total_n
    FROM scope s
    LEFT JOIN comp cp ON cp.lid = s.lid
    GROUP BY s.aid
  )
  SELECT h.id,
         COALESCE(NULLIF(btrim(tp.display_name), ''), 'Your teacher'),
         h.course_id, c.slug, c.title,
         h.lesson_id, l.slug, l.title,
         h.due_on, h.note, h.created_at,
         (COALESCE(pr.total_n, 0) > 0 AND COALESCE(pr.done_n, 0) = COALESCE(pr.total_n, 0)),
         COALESCE(pr.done_n, 0), COALESCE(pr.total_n, 0),
         acc.state, acc.opens_at
  FROM hw h
  JOIN courses c   ON c.id = h.course_id
  JOIN profiles tp ON tp.id = h.teacher_id
  LEFT JOIN lessons l ON l.id = h.lesson_id
  LEFT JOIN prog pr   ON pr.aid = h.id
  LEFT JOIN LATERAL _lesson_access_at(h.lesson_id, v_me, now()) acc ON h.lesson_id IS NOT NULL
  ORDER BY
    (COALESCE(pr.total_n, 0) > 0 AND COALESCE(pr.done_n, 0) = COALESCE(pr.total_n, 0)),
    h.due_on NULLS LAST, h.created_at DESC, h.id;
END;
$$;

REVOKE ALL ON FUNCTION my_homework() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_homework() TO authenticated;


-- The caller's homework for the account export (privacy-policy.md §8): what
-- currently applies to them, whatever the course's state. The teacher's name
-- and the content titles; no other recipient, no teacher-side data.
CREATE OR REPLACE FUNCTION my_homework_export()
RETURNS TABLE (
  assignment_id UUID,
  teacher_name  TEXT,
  course_title  TEXT,
  lesson_title  TEXT,
  due_on        DATE,
  note          TEXT,
  assigned_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         COALESCE(NULLIF(btrim(tp.display_name), ''), 'Your teacher'),
         c.title, l.title, a.due_on, a.note, a.created_at
  FROM homework_assignments a
  JOIN _homework_recipients(NULL, (SELECT auth.uid())) r ON r.assignment_id = a.id
  JOIN courses c   ON c.id = a.course_id
  JOIN profiles tp ON tp.id = a.teacher_id
  LEFT JOIN lessons l ON l.id = a.lesson_id
  ORDER BY a.created_at DESC, a.id;
$$;

REVOKE ALL ON FUNCTION my_homework_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_homework_export() TO authenticated;


-- ── 7. delete_my_account (re-emitted from 079) ──────────────────────────
-- Verbatim from 079 with two added DELETEs, marked TCH-005.
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_blocking JSONB;
  v_voice    TEXT[];
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name))
    INTO v_blocking
  FROM groups g
  WHERE g.owner_id = v_me
    AND EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  IF v_blocking IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owns_groups', 'groups', v_blocking);
  END IF;

  DELETE FROM groups g
  WHERE g.owner_id = v_me
    AND NOT EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  DELETE FROM group_members WHERE user_id = v_me;

  -- Every object under the caller's segment, sent or not.
  SELECT COALESCE(array_agg(o.name ORDER BY o.name), ARRAY[]::TEXT[])
    INTO v_voice
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-recordings'
    AND (storage.foldername(o.name))[2] = v_me::text;
  INSERT INTO voice_object_deletions (object_name, reason)
  SELECT unnest(v_voice), 'account_deleted'
  ON CONFLICT (object_name) DO NOTHING;

  DELETE FROM voice_feedback f
  USING voice_submissions s
  WHERE s.id = f.submission_id AND s.user_id = v_me;
  DELETE FROM voice_submissions        WHERE user_id = v_me;
  DELETE FROM run_final_comments       WHERE user_id = v_me;

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_invites              WHERE claimed_by = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;
  -- TCH-001 (privacy-policy.md §9: "then deleted outright").
  DELETE FROM teacher_student_links    WHERE student_id = v_me OR teacher_id = v_me;
  DELETE FROM teacher_join_tokens      WHERE teacher_id = v_me;
  -- TCH-002: the caller's own groups (memberships cascade). Memberships of the
  -- caller as a student go with the link deletes above (trigger, section 3).
  DELETE FROM teacher_groups           WHERE teacher_id = v_me;
  -- TCH-004 (0144 Q4; privacy-policy.md §9): every conversation the caller is a
  -- party to, both sides. Messages (and anything a later card hangs off them)
  -- go with the conversation by ON DELETE CASCADE.
  DELETE FROM teacher_conversations    WHERE student_id = v_me OR teacher_id = v_me;
  -- TCH-005 (privacy-policy.md §9: "removed from the teacher's groups and homework"):
  -- the caller's own assignments (targets cascade) and, as a student, their direct
  -- targets. Group-derived homework ended with the 077 membership trigger.
  DELETE FROM homework_assignments     WHERE teacher_id = v_me;
  DELETE FROM homework_targets         WHERE student_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true, 'voice_objects', to_jsonb(v_voice));
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
