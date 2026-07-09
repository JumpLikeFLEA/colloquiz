-- ============================================================
-- 006_author_role_and_assignments.sql
--
-- Adds the "author" (tutor) capability and the tutor→student
-- assignment workflow:
--   • profiles.is_author flag (self-serve; admins are always author-capable)
--   • column-level UPDATE grant on profiles so users can no longer
--     self-escalate their own role (pre-existing hole — see below)
--   • visibility ('shared'|'private') on questions + quizzes so authors
--     keep private content that only they and their assigned students see
--   • tutor_invites / tutor_students link tables + accept_tutor_invite RPC
--   • assignments table (tutor assigns a quiz to a linked student)
--   • results.answers JSONB so a tutor can review the student's answers
--   • SECURITY DEFINER helpers for the assigned-content RLS checks
--
-- Safe to re-apply: all operations are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── profiles: author flag ───────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_author BOOLEAN NOT NULL DEFAULT FALSE;

-- Close a pre-existing privilege-escalation hole. The "profiles: owner
-- read/write" policy is FOR ALL USING (auth.uid() = id), which lets a user
-- UPDATE any column on their own row — including role = 'admin'. RLS can't
-- restrict *which* columns are writable, so use a column-level grant: revoke
-- blanket UPDATE and re-grant only the columns the app legitimately writes
-- from a user session. role and created_at are intentionally excluded (role
-- is set by an admin via the dashboard / service-role, which bypasses grants).
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (
  display_name, full_name, city, is_author,
  total_xp, current_streak, longest_streak, last_quiz_at
) ON profiles TO authenticated;


-- ── tutor_invites: one rotating link per tutor ──────────────
CREATE TABLE IF NOT EXISTS tutor_invites (
  token       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tutor_invites_tutor_idx ON tutor_invites(tutor_id);

ALTER TABLE tutor_invites ENABLE ROW LEVEL SECURITY;

-- Only the owning tutor can read/write their invites. There is deliberately
-- no broader SELECT policy: a token is resolved to a tutor only inside the
-- SECURITY DEFINER accept_tutor_invite() RPC, so tokens can't be enumerated.
GRANT SELECT, INSERT, UPDATE, DELETE ON tutor_invites TO authenticated;

DROP POLICY IF EXISTS "tutor_invites: owner manage" ON tutor_invites;
CREATE POLICY "tutor_invites: owner manage"
  ON tutor_invites FOR ALL
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());


-- ── tutor_students: the link ────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_students (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tutor_id, student_id),
  CHECK (tutor_id <> student_id)
);

CREATE INDEX IF NOT EXISTS tutor_students_tutor_idx   ON tutor_students(tutor_id);
CREATE INDEX IF NOT EXISTS tutor_students_student_idx ON tutor_students(student_id);

ALTER TABLE tutor_students ENABLE ROW LEVEL SECURITY;

-- Participants can read the link and either side can remove it. There is NO
-- INSERT policy — linking happens exclusively through accept_tutor_invite().
GRANT SELECT, DELETE ON tutor_students TO authenticated;

DROP POLICY IF EXISTS "tutor_students: participants read" ON tutor_students;
CREATE POLICY "tutor_students: participants read"
  ON tutor_students FOR SELECT
  USING (auth.uid() = tutor_id OR auth.uid() = student_id);

DROP POLICY IF EXISTS "tutor_students: participants unlink" ON tutor_students;
CREATE POLICY "tutor_students: participants unlink"
  ON tutor_students FOR DELETE
  USING (auth.uid() = tutor_id OR auth.uid() = student_id);


-- ── profiles: linked participants can read each other ───────
-- The tutor needs the student's name for their roster; the student needs the
-- tutor's name on an assignment. Additive SELECT policy (OR'd with owner).
DROP POLICY IF EXISTS "profiles: linked read" ON profiles;
CREATE POLICY "profiles: linked read"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tutor_students ts
      WHERE (ts.tutor_id = auth.uid() AND ts.student_id = profiles.id)
         OR (ts.student_id = auth.uid() AND ts.tutor_id = profiles.id)
    )
  );


-- ── accept_tutor_invite: link a student to a tutor by token ─
-- SECURITY DEFINER so it can resolve a token (which no user may SELECT) and
-- insert into tutor_students (which has no INSERT policy). Binds the student
-- to auth.uid() — a caller can never link a third party.
CREATE OR REPLACE FUNCTION accept_tutor_invite(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor   UUID;
  v_student UUID := auth.uid();
  v_name    TEXT;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT tutor_id INTO v_tutor
  FROM tutor_invites
  WHERE token = p_token AND revoked_at IS NULL;

  IF v_tutor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite');
  END IF;

  IF v_tutor = v_student THEN
    RETURN jsonb_build_object('ok', false, 'error', 'own_invite');
  END IF;

  INSERT INTO tutor_students (tutor_id, student_id)
  VALUES (v_tutor, v_student)
  ON CONFLICT (tutor_id, student_id) DO NOTHING;

  SELECT COALESCE(full_name, display_name) INTO v_name FROM profiles WHERE id = v_tutor;

  RETURN jsonb_build_object('ok', true, 'tutor_name', COALESCE(v_name, 'your tutor'));
END;
$$;

REVOKE ALL ON FUNCTION accept_tutor_invite(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION accept_tutor_invite(UUID) TO authenticated;


-- ── assignments: tutor assigns a quiz to a student ──────────
CREATE TABLE IF NOT EXISTS assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id      TEXT        NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  tutor_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_id    TEXT        REFERENCES results(id) ON DELETE SET NULL,
  UNIQUE (quiz_id, student_id)
);

CREATE INDEX IF NOT EXISTS assignments_student_status_idx ON assignments(student_id, status);
CREATE INDEX IF NOT EXISTS assignments_tutor_idx          ON assignments(tutor_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Column-scoped UPDATE: a student may only flip completion fields (set on
-- submit by the results API), never due_at or the assignment target.
GRANT SELECT, INSERT, DELETE ON assignments TO authenticated;
GRANT UPDATE (status, completed_at, result_id) ON assignments TO authenticated;

DROP POLICY IF EXISTS "assignments: participants read" ON assignments;
CREATE POLICY "assignments: participants read"
  ON assignments FOR SELECT
  USING (auth.uid() = tutor_id OR auth.uid() = student_id);

-- Only the tutor may create the assignment, only for a student they are
-- linked to, and only for a quiz they own.
DROP POLICY IF EXISTS "assignments: tutor insert" ON assignments;
CREATE POLICY "assignments: tutor insert"
  ON assignments FOR INSERT
  WITH CHECK (
    tutor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tutor_students ts
      WHERE ts.tutor_id = auth.uid() AND ts.student_id = assignments.student_id
    )
    AND EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = assignments.quiz_id AND q.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assignments: student complete" ON assignments;
CREATE POLICY "assignments: student complete"
  ON assignments FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "assignments: tutor unassign" ON assignments;
CREATE POLICY "assignments: tutor unassign"
  ON assignments FOR DELETE
  USING (tutor_id = auth.uid());


-- ── results: store answers + let the assigning tutor read ───
ALTER TABLE results ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]';

-- A tutor may read a student's result only for a quiz they assigned to that
-- student (covers retakes; exposes nothing else in the student's history).
DROP POLICY IF EXISTS "results: assigning tutor read" ON results;
CREATE POLICY "results: assigning tutor read"
  ON results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.tutor_id = auth.uid()
        AND a.student_id = results.user_id
        AND a.quiz_id = results.quiz_id
    )
  );


-- ── assigned-content helpers (SECURITY DEFINER) ─────────────
-- Used inside questions/quizzes SELECT policies. Running as definer bypasses
-- RLS on the inner tables, which both avoids policy recursion and keeps the
-- checks index-friendly.
CREATE OR REPLACE FUNCTION is_quiz_assigned(p_quiz_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.quiz_id = p_quiz_id AND a.student_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_question_assigned(p_question_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM assignments a
    JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.student_id = p_user_id
      AND p_question_id = ANY(q.question_ids)
  );
$$;

-- These run inside questions/quizzes SELECT policies, which are evaluated for
-- EVERY role that reads those tables — including the anon key used by
-- getSubjectStats(). So anon needs EXECUTE too (the function just returns a
-- boolean; for anon auth.uid() is NULL and it returns false).
GRANT EXECUTE ON FUNCTION is_quiz_assigned(TEXT, UUID)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_question_assigned(TEXT, UUID) TO anon, authenticated;


-- ── questions: visibility + author/assigned policies ────────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK (visibility IN ('shared', 'private'));

CREATE INDEX IF NOT EXISTS questions_created_by_idx ON questions(created_by);
CREATE INDEX IF NOT EXISTS questions_visibility_idx ON questions(visibility);

-- Public pool is now approved AND shared (a private question is never public).
DROP POLICY IF EXISTS "questions: public read approved" ON questions;
CREATE POLICY "questions: public read approved"
  ON questions FOR SELECT
  USING (status = 'approved' AND visibility = 'shared');

-- The creator always sees their own questions (any status / visibility).
DROP POLICY IF EXISTS "questions: creator read own" ON questions;
CREATE POLICY "questions: creator read own"
  ON questions FOR SELECT
  USING (created_by = auth.uid());

-- Assigned students can read the questions of a quiz assigned to them.
DROP POLICY IF EXISTS "questions: assigned student read" ON questions;
CREATE POLICY "questions: assigned student read"
  ON questions FOR SELECT
  USING (is_question_assigned(id, auth.uid()));

-- Authors (and admins) may create questions they own.
DROP POLICY IF EXISTS "questions: author insert" ON questions;
CREATE POLICY "questions: author insert"
  ON questions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND (p.is_author OR p.role = 'admin')
    )
  );

-- Authors may edit/delete their own PRIVATE questions. The permissive
-- WITH CHECK is required so the submit-to-pool flip (visibility → 'shared',
-- status → 'pending') is allowed; USING still restricts the operation to
-- rows that are private *before* the update.
DROP POLICY IF EXISTS "questions: author update own" ON questions;
CREATE POLICY "questions: author update own"
  ON questions FOR UPDATE
  USING (created_by = auth.uid() AND visibility = 'private')
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "questions: author delete own" ON questions;
CREATE POLICY "questions: author delete own"
  ON questions FOR DELETE
  USING (created_by = auth.uid() AND visibility = 'private');


-- ── quizzes: visibility + read policy ───────────────────────
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK (visibility IN ('shared', 'private'));

CREATE INDEX IF NOT EXISTS quizzes_question_ids_idx ON quizzes USING GIN (question_ids);
CREATE INDEX IF NOT EXISTS quizzes_created_by_idx   ON quizzes(created_by);

-- Replace the blanket authenticated-read with a scoped read. Shared quizzes
-- (all pre-existing rows default to 'shared') stay readable by any signed-in
-- user, preserving the current play-any-quiz behaviour. Private quizzes are
-- visible only to their creator, their assigned students, and admins.
DROP POLICY IF EXISTS "quizzes: authenticated read" ON quizzes;
DROP POLICY IF EXISTS "quizzes: read" ON quizzes;
CREATE POLICY "quizzes: read"
  ON quizzes FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND visibility = 'shared')
    OR created_by = auth.uid()
    OR is_quiz_assigned(id, auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
