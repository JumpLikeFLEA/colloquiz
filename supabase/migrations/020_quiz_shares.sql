-- 020_quiz_shares.sql
-- "Share a quiz with a friend": a user who played a public-bank quiz can hand the
-- EXACT same quiz to a friend (existing user or a brand-new sign-up). This is NOT
-- a duel — no rating, no clock, no head-to-head.
--
-- Mechanism mirrors 017's create_duel: sharing MINTS a fresh visibility='shared'
-- snapshot of the quiz (copying the frozen question_ids) and hangs a revocable
-- token on it, so both the sharer and the friend play the identical question set
-- through the ordinary /quiz/[id] flow. Access needs NO per-user grant: the
-- snapshot is visibility='shared', which the "quizzes: read" policy (006) already
-- opens to any signed-in user (duels rely on the same). The token — like
-- group_invites (014) — exists only to power a preview landing, in-app delivery
-- to a co-member, and revocation.


-- ── quiz_shares: one revocable share per (source quiz, sharer) ──
-- No broad SELECT policy (owner-only, below): a friend never SELECTs this table,
-- they resolve a token solely inside get_share_preview(), so tokens can't be
-- enumerated — exactly as group_invites tokens resolve only inside
-- accept_group_invite (014).
CREATE TABLE IF NOT EXISTS quiz_shares (
  token            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_quiz_id   TEXT        NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  snapshot_quiz_id TEXT        NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at       TIMESTAMPTZ
);

-- One active share per (source quiz, sharer): share_quiz reuses it, so the link
-- and every picker send point at the same snapshot. A revoked row is excluded, so
-- re-sharing after a revoke mints a fresh token.
CREATE UNIQUE INDEX IF NOT EXISTS quiz_shares_one_active
  ON quiz_shares (source_quiz_id, created_by)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS quiz_shares_owner_idx ON quiz_shares(created_by);

ALTER TABLE quiz_shares ENABLE ROW LEVEL SECURITY;

-- Owner-only: lets the sharer list their shares (the My Quizzes surface) and
-- revoke one. INSERTs happen only inside the SECURITY DEFINER share_quiz() below,
-- so no INSERT grant is given to clients. Because only the owner may SELECT, the
-- token column is unenumerable by anyone else.
GRANT SELECT, UPDATE ON quiz_shares TO authenticated;

DROP POLICY IF EXISTS "quiz_shares: owner manage" ON quiz_shares;
CREATE POLICY "quiz_shares: owner manage"
  ON quiz_shares FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());


-- ── share_quiz: mint (or reuse) a shared snapshot + token ──────
-- Clone of create_duel (017:253). Pins the source quiz's frozen question_ids into
-- a new visibility='shared' quiz row the friend can play, and reuses the caller's
-- existing active share for this source quiz so re-sharing (and the link + picker
-- both) resolve to one snapshot.
CREATE OR REPLACE FUNCTION share_quiz(p_source_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_src      quizzes%ROWTYPE;
  v_token    UUID;
  v_snapshot TEXT;
  v_qids     TEXT[];
  v_public   INT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_src FROM quizzes WHERE id = p_source_quiz_id;
  IF v_src.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_qids := v_src.question_ids;
  IF v_qids IS NULL OR array_length(v_qids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_shareable');
  END IF;

  -- Only public-bank quizzes are shareable: EVERY question must be approved and
  -- visibility='shared', else a friend outside the author's group/assignments
  -- couldn't read them (questions RLS) and would get a broken quiz. This also
  -- prevents group/private material from leaking out through a share.
  SELECT count(*) INTO v_public
  FROM questions
  WHERE id = ANY (v_qids)
    AND status = 'approved'
    AND visibility = 'shared';

  IF v_public <> array_length(v_qids, 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_shareable');
  END IF;

  -- Reuse the caller's active share for this source quiz, if any.
  SELECT token, snapshot_quiz_id INTO v_token, v_snapshot
  FROM quiz_shares
  WHERE source_quiz_id = p_source_quiz_id
    AND created_by = v_me
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'token', v_token, 'snapshot_quiz_id', v_snapshot);
  END IF;

  -- Mint the snapshot. visibility='shared' is deliberate (same as create_duel):
  -- the friend reads it via "quizzes: read", and it earns XP under 015 like any
  -- other shared quiz. group_id is left NULL — the snapshot is standalone.
  v_snapshot := gen_random_uuid()::TEXT;
  INSERT INTO quizzes (id, title, tags, difficulty_mix, question_ids, mode, created_by, visibility)
  VALUES (v_snapshot, v_src.title, COALESCE(v_src.tags, '{}'), v_src.difficulty_mix, v_qids,
          v_src.mode, v_me, 'shared');

  INSERT INTO quiz_shares (source_quiz_id, snapshot_quiz_id, created_by)
  VALUES (p_source_quiz_id, v_snapshot, v_me)
  RETURNING token INTO v_token;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'snapshot_quiz_id', v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION share_quiz(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION share_quiz(TEXT) TO authenticated;


-- ── share_quiz_to_member: notify a group co-member of a share ──
-- The in-app picker path. Access is already open (snapshot is shared); this only
-- DELIVERS a notification deep-linking the co-member to the /s/[token] landing.
-- Recipient must share a group with the sender — the same audience as duels.
CREATE OR REPLACE FUNCTION share_quiz_to_member(p_token UUID, p_recipient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_share   quiz_shares%ROWTYPE;
  v_subject TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_recipient_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_share_with_yourself');
  END IF;

  SELECT * INTO v_share
  FROM quiz_shares
  WHERE token = p_token AND created_by = v_me AND revoked_at IS NULL;
  IF v_share.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_share');
  END IF;

  -- Reuses 014's helper. Both users must share at least one group.
  IF NOT shares_group_with(v_me, p_recipient_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_group_members');
  END IF;

  SELECT q.subject INTO v_subject
  FROM quizzes z
  JOIN questions q ON q.id = z.question_ids[1]
  WHERE z.id = v_share.snapshot_quiz_id;

  PERFORM notify(p_recipient_id, 'quiz_shared', jsonb_build_object(
    'token', v_share.token,
    'from', (SELECT COALESCE(display_name, 'A learner') FROM profiles WHERE id = v_me),
    'subject', COALESCE(v_subject, 'a quiz')
  ));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION share_quiz_to_member(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION share_quiz_to_member(UUID, UUID) TO authenticated;


-- ── get_share_preview: resolve a token for the landing page ────
-- Granted to anon so a LOGGED-OUT friend sees a real preview before signing up.
-- Runs as definer (bypassing RLS on quizzes/questions/profiles, which anon can't
-- otherwise read) but returns only the minimal fields the landing renders — the
-- token is the capability; nothing else about the sharer or quiz leaks.
-- from_name uses display_name, per the public-name rule (leaderboards/public
-- surfaces never expose full_name).
CREATE OR REPLACE FUNCTION get_share_preview(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_share   quiz_shares%ROWTYPE;
  v_quiz    quizzes%ROWTYPE;
  v_subject TEXT;
BEGIN
  SELECT * INTO v_share FROM quiz_shares WHERE token = p_token;
  IF v_share.token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_share.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  SELECT * INTO v_quiz FROM quizzes WHERE id = v_share.snapshot_quiz_id;
  IF v_quiz.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT subject INTO v_subject FROM questions WHERE id = v_quiz.question_ids[1];

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_quiz_id', v_share.snapshot_quiz_id,
    'title', v_quiz.title,
    'subject', v_subject,
    'question_count', COALESCE(array_length(v_quiz.question_ids, 1), 0),
    'from_name', (SELECT COALESCE(display_name, 'A learner') FROM profiles WHERE id = v_share.created_by)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_share_preview(UUID) FROM public;
GRANT EXECUTE ON FUNCTION get_share_preview(UUID) TO anon, authenticated;


-- ── get_share_targets: the sender's group co-members, for the picker ──
-- Distinct users who share at least one group with the caller. Powers the
-- results-screen "send to a co-member" picker in one round trip.
CREATE OR REPLACE FUNCTION get_share_targets()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object('id', p.id, 'name', COALESCE(p.display_name, 'A learner'))
             ORDER BY COALESCE(p.display_name, '')
           )
    FROM (
      SELECT DISTINCT b.user_id
      FROM group_members a
      JOIN group_members b ON b.group_id = a.group_id
      WHERE a.user_id = v_me AND b.user_id <> v_me
    ) m
    JOIN profiles p ON p.id = m.user_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_share_targets() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_share_targets() TO authenticated;
