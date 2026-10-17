-- ============================================================
-- 084_calendar_events.sql
--
-- COH-014 (#217): a teacher adds dated events to a run or a group ("Test day",
-- "No call this week"; docs/decisions/0141 Decision 15). COH-015 draws them on
-- the calendar and COH-016 puts them in the .ics feed; this file is the data,
-- the write functions and the one reader. Choices made while writing it are in
-- docs/decisions/0158.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 083_seat_freeze.sql
--   latest body of the account-delete RPC   -> 082_author_seats.sql (NOT
--     re-emitted here: this file adds no user-keyed table. A group's events
--     go with the group, which delete_my_account already deletes (077); a
--     run's events go with the run, and a run belongs to a course, not a user)
-- REQUIRES 058 (course_runs, run_enrolments), 029 (can_edit_course),
-- 077 (teacher_groups, teacher_group_members) and 083 (_studio_can_write).
--
-- ── 1. calendar_events ──────────────────────────────────────────────────
-- title, starts_at, optional ends_at, optional https link. The scope is a run
-- XOR a group (a CHECK), never both and never neither. A group event stores
-- the group's teacher too, so a composite FK (group_id, teacher_id) ->
-- teacher_groups(id, teacher_id) makes "the event belongs to the group's own
-- teacher" a constraint, the same shape as 077's memberships. No grants and
-- no policy: every read and write is a SECURITY DEFINER function below.
--
-- ── 2. Writes ───────────────────────────────────────────────────────────
-- create/update/delete_calendar_event. ONE private check decides who may
-- write (_calendar_scope_check): a run needs can_edit_course on the run's
-- course, a group needs the caller to be its teacher, and then
-- _studio_can_write (083, docs/decisions/0155: a new Studio write calls it).
-- A caller who may not act at all hears 'forbidden' (run) or
-- 'group_not_found' / 'event_not_found' (group: the same answer as a group
-- that doesn't exist, as 077 does); only an authorised but frozen caller
-- hears 'seat_lapsed'.
--
-- ── 3. The one reader ───────────────────────────────────────────────────
-- calendar_events(): the events the caller may see, and nothing else.
--   * a run's events: to the run's LIVE enrolees (revoked_at IS NULL, either
--     tier) and to anyone who can edit the run's course;
--   * a group's events: to the group's members and to the group's teacher.
-- A member never receives the group's id or name (docs/decisions/0149: the
-- app shows no group name to a student); only the teacher does. `can_manage`
-- says whether the caller may write the event, so the UI never decides it.
-- Anonymous callers have no EXECUTE.
--
-- Not destructive: two new tables' worth of objects, no DROP, no TRUNCATE, no
-- UPDATE or DELETE of an existing row.
--
-- Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. calendar_events ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID        REFERENCES course_runs(id) ON DELETE CASCADE,
  group_id   UUID,
  teacher_id UUID,
  title      TEXT        NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 120),
  starts_at  TIMESTAMPTZ NOT NULL CHECK (starts_at > '-infinity' AND starts_at < 'infinity'),
  ends_at    TIMESTAMPTZ CHECK (ends_at IS NULL OR (ends_at > starts_at AND ends_at < 'infinity')),
  link       TEXT        CHECK (link IS NULL OR (char_length(link) <= 2000 AND link ~ '^https://\S+$')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_one_scope CHECK ((run_id IS NULL) <> (group_id IS NULL)),
  CONSTRAINT calendar_events_group_teacher CHECK ((group_id IS NULL) = (teacher_id IS NULL)),
  CONSTRAINT calendar_events_group_fk
    FOREIGN KEY (group_id, teacher_id) REFERENCES teacher_groups (id, teacher_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS calendar_events_run_idx   ON calendar_events (run_id, starts_at)   WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendar_events_group_idx ON calendar_events (group_id, starts_at) WHERE group_id IS NOT NULL;

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE calendar_events FROM PUBLIC, anon, authenticated;


-- ── 2. Writes ───────────────────────────────────────────────────────────
-- NULL when the caller may write to that scope, else the error code.
CREATE OR REPLACE FUNCTION _calendar_scope_check(p_run UUID, p_group UUID, p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course UUID;
BEGIN
  IF (p_run IS NULL) = (p_group IS NULL) THEN
    RETURN 'invalid_scope';
  END IF;

  IF p_run IS NOT NULL THEN
    SELECT course_id INTO v_course FROM course_runs WHERE id = p_run;
    IF v_course IS NULL THEN
      RETURN 'run_not_found';
    END IF;
    IF NOT can_edit_course(v_course, p_user) THEN
      RETURN 'forbidden';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM teacher_groups WHERE id = p_group AND teacher_id = p_user) THEN
      RETURN 'group_not_found';
    END IF;
  END IF;

  -- TCH-008 (docs/decisions/0155): a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(p_user) THEN
    RETURN 'seat_lapsed';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION _calendar_scope_check(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;


-- The field rules, one place for create and update. NULL when valid.
CREATE OR REPLACE FUNCTION _calendar_event_fields_check(p_title TEXT, p_starts TIMESTAMPTZ, p_ends TIMESTAMPTZ, p_link TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN char_length(COALESCE(btrim(p_title), '')) NOT BETWEEN 1 AND 120 THEN 'invalid_event_title'
    WHEN p_starts IS NULL OR p_starts = 'infinity' OR p_starts = '-infinity' THEN 'invalid_starts_at'
    WHEN p_ends IS NOT NULL AND (p_ends = 'infinity' OR p_ends = '-infinity' OR p_ends <= p_starts) THEN 'invalid_event_ends_at'
    WHEN NULLIF(btrim(p_link), '') IS NOT NULL
         AND (char_length(btrim(p_link)) > 2000 OR btrim(p_link) !~ '^https://\S+$') THEN 'invalid_url'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION _calendar_event_fields_check(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;


-- Exactly one of p_run, p_group.
CREATE OR REPLACE FUNCTION create_calendar_event(
  p_run       UUID,
  p_group     UUID,
  p_title     TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at   TIMESTAMPTZ DEFAULT NULL,
  p_link      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  UUID := (SELECT auth.uid());
  v_err TEXT;
  v_id  UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  v_err := _calendar_scope_check(p_run, p_group, v_me);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;
  v_err := _calendar_event_fields_check(p_title, p_starts_at, p_ends_at, p_link);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  INSERT INTO calendar_events (run_id, group_id, teacher_id, title, starts_at, ends_at, link)
  VALUES (p_run, p_group, CASE WHEN p_group IS NOT NULL THEN v_me END,
          btrim(p_title), p_starts_at, p_ends_at, NULLIF(btrim(p_link), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_calendar_event(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_calendar_event(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;


-- A full replace of title, times and link; the scope never changes.
CREATE OR REPLACE FUNCTION update_calendar_event(
  p_event     UUID,
  p_title     TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at   TIMESTAMPTZ,
  p_link      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_run   UUID;
  v_group UUID;
  v_err   TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT run_id, group_id INTO v_run, v_group FROM calendar_events WHERE id = p_event;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;
  v_err := _calendar_scope_check(v_run, v_group, v_me);
  IF v_err = 'group_not_found' THEN
    v_err := 'event_not_found';
  END IF;
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;
  v_err := _calendar_event_fields_check(p_title, p_starts_at, p_ends_at, p_link);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  UPDATE calendar_events
     SET title = btrim(p_title), starts_at = p_starts_at, ends_at = p_ends_at, link = NULLIF(btrim(p_link), '')
   WHERE id = p_event;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_calendar_event(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_calendar_event(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION delete_calendar_event(p_event UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_run   UUID;
  v_group UUID;
  v_err   TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT run_id, group_id INTO v_run, v_group FROM calendar_events WHERE id = p_event;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;
  v_err := _calendar_scope_check(v_run, v_group, v_me);
  IF v_err = 'group_not_found' THEN
    v_err := 'event_not_found';
  END IF;
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  DELETE FROM calendar_events WHERE id = p_event;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_calendar_event(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_calendar_event(UUID) TO authenticated;


-- ── 3. The one reader ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calendar_events()
RETURNS TABLE (
  event_id   UUID,
  scope      TEXT,
  run_id     UUID,
  course_id  UUID,
  group_id   UUID,
  title      TEXT,
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  link       TEXT,
  can_manage BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, 'run'::text, e.run_id, r.course_id, NULL::uuid,
         e.title, e.starts_at, e.ends_at, e.link,
         can_edit_course(r.course_id, (SELECT auth.uid()))
  FROM calendar_events e
  JOIN course_runs r ON r.id = e.run_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      can_edit_course(r.course_id, (SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM run_enrolments en
        WHERE en.run_id = r.id
          AND en.user_id = (SELECT auth.uid())
          AND en.revoked_at IS NULL
      )
    )
  UNION ALL
  -- The group's id leaves only to its teacher; a member gets NULL.
  SELECT e.id, 'group'::text, NULL::uuid, NULL::uuid,
         CASE WHEN g.teacher_id = (SELECT auth.uid()) THEN e.group_id END,
         e.title, e.starts_at, e.ends_at, e.link,
         g.teacher_id = (SELECT auth.uid())
  FROM calendar_events e
  JOIN teacher_groups g ON g.id = e.group_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      g.teacher_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM teacher_group_members m
        WHERE m.group_id = e.group_id AND m.student_id = (SELECT auth.uid())
      )
    )
  ORDER BY 7, 1;
$$;

REVOKE ALL ON FUNCTION calendar_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION calendar_events() TO authenticated;

COMMIT;
