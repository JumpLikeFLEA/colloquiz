-- ============================================================
-- 058_cohort_schema.sql
--
-- COH-002. Writes what COH-001 decided (docs/decisions/0093), with the
-- cohort part of CNT-011 (docs/decisions/0094 Decisions 2 and 4): runs,
-- weeks, enrolment and tier, calls, courses.format, revocation, the editor
-- functions for runs, weeks and calls (the 044 precedent: schema and RPCs
-- together; AUTH-010 is UI only), and the schedule branch inside the access
-- function. Choices made while writing it are in docs/decisions/0105.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 057_drop_set_lesson_free_sample.sql
--   latest body of the account-delete RPC   -> 056_lesson_opens.sql
-- (the exact commands are in the section header; they are not quoted here
-- because quoting the second one's pattern would make this file match it).
-- Re-emitted bodies, each from its latest definition (rg over
-- supabase/migrations):
--   has_course_entitlement   044:108
--   can_read_lesson          055:138
--   course_lesson_states     055:172
--   set_lesson_access_level  055:265
--   create_lesson            055:335
--   publish_course           055:409
--   publish_lesson           046:185
--   delete_my_account        056 (the account-delete RPC)
--
-- ── 1. Columns ──────────────────────────────────────────────────────────
-- courses.format (self_paced | cohort, default self_paced, so every
-- existing course keeps its behaviour); courses.how_to_join_url (https
-- only, shown to a visitor who is not enrolled, 0093); lessons.week
-- (NULL or >= 1; required at publish for an `entitled` lesson of a cohort
-- course); course_entitlements.revoked_at (0093 "course_entitlements.
-- revoked_at", so "revoked_at IS NULL" is the one rule everywhere).
--
-- ── 2. Tables ───────────────────────────────────────────────────────────
-- course_runs, run_enrolments, run_calls, as 0093's sketch. RLS on all
-- three, REVOKE ALL from the app roles; writes only through the RPCs below.
--   course_runs     SELECT: published course, editor, or the caller's own
--                   enrolment (0105 Decision 3). A run's dates are what the
--                   course page shows a visitor (0093 "Non-enrolled visitor").
--   run_enrolments  SELECT: owner only (the export reads it with the
--                   caller's session, the lesson_opens precedent, 056).
--                   No writer here: COH-003's claim writes it.
--   run_calls       no grants at all; read only through course_calls().
--
-- ── 3. The access function ──────────────────────────────────────────────
-- _lesson_access_at(lesson, user, now) -> (state, opens_at) holds every
-- rule, in this order:
--   editor of the course                                     -> open
--   course published, lesson published, not archived, and
--     level anyone, or signed_in with a user                 -> open
--   lesson published and an active grant (revoked_at NULL)   -> open,
--     schedule ignored (0093 b)
--   lesson published and an active enrolment in a run of the
--     course whose unlock moment has passed                  -> open
--   lesson published and an active enrolment, not yet       -> scheduled,
--     unlocked                                                  opens_at
--   level signed_in, no user                                 -> needs_sign_in
--   anything else                                            -> needs_entitlement
-- The unlock moment of a lesson in a run R:
--   level anyone / signed_in -> immediately (0094 Decision 4: the schedule
--                               governs entitled lessons only);
--   entitled, week N         -> LEAST(R.starts_at + 7*(N-1) days, R.ends_at);
--   entitled, week NULL      -> R.ends_at (fails closed; the editing rules
--                               below make it unreachable, 0105 Decision 2).
-- Open in ANY of the caller's non-revoked runs -> open (0093 Decision 4).
-- opens_at = the earliest unlock moment over those runs.
-- It has NO grants: tests pass a user and a clock, a client cannot pass a
-- future clock (0093 "State function"). can_read_lesson and
-- course_lesson_states call it with auth.uid() and now().
--
-- has_course_entitlement keeps its meaning "some course-level access
-- exists" (an active grant OR an active enrolment) and is used ONLY for
-- metadata visibility, i.e. the "lessons: published read" policy (044:183)
-- and the state function's row set. can_read_lesson, and through it the
-- "lesson_versions: published content read" policy (041:256), switch to
-- the schedule-aware function: the hazard in 0093.
--
-- ── 4. No re-lock (0093 Decision 5 as revised, 0094 Decision 4) ─────────
-- In progress = starts_at <= now() < ends_at. While some run of a course
-- is in progress, for a lesson with a published_version_id:
--   * lessons.week may not increase (NULL counts as later than any week:
--     an entitled lesson with no week opens only at the run's end);
--   * access_level may not be raised to `entitled`.
-- Always allowed: any change to a never-published lesson, a decrease, a
-- lowering of the level, and any edit while no run is in progress.
-- A run's starts_at is editable until the run starts and frozen after; a
-- started run's ends_at may move earlier (an early close) but not later.
-- Enforced twice: friendly errors in the RPCs, and BEFORE triggers on
-- lessons and course_runs as a backstop no write path skips.
--
-- ── 5. ends_at (0093 a) ─────────────────────────────────────────────────
-- Stored, not derived. For a run that has not started it is recomputed as
-- starts_at + 7 days * max(week) over the course's `entitled` lessons with a
-- week, drafts included, by the course_runs trigger (on insert and on every
-- update) and by a lessons trigger (on a week / level change, insert or
-- delete). Once the run has started, nothing recomputes it.
--
-- ── 6. Format ───────────────────────────────────────────────────────────
-- courses.format is immutable once the course has a run (trigger +
-- set_course_format). The "at least one `anyone` lesson" rule (055, 0099
-- Decision 1) now applies to self_paced courses only, and create_lesson
-- writes `anyone` for the first lesson of a self_paced course only (0094
-- Decision 2). A run can be created only on a cohort course.
--
-- ── 7. Export and deletion ──────────────────────────────────────────────
-- delete_my_account re-emitted from 056 with two added DELETEs:
-- run_enrolments (0093 "Enrolments": ADR 0002 anonymises the profile, so
-- the FK cascade never fires) and course_entitlements. The export reads
-- both with the caller's session (app/api/account/export/route.ts).
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS, constraints dropped and
-- re-added, CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY / TRIGGER IF
-- EXISTS before each, every function CREATE OR REPLACE. No backfill: every
-- existing course takes the self_paced default, which changes nothing.
-- ============================================================

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────────
ALTER TABLE courses ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'self_paced';
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_format_check;
ALTER TABLE courses
  ADD CONSTRAINT courses_format_check CHECK (format IN ('self_paced', 'cohort'));

ALTER TABLE courses ADD COLUMN IF NOT EXISTS how_to_join_url TEXT;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_how_to_join_url_check;
ALTER TABLE courses
  ADD CONSTRAINT courses_how_to_join_url_check
  CHECK (how_to_join_url IS NULL OR how_to_join_url ~ '^https://\S+$');

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS week SMALLINT;
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_week_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_week_check CHECK (week IS NULL OR week >= 1);

ALTER TABLE course_entitlements ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN courses.format IS
  'self_paced | cohort. Immutable once the course has a run (docs/decisions/0093).';
COMMENT ON COLUMN lessons.week IS
  'Cohort week (>= 1). Governs entitled lessons only; week N opens at a run''s start + 7*(N-1) days (docs/decisions/0093).';
COMMENT ON COLUMN course_entitlements.revoked_at IS
  'Set on revocation; the row is kept. Access requires revoked_at IS NULL.';


-- ── 2. Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_runs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      TEXT,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_runs_ends_after_start CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS course_runs_course_idx ON course_runs (course_id, starts_at);

CREATE TABLE IF NOT EXISTS run_enrolments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID        NOT NULL REFERENCES course_runs(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  tier        TEXT        NOT NULL CHECK (tier IN ('basic', 'extended')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  source_ref  TEXT
);
-- 0093 c: a revoked row stays as history; re-enrolling adds a new row.
CREATE UNIQUE INDEX IF NOT EXISTS run_enrolments_one_active
  ON run_enrolments (run_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS run_enrolments_user_idx ON run_enrolments (user_id);

CREATE TABLE IF NOT EXISTS run_calls (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id    UUID        NOT NULL REFERENCES course_runs(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  meet_url  TEXT        NOT NULL CHECK (meet_url ~ '^https://\S+$'),
  title     TEXT
);
CREATE INDEX IF NOT EXISTS run_calls_run_idx ON run_calls (run_id, starts_at);

ALTER TABLE course_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_calls      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_runs    FROM anon, authenticated;
REVOKE ALL ON TABLE run_enrolments FROM anon, authenticated;
REVOKE ALL ON TABLE run_calls      FROM anon, authenticated;
GRANT SELECT ON TABLE course_runs    TO anon, authenticated;
GRANT SELECT ON TABLE run_enrolments TO authenticated;

DROP POLICY IF EXISTS "run_enrolments: owner read" ON run_enrolments;
CREATE POLICY "run_enrolments: owner read"
  ON run_enrolments FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_runs: published read" ON course_runs;
CREATE POLICY "course_runs: published read"
  ON course_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.id = course_runs.course_id AND c.status = 'published'));

DROP POLICY IF EXISTS "course_runs: editor read" ON course_runs;
CREATE POLICY "course_runs: editor read"
  ON course_runs FOR SELECT
  USING (can_edit_course(course_runs.course_id, (SELECT auth.uid())));

-- A policy runs as the CALLING role, so an EXISTS over run_enrolments here
-- would need a SELECT grant on it for anon too: without one, every anon
-- read of course_runs fails with "permission denied for table
-- run_enrolments" (seen in this card's first protocol run; the same
-- mistake 044 made and fixed, docs/decisions/0025 Decision 4). The
-- question goes through a SECURITY DEFINER predicate instead, which only
-- answers for the caller's own rows. Revoked enrolments count: the run is
-- part of that learner's history (export, roster).
CREATE OR REPLACE FUNCTION is_enrolled_in_run(p_run_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM run_enrolments
    WHERE run_id = p_run_id AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION is_enrolled_in_run(UUID) FROM public;
GRANT EXECUTE ON FUNCTION is_enrolled_in_run(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "course_runs: enrolled read" ON course_runs;
CREATE POLICY "course_runs: enrolled read"
  ON course_runs FOR SELECT
  USING (is_enrolled_in_run(course_runs.id));


-- ── 3a. Helpers (no grants) ─────────────────────────────────────────────
-- The end a run that has not started gets: starts_at + 7 days x the highest
-- week among the course's entitled lessons, drafts included (0093 a). NULL
-- when no entitled lesson has a week.
CREATE OR REPLACE FUNCTION _course_run_end(p_course_id UUID, p_starts_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_starts_at + make_interval(days => 7 * MAX(week))
  FROM lessons
  WHERE course_id = p_course_id AND access_level = 'entitled' AND week IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION _course_run_in_progress(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_runs
    WHERE course_id = p_course_id AND starts_at <= now() AND now() < ends_at
  );
$$;

REVOKE ALL ON FUNCTION _course_run_end(UUID, TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION _course_run_in_progress(UUID)      FROM public, anon, authenticated;


-- ── 3b. _lesson_access_at: every access rule, for a given user and clock ─
CREATE OR REPLACE FUNCTION _lesson_access_at(p_lesson_id UUID, p_user_id UUID, p_now TIMESTAMPTZ)
RETURNS TABLE (state TEXT, opens_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH k AS (
    SELECT
      l.access_level,
      l.published_version_id IS NOT NULL AS published,
      can_edit_course(l.course_id, p_user_id) AS is_editor,
      (
        c.status = 'published'
        AND l.published_version_id IS NOT NULL
        AND l.archived_at IS NULL
        AND (
          l.access_level = 'anyone'
          OR (l.access_level = 'signed_in' AND p_user_id IS NOT NULL)
        )
      ) AS level_open,
      EXISTS (
        SELECT 1 FROM course_entitlements ce
        WHERE ce.user_id = p_user_id
          AND ce.course_id = l.course_id
          AND ce.revoked_at IS NULL
      ) AS has_grant,
      (
        SELECT MIN(
          CASE
            WHEN l.access_level <> 'entitled' THEN '-infinity'::TIMESTAMPTZ
            WHEN l.week IS NULL THEN r.ends_at
            ELSE LEAST(r.starts_at + make_interval(days => 7 * (l.week - 1)), r.ends_at)
          END
        )
        FROM run_enrolments e
        JOIN course_runs r ON r.id = e.run_id
        WHERE e.user_id = p_user_id
          AND e.revoked_at IS NULL
          AND r.course_id = l.course_id
      ) AS unlock_at
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = p_lesson_id
  )
  SELECT
    CASE
      WHEN is_editor OR level_open                THEN 'open'
      WHEN published AND has_grant                THEN 'open'
      WHEN published AND unlock_at <= p_now       THEN 'open'
      WHEN published AND unlock_at IS NOT NULL    THEN 'scheduled'
      WHEN access_level = 'signed_in' AND p_user_id IS NULL THEN 'needs_sign_in'
      ELSE 'needs_entitlement'
    END,
    CASE
      WHEN NOT (is_editor OR level_open OR (published AND has_grant))
           AND published AND unlock_at > p_now
      THEN unlock_at
    END
  FROM k;
$$;

REVOKE ALL ON FUNCTION _lesson_access_at(UUID, UUID, TIMESTAMPTZ) FROM public, anon, authenticated;


-- ── 3c. has_course_entitlement (re-emitted from 044:108) ────────────────
-- Metadata visibility only (see header §3). An active grant OR an active
-- enrolment in any run of the course.
CREATE OR REPLACE FUNCTION has_course_entitlement(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_entitlements
    WHERE user_id = (SELECT auth.uid())
      AND course_id = p_course_id
      AND revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM run_enrolments e
    JOIN course_runs r ON r.id = e.run_id
    WHERE e.user_id = (SELECT auth.uid())
      AND r.course_id = p_course_id
      AND e.revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION has_course_entitlement(UUID) TO anon, authenticated;


-- ── 3d. can_read_lesson (re-emitted from 055:138) ───────────────────────
-- Same contract (BOOLEAN, never NULL); the body is now the one access
-- function at the caller and the transaction's clock.
CREATE OR REPLACE FUNCTION can_read_lesson(p_lesson_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT a.state = 'open'
     FROM _lesson_access_at(p_lesson_id, (SELECT auth.uid()), now()) a),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION can_read_lesson(UUID) TO anon, authenticated;


-- ── 3e. course_lesson_states (re-emitted from 055:172) ──────────────────
-- Return shape unchanged. state gains 'scheduled' (with opens_at); the
-- other three keep their meaning. Now SECURITY DEFINER, because
-- _lesson_access_at has no grants; the row set therefore states the RLS
-- rule itself instead of inheriting it: a published lesson that "lessons:
-- published read" shows the caller (listed, or has_course_entitlement),
-- or that the caller can open (an editor's archived lesson, 0099
-- Decision 5). lesson_state (055:202) filters this function and is
-- unchanged.
CREATE OR REPLACE FUNCTION course_lesson_states(p_course_id UUID)
RETURNS TABLE (lesson_id UUID, access_level TEXT, state TEXT, opens_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT l.id, l.access_level, a.state, a.opens_at
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  CROSS JOIN LATERAL _lesson_access_at(l.id, (SELECT auth.uid()), now()) a
  WHERE l.course_id = p_course_id
    AND l.published_version_id IS NOT NULL
    AND (
      (l.archived_at IS NULL AND c.status = 'published')
      OR has_course_entitlement(l.course_id)
      OR a.state = 'open'
    )
  ORDER BY l.ordinal, l.id;
$$;

REVOKE ALL ON FUNCTION course_lesson_states(UUID) FROM public;
GRANT EXECUTE ON FUNCTION course_lesson_states(UUID) TO anon, authenticated;


-- ── 4. Triggers (backstops) ─────────────────────────────────────────────
-- course_runs: run only on a cohort course; ends_at computed while the run
-- has not started; starts_at frozen and ends_at only shortened once it has.
CREATE OR REPLACE FUNCTION _course_runs_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = NEW.course_id AND format = 'cohort') THEN
      RAISE EXCEPTION 'not_cohort_course' USING ERRCODE = 'check_violation';
    END IF;
    v_end := _course_run_end(NEW.course_id, NEW.starts_at);
    IF v_end IS NULL THEN
      RAISE EXCEPTION 'no_scheduled_lessons' USING ERRCODE = 'check_violation';
    END IF;
    NEW.ends_at := v_end;
    RETURN NEW;
  END IF;

  IF NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'run_course_immutable' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.starts_at <= now() THEN
    IF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
      RAISE EXCEPTION 'run_started' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.ends_at > OLD.ends_at THEN
      RAISE EXCEPTION 'cannot_extend_started_run' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Not started: derived. With no entitled week left, keep one week, so
    -- the CHECK holds; nothing can open early because nothing is scheduled.
    NEW.ends_at := COALESCE(
      _course_run_end(NEW.course_id, NEW.starts_at),
      NEW.starts_at + INTERVAL '7 days'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION _course_runs_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS course_runs_guard ON course_runs;
CREATE TRIGGER course_runs_guard
  BEFORE INSERT OR UPDATE ON course_runs
  FOR EACH ROW EXECUTE FUNCTION _course_runs_guard();

-- lessons: the freeze (header §4).
CREATE OR REPLACE FUNCTION _lessons_schedule_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.published_version_id IS NOT NULL AND _course_run_in_progress(OLD.course_id) THEN
    IF OLD.week IS NOT NULL AND (NEW.week IS NULL OR NEW.week > OLD.week) THEN
      RAISE EXCEPTION 'week_frozen' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.access_level = 'entitled' AND OLD.access_level <> 'entitled' THEN
      RAISE EXCEPTION 'access_level_frozen' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION _lessons_schedule_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS lessons_schedule_guard ON lessons;
CREATE TRIGGER lessons_schedule_guard
  BEFORE UPDATE OF week, access_level ON lessons
  FOR EACH ROW EXECUTE FUNCTION _lessons_schedule_guard();

-- lessons: recompute ends_at of the course's runs that have not started.
-- The UPDATE re-enters course_runs_guard, which does the arithmetic.
CREATE OR REPLACE FUNCTION _lessons_recompute_run_ends()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_id ELSE NEW.course_id END;
BEGIN
  UPDATE course_runs SET starts_at = starts_at
  WHERE course_id = v_course AND starts_at > now();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION _lessons_recompute_run_ends() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS lessons_recompute_run_ends ON lessons;
CREATE TRIGGER lessons_recompute_run_ends
  AFTER INSERT OR DELETE OR UPDATE OF week, access_level ON lessons
  FOR EACH ROW EXECUTE FUNCTION _lessons_recompute_run_ends();

-- courses: format is immutable once the course has a run.
CREATE OR REPLACE FUNCTION _courses_format_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.format IS DISTINCT FROM OLD.format
     AND EXISTS (SELECT 1 FROM course_runs WHERE course_id = OLD.id) THEN
    RAISE EXCEPTION 'format_locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION _courses_format_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS courses_format_guard ON courses;
CREATE TRIGGER courses_format_guard
  BEFORE UPDATE OF format ON courses
  FOR EACH ROW EXECUTE FUNCTION _courses_format_guard();

-- run_enrolments: no claim into an ended run (0093 "Run lifecycle"); run
-- and learner are immutable; a revocation is never undone (0093 c: re-
-- enrolling adds a new row).
CREATE OR REPLACE FUNCTION _run_enrolments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM course_runs WHERE id = NEW.run_id AND now() >= ends_at) THEN
      RAISE EXCEPTION 'run_ended' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'enrolment_immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'revocation_final' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION _run_enrolments_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS run_enrolments_guard ON run_enrolments;
CREATE TRIGGER run_enrolments_guard
  BEFORE INSERT OR UPDATE ON run_enrolments
  FOR EACH ROW EXECUTE FUNCTION _run_enrolments_guard();


-- ── 5. Editor functions: course format and join link ────────────────────
-- Every editor function returns { ok, error } and is gated on
-- can_edit_course, checked before anything else is revealed beyond
-- "not found".
CREATE OR REPLACE FUNCTION set_course_format(p_course_id UUID, p_format TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_status TEXT;
  v_format TEXT;
BEGIN
  SELECT status, format INTO v_status, v_format FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_format IS NULL OR p_format NOT IN ('self_paced', 'cohort') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;
  IF p_format = v_format THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF EXISTS (SELECT 1 FROM course_runs WHERE course_id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'format_locked');
  END IF;
  -- Becoming self-paced brings back the open-lesson rule (0094 Decision 2).
  IF p_format = 'self_paced' AND v_status = 'published' AND NOT EXISTS (
    SELECT 1 FROM lessons
    WHERE course_id = p_course_id AND access_level = 'anyone' AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE courses SET format = p_format WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_course_format(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_course_format(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION set_course_how_to_join_url(p_course_id UUID, p_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  UUID := (SELECT auth.uid());
  v_url TEXT := NULLIF(btrim(p_url), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_url IS NOT NULL AND v_url !~ '^https://\S+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_url');
  END IF;

  UPDATE courses SET how_to_join_url = v_url WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_course_how_to_join_url(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_course_how_to_join_url(UUID, TEXT) TO authenticated;


-- ── 6. Editor functions: weeks ──────────────────────────────────────────
-- Separate from update_lesson (044:276), as the level is (0018 Decision 4),
-- so update_lesson's signature and its caller stay as they are (0105
-- Decision 1). The course row is locked FOR UPDATE, so a week change and
-- a create_run on the same course serialise.
CREATE OR REPLACE FUNCTION set_lesson_week(p_lesson_id UUID, p_week INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_old_week  SMALLINT;
  v_level     TEXT;
  v_published BOOLEAN;
  v_format    TEXT;
BEGIN
  SELECT course_id, week, access_level, published_version_id IS NOT NULL
  INTO v_course, v_old_week, v_level, v_published
  FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_week IS NOT NULL AND (p_week < 1 OR p_week > 32767) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_week');
  END IF;

  SELECT format INTO v_format FROM courses WHERE id = v_course FOR UPDATE;

  IF p_week IS NULL AND v_format = 'cohort' AND v_published AND v_level = 'entitled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'week_required');
  END IF;
  IF v_published
     AND v_old_week IS NOT NULL
     AND (p_week IS NULL OR p_week > v_old_week)
     AND _course_run_in_progress(v_course) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'week_frozen');
  END IF;

  UPDATE lessons SET week = p_week WHERE id = p_lesson_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_week(UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_week(UUID, INT) TO authenticated;


-- ── 7. Editor functions: runs ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_run(p_course_id UUID, p_starts_at TIMESTAMPTZ, p_title TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_format TEXT;
  v_end    TIMESTAMPTZ;
  v_id     UUID;
BEGIN
  SELECT format INTO v_format FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_format <> 'cohort' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_cohort_course');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  v_end := _course_run_end(p_course_id, p_starts_at);
  IF v_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_scheduled_lessons');
  END IF;

  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
  VALUES (p_course_id, NULLIF(btrim(p_title), ''), p_starts_at, v_end)
  RETURNING id, ends_at INTO v_id, v_end;

  RETURN jsonb_build_object('ok', true, 'run_id', v_id, 'ends_at', v_end);
END;
$$;

REVOKE ALL ON FUNCTION create_run(UUID, TIMESTAMPTZ, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_run(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- Full replace of the editable fields (update_lesson's contract, 044):
-- passing a started run's current starts_at back is how its title is
-- edited.
CREATE OR REPLACE FUNCTION update_run(p_run_id UUID, p_starts_at TIMESTAMPTZ, p_title TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_start  TIMESTAMPTZ;
  v_end    TIMESTAMPTZ;
BEGIN
  SELECT course_id, starts_at INTO v_course, v_start FROM course_runs WHERE id = p_run_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  IF v_start <= now() AND p_starts_at IS DISTINCT FROM v_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_started');
  END IF;

  UPDATE course_runs
  SET starts_at = p_starts_at, title = NULLIF(btrim(p_title), '')
  WHERE id = p_run_id
  RETURNING ends_at INTO v_end;

  RETURN jsonb_build_object('ok', true, 'ends_at', v_end);
END;
$$;

REVOKE ALL ON FUNCTION update_run(UUID, TIMESTAMPTZ, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_run(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- An early close: a started run's end moves earlier (default: now). Only
-- ever unlocks (after the end every lesson is open), never re-locks.
CREATE OR REPLACE FUNCTION close_run(p_run_id UUID, p_ends_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_start  TIMESTAMPTZ;
  v_end    TIMESTAMPTZ;
  v_new    TIMESTAMPTZ := COALESCE(p_ends_at, now());
BEGIN
  SELECT course_id, starts_at, ends_at INTO v_course, v_start, v_end
  FROM course_runs WHERE id = p_run_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_start > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_started');
  END IF;
  IF v_new > v_end THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_extend_started_run');
  END IF;
  IF v_new <= v_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ends_at');
  END IF;

  UPDATE course_runs SET ends_at = v_new WHERE id = p_run_id;
  RETURN jsonb_build_object('ok', true, 'ends_at', v_new);
END;
$$;

REVOKE ALL ON FUNCTION close_run(UUID, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION close_run(UUID, TIMESTAMPTZ) TO authenticated;

-- Only a run that has not started and has never had an enrolment (revoked
-- rows included: they are roster history, 0093 Decision 3).
CREATE OR REPLACE FUNCTION delete_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_start  TIMESTAMPTZ;
BEGIN
  SELECT course_id, starts_at INTO v_course, v_start FROM course_runs WHERE id = p_run_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_start <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_started');
  END IF;
  IF EXISTS (SELECT 1 FROM run_enrolments WHERE run_id = p_run_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_has_enrolments');
  END IF;

  DELETE FROM course_runs WHERE id = p_run_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_run(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_run(UUID) TO authenticated;


-- ── 8. Editor functions: calls; and the one reader ──────────────────────
CREATE OR REPLACE FUNCTION create_call(p_run_id UUID, p_starts_at TIMESTAMPTZ, p_meet_url TEXT, p_title TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_url    TEXT := btrim(p_meet_url);
  v_id     UUID;
BEGIN
  SELECT course_id INTO v_course FROM course_runs WHERE id = p_run_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  IF v_url IS NULL OR v_url !~ '^https://\S+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_url');
  END IF;

  INSERT INTO run_calls (run_id, starts_at, meet_url, title)
  VALUES (p_run_id, p_starts_at, v_url, NULLIF(btrim(p_title), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'call_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_call(UUID, TIMESTAMPTZ, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_call(UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION update_call(p_call_id UUID, p_starts_at TIMESTAMPTZ, p_meet_url TEXT, p_title TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_url    TEXT := btrim(p_meet_url);
BEGIN
  SELECT r.course_id INTO v_course
  FROM run_calls k JOIN course_runs r ON r.id = k.run_id
  WHERE k.id = p_call_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'call_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  IF v_url IS NULL OR v_url !~ '^https://\S+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_url');
  END IF;

  UPDATE run_calls
  SET starts_at = p_starts_at, meet_url = v_url, title = NULLIF(btrim(p_title), '')
  WHERE id = p_call_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_call(UUID, TIMESTAMPTZ, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_call(UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION delete_call(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
BEGIN
  SELECT r.course_id INTO v_course
  FROM run_calls k JOIN course_runs r ON r.id = k.run_id
  WHERE k.id = p_call_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'call_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM run_calls WHERE id = p_call_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_call(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_call(UUID) TO authenticated;

-- Rows only for an editor of the course (every run) and for a learner with
-- a non-revoked `extended` enrolment (that run only). Everyone else gets
-- zero rows, the same as a course with no calls (0093 "Calls").
CREATE OR REPLACE FUNCTION course_calls(p_course_id UUID)
RETURNS TABLE (call_id UUID, run_id UUID, starts_at TIMESTAMPTZ, meet_url TEXT, title TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT k.id, k.run_id, k.starts_at, k.meet_url, k.title
  FROM run_calls k
  JOIN course_runs r ON r.id = k.run_id
  WHERE r.course_id = p_course_id
    AND (
      can_edit_course(p_course_id, (SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM run_enrolments e
        WHERE e.run_id = r.id
          AND e.user_id = (SELECT auth.uid())
          AND e.revoked_at IS NULL
          AND e.tier = 'extended'
      )
    )
  ORDER BY k.starts_at, k.id;
$$;

REVOKE ALL ON FUNCTION course_calls(UUID) FROM public;
GRANT EXECUTE ON FUNCTION course_calls(UUID) TO anon, authenticated;


-- ── 9a. set_lesson_access_level (re-emitted from 055:265) ───────────────
-- Three changes: the open-lesson rule applies to self_paced courses only
-- (0094 Decision 2); raising a published lesson to `entitled` while a run
-- is in progress is refused (0094 Decision 4); and raising a published
-- lesson of a cohort course to `entitled` needs a week first (header §1).
CREATE OR REPLACE FUNCTION set_lesson_access_level(p_lesson_id UUID, p_level TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_status    TEXT;
  v_format    TEXT;
  v_old_level TEXT;
  v_week      SMALLINT;
  v_published BOOLEAN;
BEGIN
  SELECT course_id, access_level, week, published_version_id IS NOT NULL
  INTO v_course, v_old_level, v_week, v_published
  FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('anyone', 'signed_in', 'entitled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_access_level');
  END IF;

  SELECT status, format INTO v_status, v_format FROM courses WHERE id = v_course FOR UPDATE;

  IF v_format = 'self_paced'
     AND v_status = 'published'
     AND p_level <> 'anyone'
     AND NOT EXISTS (
       SELECT 1 FROM lessons
       WHERE course_id = v_course
         AND id <> p_lesson_id
         AND access_level = 'anyone'
         AND archived_at IS NULL
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  IF p_level = 'entitled' AND v_old_level <> 'entitled' AND v_published THEN
    IF _course_run_in_progress(v_course) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'access_level_frozen');
    END IF;
    IF v_format = 'cohort' AND v_week IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'week_required');
    END IF;
  END IF;

  UPDATE lessons
  SET access_level = p_level,
      in_free_sample = (p_level = 'anyone')
  WHERE id = p_lesson_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_access_level(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_access_level(UUID, TEXT) TO authenticated;


-- ── 9b. create_lesson (re-emitted from 055:335) ─────────────────────────
-- One change: `anyone` for the first lesson of a self_paced course only;
-- every lesson of a cohort course starts `entitled` (0094 Decision 2).
CREATE OR REPLACE FUNCTION create_lesson(
  p_course_id   UUID,
  p_title       TEXT,
  p_slug        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_ordinal   INT;
  v_is_first  BOOLEAN;
  v_format    TEXT;
  v_level     TEXT;
  v_id        UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 1;
BEGIN
  SELECT format INTO v_format FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;

  -- Format only — never trust a caller-supplied string, even though the app's
  -- only caller (the lessons API route) always runs this through
  -- lib/lessonSlug.ts's slugifyLessonTitle first, which already produces
  -- something matching this. Same pattern lessons_slug_check (043) enforces
  -- at the column level.
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;

  v_base_slug := p_slug;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM lessons WHERE course_id = p_course_id AND slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  SELECT COUNT(*) = 0, COALESCE(MAX(ordinal), 0) + 1
  INTO v_is_first, v_ordinal
  FROM lessons WHERE course_id = p_course_id;

  v_level := CASE WHEN v_is_first AND v_format = 'self_paced' THEN 'anyone' ELSE 'entitled' END;

  INSERT INTO lessons (course_id, ordinal, title, description, access_level, in_free_sample, slug)
  VALUES (p_course_id, v_ordinal, p_title, p_description, v_level, v_level = 'anyone', v_slug)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'lesson_id', v_id, 'access_level', v_level,
    'in_free_sample', v_level = 'anyone', 'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── 9c. publish_course (re-emitted from 055:409) ────────────────────────
-- One change: the open-lesson check applies to self_paced courses only.
CREATE OR REPLACE FUNCTION publish_course(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_cover    TEXT;
  v_subtitle TEXT;
  v_format   TEXT;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT cover_image_url, subtitle, format INTO v_cover, v_subtitle, v_format
  FROM courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF v_cover IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_cover');
  END IF;
  IF v_subtitle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_subtitle');
  END IF;
  IF v_format = 'self_paced' AND NOT EXISTS (
    SELECT 1 FROM lessons
    WHERE course_id = p_course_id AND access_level = 'anyone' AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE courses SET status = 'published' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION publish_course(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION publish_course(UUID) TO authenticated;


-- ── 9d. publish_lesson (re-emitted from 046:185) ────────────────────────
-- One added check: an `entitled` lesson of a cohort course needs a week
-- before it is published (0093 "courses.format"), so the schedule never
-- meets a published entitled lesson with no week.
CREATE OR REPLACE FUNCTION publish_lesson(
  p_lesson_id            UUID,
  p_expected_version_id  UUID,
  p_item_count           INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_level      TEXT;
  v_week       SMALLINT;
  v_latest_id  UUID;
BEGIN
  SELECT course_id, access_level, week INTO v_course, v_level, v_week
  FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_item_count IS NULL OR p_item_count < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_item_count');
  END IF;
  IF v_level = 'entitled' AND v_week IS NULL
     AND EXISTS (SELECT 1 FROM courses WHERE id = v_course AND format = 'cohort') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'week_required');
  END IF;

  SELECT id INTO v_latest_id FROM lesson_versions
  WHERE lesson_id = p_lesson_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_latest_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_draft');
  END IF;

  IF p_expected_version_id IS DISTINCT FROM v_latest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale');
  END IF;

  UPDATE lessons
  SET published_version_id = p_expected_version_id,
      published_item_count = p_item_count,
      slug_frozen_at = COALESCE(slug_frozen_at, now())
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_expected_version_id, 'item_count', p_item_count);
END;
$$;


-- ── 10. delete_my_account (re-emitted from 056) ─────────────────────────
-- Re-emitted from 056 verbatim with two added DELETEs: run_enrolments and
-- course_entitlements (header §7).
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_blocking JSONB;
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

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
