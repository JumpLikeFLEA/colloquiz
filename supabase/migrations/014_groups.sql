-- ============================================================
-- 014_groups.sql
--
-- Adds peer groups: several users form a group, co-author a quiz
-- (create / edit / review), and later compete as a team.
--
-- Where the tutor→student link (006) is one-directional and hierarchical,
-- a group is a peer container that OWNS content:
--   • groups / group_members / group_invites (+ create_group,
--     accept_group_invite RPCs, modelled on tutor_invites)
--   • group_id on questions + quizzes, and a third visibility value 'group'
--   • group membership grants authoring — is_author is NOT required
--   • peer review: any member may approve another member's draft, never
--     their own; the group owner is an unconditional backstop (otherwise a
--     brand-new 1-member group could never approve anything)
--   • groups.competes: stored now, unused until the team-rankings feature
--
-- Safe to re-apply: all operations are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── groups ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 60),
  description TEXT,
  owner_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Opt-in to team rankings. Deliberately has no UI yet: the rankings
  -- feature ships the toggle and the leaderboard together, so nobody sees
  -- a switch that does nothing.
  competes    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS groups_owner_idx ON groups(owner_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;


-- ── group_members ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_members_group_idx ON group_members(group_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx  ON group_members(user_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;


-- ── group_invites: one rotating link per group ──────────────
-- Near-verbatim clone of tutor_invites (006). As there, no broad SELECT
-- policy exists: a token is resolved only inside the SECURITY DEFINER
-- accept_group_invite() RPC, so tokens can't be enumerated.
CREATE TABLE IF NOT EXISTS group_invites (
  token      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS group_invites_group_idx ON group_invites(group_id);

ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;


-- ── membership helpers (SECURITY DEFINER) ───────────────────
-- Modelled on is_quiz_assigned (006). Running as definer bypasses RLS on
-- group_members, which both avoids policy recursion (the group_members
-- SELECT policy itself calls is_group_member) and keeps the checks
-- index-friendly.
CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members m
    WHERE m.group_id = p_group_id AND m.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_group_owner(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members m
    WHERE m.group_id = p_group_id AND m.user_id = p_user_id AND m.role = 'owner'
  );
$$;

-- Do two users share at least one group? Used by the profiles SELECT policy
-- so a roster can show member names.
CREATE OR REPLACE FUNCTION shares_group_with(p_user_id UUID, p_other_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members a
    JOIN group_members b ON b.group_id = a.group_id
    WHERE a.user_id = p_user_id AND b.user_id = p_other_id
  );
$$;

-- is_group_member runs inside the questions/quizzes SELECT policies, which
-- are evaluated for EVERY role that reads those tables — including the anon
-- key used by getSubjectStats(). anon therefore needs EXECUTE too, exactly as
-- for is_quiz_assigned (006). Without this the logged-out home page breaks.
-- (For anon, auth.uid() is NULL and these simply return false.)
GRANT EXECUTE ON FUNCTION is_group_member(UUID, UUID)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_group_owner(UUID, UUID)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION shares_group_with(UUID, UUID) TO anon, authenticated;


-- ── groups RLS ──────────────────────────────────────────────
-- No INSERT grant/policy: groups are created only through create_group(),
-- which also writes the owner's membership row in the same transaction.
GRANT SELECT, UPDATE, DELETE ON groups TO authenticated;

DROP POLICY IF EXISTS "groups: member read" ON groups;
CREATE POLICY "groups: member read"
  ON groups FOR SELECT
  USING (is_group_member(id, auth.uid()));

DROP POLICY IF EXISTS "groups: owner update" ON groups;
CREATE POLICY "groups: owner update"
  ON groups FOR UPDATE
  USING (is_group_owner(id, auth.uid()))
  WITH CHECK (is_group_owner(id, auth.uid()));

DROP POLICY IF EXISTS "groups: owner delete" ON groups;
CREATE POLICY "groups: owner delete"
  ON groups FOR DELETE
  USING (is_group_owner(id, auth.uid()));


-- ── group_members RLS ───────────────────────────────────────
-- No INSERT policy — membership is written exclusively by create_group()
-- and accept_group_invite(), mirroring how tutor_students is written only
-- by accept_tutor_invite().
--
-- DELETE is restricted to role = 'member', so the owner's own row can never
-- be removed by either path (leave or kick). An owner who wants out must
-- delete the group.
GRANT SELECT, DELETE ON group_members TO authenticated;

DROP POLICY IF EXISTS "group_members: member read" ON group_members;
CREATE POLICY "group_members: member read"
  ON group_members FOR SELECT
  USING (is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "group_members: leave or kick" ON group_members;
CREATE POLICY "group_members: leave or kick"
  ON group_members FOR DELETE
  USING (
    role = 'member'
    AND (user_id = auth.uid() OR is_group_owner(group_id, auth.uid()))
  );


-- ── group_invites RLS ───────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON group_invites TO authenticated;

DROP POLICY IF EXISTS "group_invites: owner manage" ON group_invites;
CREATE POLICY "group_invites: owner manage"
  ON group_invites FOR ALL
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));


-- ── profiles: group co-members can read each other ──────────
-- Additive SELECT policy (OR'd with the owner and tutor-linked policies), so
-- the roster and question attribution can show names.
DROP POLICY IF EXISTS "profiles: group co-member read" ON profiles;
CREATE POLICY "profiles: group co-member read"
  ON profiles FOR SELECT
  USING (shares_group_with(auth.uid(), profiles.id));


-- ── create_group: group + owner membership, atomically ──────
-- SECURITY DEFINER because neither groups nor group_members has an INSERT
-- policy. Doing both writes in one function keeps them in one transaction: a
-- two-statement client-side create could fail halfway and leave a group with
-- no members and therefore no one able to read or delete it.
CREATE OR REPLACE FUNCTION create_group(p_name TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_group UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  INSERT INTO groups (name, description, owner_id)
  VALUES (trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), v_user)
  RETURNING id INTO v_group;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group, v_user, 'owner');

  RETURN jsonb_build_object('ok', true, 'group_id', v_group);
END;
$$;

REVOKE ALL ON FUNCTION create_group(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_group(TEXT, TEXT) TO authenticated;


-- ── accept_group_invite: join a group by token ──────────────
-- Direct analogue of accept_tutor_invite (006). SECURITY DEFINER so it can
-- resolve a token (which no user may SELECT) and insert into group_members
-- (which has no INSERT policy). Binds membership to auth.uid() — a caller can
-- never add a third party. ON CONFLICT DO NOTHING makes a re-accept a no-op.
CREATE OR REPLACE FUNCTION accept_group_invite(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group UUID;
  v_user  UUID := auth.uid();
  v_name  TEXT;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT group_id INTO v_group
  FROM group_invites
  WHERE token = p_token AND revoked_at IS NULL;

  IF v_group IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite');
  END IF;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group, v_user, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  SELECT name INTO v_name FROM groups WHERE id = v_group;

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', v_group,
    'group_name', COALESCE(v_name, 'the group')
  );
END;
$$;

REVOKE ALL ON FUNCTION accept_group_invite(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION accept_group_invite(UUID) TO authenticated;


-- ── content: group ownership on questions + quizzes ─────────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS group_id UUID
  REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE quizzes   ADD COLUMN IF NOT EXISTS group_id UUID
  REFERENCES groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS questions_group_idx ON questions(group_id);
CREATE INDEX IF NOT EXISTS quizzes_group_idx   ON quizzes(group_id);

-- Widen the visibility CHECKs added in 006 to admit 'group'. Those were
-- created inline via ADD COLUMN ... CHECK (...), so Postgres named them
-- <table>_visibility_check.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_visibility_check;
ALTER TABLE questions ADD  CONSTRAINT questions_visibility_check
  CHECK (visibility IN ('shared', 'private', 'group'));

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_visibility_check;
ALTER TABLE quizzes ADD  CONSTRAINT quizzes_visibility_check
  CHECK (visibility IN ('shared', 'private', 'group'));

-- NOTE on cascades: quizzes.group_id ON DELETE CASCADE chains into results,
-- quiz_sessions and assignments, which already cascade off quizzes via 012.
-- Deleting a group therefore destroys every recorded attempt of its quizzes.
-- The delete confirmation in the UI must say so.


-- ── questions: group policies ───────────────────────────────
-- RLS policies are OR'd, so each of these is purely additive and weakens
-- nothing that already exists.

DROP POLICY IF EXISTS "questions: group member read" ON questions;
CREATE POLICY "questions: group member read"
  ON questions FOR SELECT
  USING (visibility = 'group' AND is_group_member(group_id, auth.uid()));

-- This is what lets a member author WITHOUT profiles.is_author: the existing
-- "questions: author insert" policy requires the flag, this one requires
-- group membership instead.
DROP POLICY IF EXISTS "questions: group member insert" ON questions;
CREATE POLICY "questions: group member insert"
  ON questions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND group_id IS NOT NULL
    AND visibility = 'group'
    AND is_group_member(group_id, auth.uid())
  );

-- Any member may edit any group question (co-authoring is the point). The
-- status column is separately governed by the guard trigger below.
DROP POLICY IF EXISTS "questions: group member update" ON questions;
CREATE POLICY "questions: group member update"
  ON questions FOR UPDATE
  USING (visibility = 'group' AND is_group_member(group_id, auth.uid()))
  WITH CHECK (is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "questions: group member delete" ON questions;
CREATE POLICY "questions: group member delete"
  ON questions FOR DELETE
  USING (visibility = 'group' AND is_group_member(group_id, auth.uid()));


-- ── quizzes: group policies ─────────────────────────────────
DROP POLICY IF EXISTS "quizzes: group member read" ON quizzes;
CREATE POLICY "quizzes: group member read"
  ON quizzes FOR SELECT
  USING (visibility = 'group' AND is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "quizzes: group member insert" ON quizzes;
CREATE POLICY "quizzes: group member insert"
  ON quizzes FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND group_id IS NOT NULL
    AND visibility = 'group'
    AND is_group_member(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "quizzes: group member update" ON quizzes;
CREATE POLICY "quizzes: group member update"
  ON quizzes FOR UPDATE
  USING (visibility = 'group' AND is_group_member(group_id, auth.uid()))
  WITH CHECK (is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "quizzes: group member delete" ON quizzes;
CREATE POLICY "quizzes: group member delete"
  ON quizzes FOR DELETE
  USING (visibility = 'group' AND is_group_member(group_id, auth.uid()));


-- ── results: group members read each other's group attempts ─
-- Direct analogue of "results: assigning tutor read" (006): a scoped read
-- that exposes nothing else in a member's history. This is also exactly the
-- data the team-rankings feature will aggregate.
DROP POLICY IF EXISTS "results: group member read" ON results;
CREATE POLICY "results: group member read"
  ON results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = results.quiz_id
        AND q.group_id IS NOT NULL
        AND is_group_member(q.group_id, auth.uid())
    )
  );


-- ── guard: peer review, enforced in the database ────────────
-- The review rule is "any member except the drafter, plus the owner as an
-- unconditional backstop". It CANNOT be enforced in the API layer alone: the
-- app has no service-role client, the browser holds a Supabase client with
-- the user's own JWT, and the group-member UPDATE policy above necessarily
-- allows updating group questions. RLS cannot restrict WHICH columns an
-- UPDATE touches, so without this trigger a member could self-approve with a
-- direct table write.
--
-- The column-level GRANT UPDATE (...) trick used for profiles (006) is not
-- available here: app/api/admin/questions/[id]/route.ts writes status under
-- the *user's* session via the "questions: admin write" policy, so revoking
-- blanket UPDATE on questions would break admin review.
--
-- The same trigger also governs promotion to the shared pool, because that is
-- likewise just a column write a member could forge. Two escapes have to be
-- closed together, or the review gate is decorative:
--   • {visibility → 'shared', status → 'approved'} on one's own draft would
--     self-approve straight into the PUBLIC pool;
--   • {visibility → 'shared'} alone on an already-approved group question
--     would enter the public pool without ever passing admin review.
-- So a group → shared promotion is legal only from an already peer-approved
-- question, and only by re-entering the admin queue as 'pending'.
CREATE OR REPLACE FUNCTION tg_guard_group_question_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins are exempt (they moderate promoted group content).
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  IF NOT is_group_member(NEW.group_id, auth.uid()) THEN
    RAISE EXCEPTION 'not a member of this group';
  END IF;

  -- Promotion to the shared pool.
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    IF NEW.visibility <> 'shared' THEN
      RAISE EXCEPTION 'a group question can only be promoted to the shared pool';
    END IF;
    IF OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'only an approved group question can be submitted to the pool';
    END IF;
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'a promoted question must re-enter review as pending';
    END IF;
    RETURN NEW;
  END IF;

  -- Otherwise this is a review. Peer rule: you may not review your own
  -- draft, unless you own the group (which is what unblocks a brand-new
  -- 1-member group, where there is no peer to review anything).
  IF NEW.created_by = auth.uid()
     AND NOT is_group_owner(NEW.group_id, auth.uid()) THEN
    RAISE EXCEPTION 'you cannot approve or reject your own question';
  END IF;

  RETURN NEW;
END;
$$;

-- Only transitions INTO a decided state are review. Editing a question resets
-- it to 'pending' (the old approval applied to the old wording), and that must
-- stay allowed for everyone including the drafter — otherwise a member could
-- never fix a typo in their own approved question.
DROP TRIGGER IF EXISTS guard_group_question_review ON questions;
CREATE TRIGGER guard_group_question_review
  BEFORE UPDATE ON questions
  FOR EACH ROW
  WHEN (
    NEW.group_id IS NOT NULL
    AND OLD.visibility = 'group'
    AND (
      (NEW.status IN ('approved', 'rejected') AND NEW.status IS DISTINCT FROM OLD.status)
      OR NEW.visibility IS DISTINCT FROM OLD.visibility
    )
  )
  EXECUTE FUNCTION tg_guard_group_question_review();


-- ── review_group_question: the reviewed-by bookkeeping ──────
-- Thin validated wrapper: flips status and records the reviewer in one call.
-- The rule itself lives in the trigger above, so this function is a
-- convenience, not the security boundary — a direct write is governed
-- identically.
CREATE OR REPLACE FUNCTION review_group_question(
  p_question_id TEXT,
  p_status      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_group UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT group_id INTO v_group
  FROM questions
  WHERE id = p_question_id AND visibility = 'group' AND status = 'pending';

  IF v_group IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Same rule the trigger enforces, checked here so the caller gets a clean
  -- JSON error instead of an exception.
  IF NOT is_group_member(v_group, v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF EXISTS (
    SELECT 1 FROM questions
    WHERE id = p_question_id AND created_by = v_user
  ) AND NOT is_group_owner(v_group, v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_review_own');
  END IF;

  UPDATE questions
     SET status      = p_status,
         reviewed_by = v_user,
         reviewed_at = NOW()
   WHERE id = p_question_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION review_group_question(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_group_question(TEXT, TEXT) TO authenticated;


-- ── notifications ───────────────────────────────────────────
-- Reuses the private notify() writer from 013. Both trigger functions must be
-- SECURITY DEFINER: notify() is granted to no client role.

-- group_member_joined → owner. WHEN role = 'member' skips the owner's own
-- membership row written by create_group().
CREATE OR REPLACE FUNCTION tg_notify_group_member_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner       UUID;
  v_group_name  TEXT;
  v_member_name TEXT;
BEGIN
  SELECT owner_id, name INTO v_owner, v_group_name
  FROM groups WHERE id = NEW.group_id;

  SELECT COALESCE(full_name, display_name, 'Someone')
  INTO v_member_name FROM profiles WHERE id = NEW.user_id;

  PERFORM notify(v_owner, 'group_member_joined', jsonb_build_object(
    'group_id',    NEW.group_id,
    'group_name',  v_group_name,
    'member_id',   NEW.user_id,
    'member_name', v_member_name
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_group_member_joined ON group_members;
CREATE TRIGGER notify_group_member_joined
  AFTER INSERT ON group_members
  FOR EACH ROW
  WHEN (NEW.role = 'member')
  EXECUTE FUNCTION tg_notify_group_member_joined();


-- group_question_pending → owner. Without this the owner never learns there
-- is a queue waiting and review silently stalls. Notifying only the owner
-- keeps this to one row per draft even though any member may act on it.
-- Self-notice is suppressed when the owner is the drafter.
CREATE OR REPLACE FUNCTION tg_notify_group_question_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner      UUID;
  v_group_name TEXT;
  v_author     TEXT;
BEGIN
  SELECT owner_id, name INTO v_owner, v_group_name
  FROM groups WHERE id = NEW.group_id;

  IF v_owner IS NULL OR v_owner = NEW.created_by THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(display_name, full_name, 'A member')
  INTO v_author FROM profiles WHERE id = NEW.created_by;

  PERFORM notify(v_owner, 'group_question_pending', jsonb_build_object(
    'group_id',         NEW.group_id,
    'group_name',       v_group_name,
    'question_id',      NEW.id,
    'question_snippet', left(NEW.question, 80),
    'author_name',      v_author
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_group_question_pending ON questions;
CREATE TRIGGER notify_group_question_pending
  AFTER INSERT ON questions
  FOR EACH ROW
  WHEN (
    NEW.group_id IS NOT NULL
    AND NEW.visibility = 'group'
    AND NEW.status = 'pending'
  )
  EXECUTE FUNCTION tg_notify_group_question_pending();


-- question_reviewed → drafter: the trigger and its WHEN clause from 013 are
-- reused as-is. It fires on any pending → approved/rejected transition where
-- created_by is set and differs from reviewed_by, which describes group peer
-- review exactly — including suppressing the self-notice when a group owner
-- approves their own draft as the backstop.
--
-- The payload gains group_id so the notification center can deep-link to the
-- group's review queue instead of the solo My Quizzes page. Replacing the
-- function leaves the trigger binding untouched.
CREATE OR REPLACE FUNCTION tg_notify_question_reviewed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify(NEW.created_by, 'question_reviewed', jsonb_build_object(
    'question_id',      NEW.id,
    'question_snippet', left(NEW.question, 80),
    'status',           NEW.status,
    'critic_notes',     NEW.critic_notes,
    'group_id',         NEW.group_id
  ));
  RETURN NULL;
END;
$$;
