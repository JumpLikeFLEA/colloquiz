-- ============================================================
-- 017_duels.sql
--
-- The competitive ladder: async duels between group co-members, rated with
-- Glicko-2, surfaced only as a tier badge.
--
-- Design notes
-- ------------
-- • A duel is METADATA OVER AN ORDINARY QUIZ. create_duel samples from the
--   public pool, pins the question ids into one quizzes row, and both players
--   play it through the existing /quiz/[id] flow. No parallel gameplay engine,
--   and because the quiz is visibility 'shared' it grants normal XP through
--   015's novelty ledger — so duelling never feels like wasted study time and
--   is not an XP shortcut either.
--
-- • Glicko-2 lives HERE, not in TypeScript. The whole point of a hidden rating
--   is that a client cannot write its own; resolution therefore has to happen
--   somewhere the user's JWT cannot reach. lib/glicko2.ts is the reference
--   implementation this is cross-validated against (and the source of the tier
--   mapping the UI renders).
--
-- • player_ratings has RLS on, NO policies, and its privileges explicitly
--   REVOKEd. Not even the owner may read their own rating — "hidden" is
--   enforced by the database, not by the UI declining to render a number. Tier
--   reaches the client only through the SECURITY DEFINER functions below.
--   (The REVOKE matters: Supabase grants anon/authenticated privileges on new
--   public-schema tables by default, so without it the lockdown would rest on
--   RLS-with-no-policies alone rather than being declared.)
--
-- • Timing is server-side. results.time_taken arrives from the client
--   (QuizSession sends its own timer) and is fine for solo play, but a duel is
--   decided on it, so elapsed time is computed from duel_participants.started_at
--   which only start_duel_leg() may stamp.
--
-- Safe to re-apply.
-- ============================================================


-- ── Glicko-2 ────────────────────────────────────────────────
-- Double precision throughout: exp() on numeric overflows for the arguments the
-- volatility solver probes.

-- f(x) from Glickman §5.1, step 1.
CREATE OR REPLACE FUNCTION glicko2_f(
  x FLOAT8, p_delta FLOAT8, p_phi FLOAT8, p_v FLOAT8, p_a FLOAT8, p_tau FLOAT8
)
RETURNS FLOAT8
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (exp(x) * (p_delta * p_delta - p_phi * p_phi - p_v - exp(x)))
         / (2 * power(p_phi * p_phi + p_v + exp(x), 2))
         - (x - p_a) / (p_tau * p_tau);
$$;

-- One rating period against a single opponent, which is how duels work: each
-- duel is its own period. Mirrors glicko2Update() in lib/glicko2.ts.
CREATE OR REPLACE FUNCTION glicko2_update(
  p_rating     FLOAT8,
  p_rd         FLOAT8,
  p_vol        FLOAT8,
  p_opp_rating FLOAT8,
  p_opp_rd     FLOAT8,
  p_score      FLOAT8,          -- 1 win, 0.5 draw, 0 loss
  p_tau        FLOAT8 DEFAULT 0.5
)
RETURNS TABLE (rating FLOAT8, rd FLOAT8, vol FLOAT8)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  scale CONSTANT FLOAT8 := 173.7178;
  eps   CONSTANT FLOAT8 := 0.000001;
  mu FLOAT8; phi FLOAT8; sigma FLOAT8;
  mu_j FLOAT8; phi_j FLOAT8;
  gj FLOAT8; e FLOAT8; v FLOAT8; outcome FLOAT8; delta FLOAT8;
  a FLOAT8; av FLOAT8; bv FLOAT8; fa FLOAT8; fb FLOAT8; cv FLOAT8; fc FLOAT8;
  k INT := 1;
  guard INT := 0;
  sigma_p FLOAT8; phi_star FLOAT8; phi_p FLOAT8; mu_p FLOAT8;
BEGIN
  mu    := (p_rating - 1500) / scale;
  phi   := p_rd / scale;
  sigma := p_vol;
  mu_j  := (p_opp_rating - 1500) / scale;
  phi_j := p_opp_rd / scale;

  gj := 1 / sqrt(1 + 3 * phi_j * phi_j / (pi() * pi()));
  e  := 1 / (1 + exp(-gj * (mu - mu_j)));

  -- A perfectly certain outcome carries no information; guard the division.
  IF e <= 0 OR e >= 1 THEN
    RETURN QUERY SELECT p_rating, p_rd, p_vol;
    RETURN;
  END IF;

  v       := 1 / (gj * gj * e * (1 - e));
  outcome := gj * (p_score - e);
  delta   := v * outcome;

  -- Volatility, by the Illinois variant of regula falsi.
  a  := ln(sigma * sigma);
  av := a;
  IF delta * delta > phi * phi + v THEN
    bv := ln(delta * delta - phi * phi - v);
  ELSE
    WHILE glicko2_f(a - k * p_tau, delta, phi, v, a, p_tau) < 0 AND k < 100 LOOP
      k := k + 1;
    END LOOP;
    bv := a - k * p_tau;
  END IF;

  fa := glicko2_f(av, delta, phi, v, a, p_tau);
  fb := glicko2_f(bv, delta, phi, v, a, p_tau);

  WHILE abs(bv - av) > eps AND guard < 1000 LOOP
    guard := guard + 1;
    cv := av + (av - bv) * fa / (fb - fa);
    fc := glicko2_f(cv, delta, phi, v, a, p_tau);
    IF fc * fb <= 0 THEN
      av := bv;
      fa := fb;
    ELSE
      fa := fa / 2;
    END IF;
    bv := cv;
    fb := fc;
  END LOOP;

  sigma_p  := exp(av / 2);
  phi_star := sqrt(phi * phi + sigma_p * sigma_p);
  phi_p    := 1 / sqrt(1 / (phi_star * phi_star) + 1 / v);
  mu_p     := mu + phi_p * phi_p * outcome;

  RETURN QUERY SELECT scale * mu_p + 1500, scale * phi_p, sigma_p;
END;
$$;

-- Mirrors tierFor() in lib/glicko2.ts. Unranked until the placement duels are
-- done, so a badge always means something.
CREATE OR REPLACE FUNCTION tier_for(p_rating FLOAT8, p_matches INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_matches < 5   THEN 'unranked'
           WHEN p_rating >= 1900 THEN 'master'
           WHEN p_rating >= 1750 THEN 'diamond'
           WHEN p_rating >= 1600 THEN 'platinum'
           WHEN p_rating >= 1450 THEN 'gold'
           WHEN p_rating >= 1300 THEN 'silver'
           ELSE 'bronze'
         END;
$$;


-- ── player_ratings ──────────────────────────────────────────
-- RLS on and deliberately NO policies: the rating is hidden from everyone
-- including its owner. Only SECURITY DEFINER functions read it.
CREATE TABLE IF NOT EXISTS player_ratings (
  user_id        UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  rating         FLOAT8      NOT NULL DEFAULT 1500,
  rd             FLOAT8      NOT NULL DEFAULT 350,
  vol            FLOAT8      NOT NULL DEFAULT 0.06,
  matches_played INTEGER     NOT NULL DEFAULT 0,
  last_match_at  TIMESTAMPTZ
);

ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;

-- Belt and braces. RLS with no policies already denies every row, but Supabase
-- grants anon/authenticated privileges on new public-schema tables by default,
-- so without this the table would be SELECTable (returning nothing) and one
-- accidental permissive policy later would expose the number. Revoking says
-- what we mean: no client role has any business touching this table.
REVOKE ALL ON TABLE player_ratings FROM anon, authenticated;


-- ── duels ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS duels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       TEXT        NOT NULL REFERENCES quizzes(id)  ON DELETE CASCADE,
  group_id      UUID        NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  challenger_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opponent_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject       TEXT,
  difficulty    TEXT        NOT NULL,
  size          INTEGER     NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'resolved', 'declined', 'expired')),
  -- Reserved for a realtime head-to-head mode, exactly as groups.competes was
  -- reserved for this feature. No UI reads it yet.
  live          BOOLEAN     NOT NULL DEFAULT FALSE,
  time_limit_seconds INTEGER NOT NULL DEFAULT 900,
  deadline_at   TIMESTAMPTZ,
  winner_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  is_draw       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  CONSTRAINT duels_distinct_players CHECK (challenger_id <> opponent_id)
);

CREATE INDEX IF NOT EXISTS duels_quiz_idx      ON duels(quiz_id);
CREATE INDEX IF NOT EXISTS duels_challenger_idx ON duels(challenger_id);
CREATE INDEX IF NOT EXISTS duels_opponent_idx  ON duels(opponent_id);
CREATE INDEX IF NOT EXISTS duels_open_idx      ON duels(status) WHERE status IN ('pending', 'active');

ALTER TABLE duels ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON duels TO authenticated;

DROP POLICY IF EXISTS "duels: participant read" ON duels;
CREATE POLICY "duels: participant read"
  ON duels FOR SELECT
  USING (challenger_id = auth.uid() OR opponent_id = auth.uid());


-- ── duel_participants ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS duel_participants (
  duel_id         UUID    NOT NULL REFERENCES duels(id)    ON DELETE CASCADE,
  user_id         UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  result_id       TEXT    REFERENCES results(id) ON DELETE SET NULL,
  -- Server-stamped by start_duel_leg(). The client never supplies timing.
  started_at      TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  correct         INTEGER,
  total           INTEGER,
  elapsed_seconds INTEGER,
  timed_out       BOOLEAN NOT NULL DEFAULT FALSE,
  rating_before   FLOAT8,
  rating_after    FLOAT8,
  PRIMARY KEY (duel_id, user_id)
);

ALTER TABLE duel_participants ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON duel_participants TO authenticated;

DROP POLICY IF EXISTS "duel_participants: participant read" ON duel_participants;
CREATE POLICY "duel_participants: participant read"
  ON duel_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM duels d
      WHERE d.id = duel_participants.duel_id
        AND (d.challenger_id = auth.uid() OR d.opponent_id = auth.uid())
    )
  );


-- ── create_duel ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_duel(
  p_opponent_id UUID,
  p_group_id    UUID,
  p_subject     TEXT DEFAULT NULL,
  p_difficulty  TEXT DEFAULT 'mixed',
  p_size        INT  DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_qids     TEXT[];
  v_quiz     TEXT := gen_random_uuid()::TEXT;
  v_duel     UUID;
  v_subject_label TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_opponent_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_duel_yourself');
  END IF;
  -- Both players must be in the group. Reuses 014's helper.
  IF NOT is_group_member(p_group_id, v_me) OR NOT is_group_member(p_group_id, p_opponent_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_group_members');
  END IF;
  IF p_size < 1 OR p_size > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_size');
  END IF;

  -- One open duel per pair, so a challenge cannot be spammed.
  IF EXISTS (
    SELECT 1 FROM duels d
    WHERE d.status IN ('pending', 'active')
      AND ((d.challenger_id = v_me AND d.opponent_id = p_opponent_id)
        OR (d.challenger_id = p_opponent_id AND d.opponent_id = v_me))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duel_already_open');
  END IF;

  -- Sample from the public pool only — never group or private questions, so a
  -- player cannot duel on material they wrote.
  SELECT array_agg(q.id) INTO v_qids
  FROM (
    SELECT id FROM questions
    WHERE status = 'approved'
      AND visibility = 'shared'
      AND (p_subject IS NULL OR subject = p_subject)
      AND (p_difficulty = 'mixed' OR difficulty = p_difficulty)
    ORDER BY random()
    LIMIT p_size
  ) q;

  IF v_qids IS NULL OR array_length(v_qids, 1) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_questions');
  END IF;

  v_subject_label := COALESCE(p_subject, 'Mixed');

  -- visibility 'shared' is deliberate: the duel quiz is ordinary pool material,
  -- so it earns XP through 015's rules like any other quiz.
  INSERT INTO quizzes (id, title, tags, difficulty_mix, question_ids, mode, created_by, visibility)
  VALUES (v_quiz, 'Duel — ' || v_subject_label, '{}', p_difficulty, v_qids, 'ordinary', v_me, 'shared');

  INSERT INTO duels (quiz_id, group_id, challenger_id, opponent_id, subject, difficulty, size)
  VALUES (v_quiz, p_group_id, v_me, p_opponent_id, p_subject, p_difficulty, array_length(v_qids, 1))
  RETURNING id INTO v_duel;

  INSERT INTO duel_participants (duel_id, user_id) VALUES (v_duel, v_me), (v_duel, p_opponent_id);

  PERFORM notify(p_opponent_id, 'duel_challenge', jsonb_build_object(
    'duel_id', v_duel,
    'from', (SELECT COALESCE(display_name, 'A learner') FROM profiles WHERE id = v_me),
    'subject', v_subject_label
  ));

  RETURN jsonb_build_object('ok', true, 'duel_id', v_duel, 'quiz_id', v_quiz);
END;
$$;

REVOKE ALL ON FUNCTION create_duel(UUID, UUID, TEXT, TEXT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_duel(UUID, UUID, TEXT, TEXT, INT) TO authenticated;


-- ── respond_to_duel: accept or decline a challenge ──────────
CREATE OR REPLACE FUNCTION respond_to_duel(p_duel_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_d  duels%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_d FROM duels WHERE id = p_duel_id;
  IF v_d.id IS NULL OR v_d.opponent_id <> v_me OR v_d.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  IF NOT p_accept THEN
    UPDATE duels SET status = 'declined', resolved_at = NOW() WHERE id = p_duel_id;
    PERFORM notify(v_d.challenger_id, 'duel_declined', jsonb_build_object(
      'duel_id', p_duel_id,
      'by', (SELECT COALESCE(display_name, 'Your opponent') FROM profiles WHERE id = v_me)
    ));
    RETURN jsonb_build_object('ok', true, 'status', 'declined');
  END IF;

  UPDATE duels
  SET status = 'active', deadline_at = NOW() + INTERVAL '3 days'
  WHERE id = p_duel_id;

  PERFORM notify(v_d.challenger_id, 'duel_accepted', jsonb_build_object(
    'duel_id', p_duel_id,
    'by', (SELECT COALESCE(display_name, 'Your opponent') FROM profiles WHERE id = v_me)
  ));

  RETURN jsonb_build_object('ok', true, 'status', 'active', 'quiz_id', v_d.quiz_id);
END;
$$;

REVOKE ALL ON FUNCTION respond_to_duel(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION respond_to_duel(UUID, BOOLEAN) TO authenticated;


-- ── start_duel_leg: the only way started_at gets set ────────
CREATE OR REPLACE FUNCTION start_duel_leg(p_duel_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_d  duels%ROWTYPE;
  v_started TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_d FROM duels WHERE id = p_duel_id;
  IF v_d.id IS NULL OR (v_d.challenger_id <> v_me AND v_d.opponent_id <> v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_participant');
  END IF;
  IF v_d.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  -- Idempotent: re-opening the quiz must not restart the clock.
  UPDATE duel_participants
  SET started_at = COALESCE(started_at, NOW())
  WHERE duel_id = p_duel_id AND user_id = v_me AND submitted_at IS NULL
  RETURNING started_at INTO v_started;

  RETURN jsonb_build_object(
    'ok', true,
    'quiz_id', v_d.quiz_id,
    'started_at', v_started,
    'time_limit_seconds', v_d.time_limit_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION start_duel_leg(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION start_duel_leg(UUID) TO authenticated;


-- ── resolve_duel ────────────────────────────────────────────
-- Idempotent, and the single place a rating ever changes.
CREATE OR REPLACE FUNCTION resolve_duel(p_duel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d  duels%ROWTYPE;
  a    duel_participants%ROWTYPE;   -- challenger
  b    duel_participants%ROWTYPE;   -- opponent
  a_r  player_ratings%ROWTYPE;
  b_r  player_ratings%ROWTYPE;
  a_score FLOAT8;
  a_eff INT; b_eff INT;
  a_new RECORD; b_new RECORD;
  v_winner UUID; v_draw BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_d FROM duels WHERE id = p_duel_id FOR UPDATE;
  IF v_d.id IS NULL OR v_d.status NOT IN ('active', 'expired') THEN
    RETURN;
  END IF;

  SELECT * INTO a FROM duel_participants WHERE duel_id = p_duel_id AND user_id = v_d.challenger_id;
  SELECT * INTO b FROM duel_participants WHERE duel_id = p_duel_id AND user_id = v_d.opponent_id;

  -- Both legs must be in, unless the deadline has passed (a no-show forfeits).
  IF (a.submitted_at IS NULL OR b.submitted_at IS NULL)
     AND (v_d.deadline_at IS NULL OR NOW() < v_d.deadline_at) THEN
    RETURN;
  END IF;

  -- A leg that never arrived, or arrived outside the time limit, scores zero.
  a_eff := CASE WHEN a.submitted_at IS NULL OR a.timed_out THEN -1 ELSE COALESCE(a.correct, 0) END;
  b_eff := CASE WHEN b.submitted_at IS NULL OR b.timed_out THEN -1 ELSE COALESCE(b.correct, 0) END;

  IF a_eff > b_eff THEN
    a_score := 1;
  ELSIF a_eff < b_eff THEN
    a_score := 0;
  ELSE
    -- Same score: faster player wins. Only a genuine tie on both is a draw.
    IF COALESCE(a.elapsed_seconds, 2147483647) < COALESCE(b.elapsed_seconds, 2147483647) THEN
      a_score := 1;
    ELSIF COALESCE(a.elapsed_seconds, 2147483647) > COALESCE(b.elapsed_seconds, 2147483647) THEN
      a_score := 0;
    ELSE
      a_score := 0.5;
    END IF;
  END IF;

  INSERT INTO player_ratings (user_id) VALUES (v_d.challenger_id) ON CONFLICT DO NOTHING;
  INSERT INTO player_ratings (user_id) VALUES (v_d.opponent_id)   ON CONFLICT DO NOTHING;
  SELECT * INTO a_r FROM player_ratings WHERE user_id = v_d.challenger_id;
  SELECT * INTO b_r FROM player_ratings WHERE user_id = v_d.opponent_id;

  -- Both updates read the PRE-duel rating of the other player, so the result
  -- does not depend on which one is written first.
  SELECT * INTO a_new FROM glicko2_update(a_r.rating, a_r.rd, a_r.vol, b_r.rating, b_r.rd, a_score);
  SELECT * INTO b_new FROM glicko2_update(b_r.rating, b_r.rd, b_r.vol, a_r.rating, a_r.rd, 1 - a_score);

  UPDATE player_ratings
  SET rating = a_new.rating, rd = a_new.rd, vol = a_new.vol,
      matches_played = matches_played + 1, last_match_at = NOW()
  WHERE user_id = v_d.challenger_id;

  UPDATE player_ratings
  SET rating = b_new.rating, rd = b_new.rd, vol = b_new.vol,
      matches_played = matches_played + 1, last_match_at = NOW()
  WHERE user_id = v_d.opponent_id;

  UPDATE duel_participants SET rating_before = a_r.rating, rating_after = a_new.rating
  WHERE duel_id = p_duel_id AND user_id = v_d.challenger_id;
  UPDATE duel_participants SET rating_before = b_r.rating, rating_after = b_new.rating
  WHERE duel_id = p_duel_id AND user_id = v_d.opponent_id;

  IF a_score = 1 THEN
    v_winner := v_d.challenger_id;
  ELSIF a_score = 0 THEN
    v_winner := v_d.opponent_id;
  ELSE
    v_draw := TRUE;
  END IF;

  UPDATE duels
  SET status = 'resolved', winner_id = v_winner, is_draw = v_draw, resolved_at = NOW()
  WHERE id = p_duel_id;

  -- Payload carries the OUTCOME only, never a rating number.
  PERFORM notify(v_d.challenger_id, 'duel_resolved', jsonb_build_object(
    'duel_id', p_duel_id,
    'outcome', CASE WHEN v_draw THEN 'draw' WHEN v_winner = v_d.challenger_id THEN 'win' ELSE 'loss' END
  ));
  PERFORM notify(v_d.opponent_id, 'duel_resolved', jsonb_build_object(
    'duel_id', p_duel_id,
    'outcome', CASE WHEN v_draw THEN 'draw' WHEN v_winner = v_d.opponent_id THEN 'win' ELSE 'loss' END
  ));
END;
$$;

REVOKE ALL ON FUNCTION resolve_duel(UUID) FROM public, anon;


-- ── record a submitted leg, and resolve when both are in ────
-- AFTER INSERT on results: the players submit through the ordinary quiz flow,
-- so this is where a duel learns that a leg finished. Doing it in the database
-- means it cannot be skipped by a client that simply never calls a "finish
-- duel" endpoint.
CREATE OR REPLACE FUNCTION tg_duel_record_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duel   UUID;
  v_limit  INT;
  v_started TIMESTAMPTZ;
  v_elapsed INT;
BEGIN
  SELECT d.id, d.time_limit_seconds, dp.started_at
  INTO v_duel, v_limit, v_started
  FROM duels d
  JOIN duel_participants dp ON dp.duel_id = d.id AND dp.user_id = NEW.user_id
  WHERE d.quiz_id = NEW.quiz_id
    AND d.status = 'active'
    AND dp.submitted_at IS NULL;

  IF v_duel IS NULL THEN
    RETURN NEW;   -- an ordinary quiz, not a duel leg
  END IF;

  -- Elapsed comes from the server-stamped start, never from the client's timer.
  v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_started, NEW.taken_at)))::INT);

  UPDATE duel_participants
  SET result_id = NEW.id,
      submitted_at = NOW(),
      correct = NEW.correct,
      total = NEW.total_questions,
      elapsed_seconds = v_elapsed,
      timed_out = (v_started IS NOT NULL AND v_elapsed > v_limit)
  WHERE duel_id = v_duel AND user_id = NEW.user_id;

  PERFORM resolve_duel(v_duel);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS duel_record_result_trg ON results;
CREATE TRIGGER duel_record_result_trg
  AFTER INSERT ON results
  FOR EACH ROW EXECUTE FUNCTION tg_duel_record_result();


-- ── expire_duels: lazy sweep, called when listing duels ─────
-- There is no pg_cron in this project, so overdue duels are settled whenever
-- someone looks at their duel list. Idempotent.
CREATE OR REPLACE FUNCTION expire_duels()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN
    SELECT id FROM duels
    WHERE status = 'active' AND deadline_at IS NOT NULL AND NOW() >= deadline_at
  LOOP
    PERFORM resolve_duel(d.id);
  END LOOP;

  -- A challenge nobody answered within a week just lapses; no rating changes.
  UPDATE duels
  SET status = 'expired', resolved_at = NOW()
  WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days';
END;
$$;

REVOKE ALL ON FUNCTION expire_duels() FROM public, anon;
GRANT EXECUTE ON FUNCTION expire_duels() TO authenticated;


-- ── get_my_duels: the duel inbox ────────────────────────────
CREATE OR REPLACE FUNCTION get_my_duels()
RETURNS TABLE (
  duel_id       UUID,
  quiz_id       TEXT,
  group_id      UUID,
  group_name    TEXT,
  status        TEXT,
  subject       TEXT,
  difficulty    TEXT,
  size          INT,
  is_challenger BOOLEAN,
  opponent_name TEXT,
  outcome       TEXT,
  my_correct    INT,
  their_correct INT,
  my_elapsed    INT,
  their_elapsed INT,
  i_submitted   BOOLEAN,
  deadline_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.quiz_id,
    d.group_id,
    g.name,
    d.status,
    d.subject,
    d.difficulty,
    d.size,
    d.challenger_id = v_me,
    COALESCE(op.display_name, 'A learner'),
    CASE
      WHEN d.status <> 'resolved' THEN NULL
      WHEN d.is_draw               THEN 'draw'
      WHEN d.winner_id = v_me      THEN 'win'
      ELSE 'loss'
    END,
    me.correct,
    them.correct,
    me.elapsed_seconds,
    them.elapsed_seconds,
    me.submitted_at IS NOT NULL,
    d.deadline_at,
    d.created_at
  FROM duels d
  JOIN groups g ON g.id = d.group_id
  JOIN duel_participants me   ON me.duel_id = d.id AND me.user_id = v_me
  JOIN duel_participants them ON them.duel_id = d.id AND them.user_id <> v_me
  JOIN profiles op ON op.id = them.user_id
  WHERE d.challenger_id = v_me OR d.opponent_id = v_me
  ORDER BY
    CASE d.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
    d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_my_duels() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_duels() TO authenticated;


-- ── my tier, without exposing the number ────────────────────
CREATE OR REPLACE FUNCTION get_my_tier()
RETURNS TABLE (tier TEXT, matches_played INT, placement_remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tier_for(COALESCE(pr.rating, 1500), COALESCE(pr.matches_played, 0)),
    COALESCE(pr.matches_played, 0),
    GREATEST(0, 5 - COALESCE(pr.matches_played, 0))
  FROM (SELECT 1) _
  LEFT JOIN player_ratings pr ON pr.user_id = v_me;
END;
$$;

REVOKE ALL ON FUNCTION get_my_tier() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_tier() TO authenticated;


-- ── competitive board ───────────────────────────────────────
-- Ordered by the hidden rating; only the tier is returned. Placement players
-- are excluded so the board is not padded with provisional badges.
CREATE OR REPLACE FUNCTION get_competitive_leaderboard(
  p_scope    TEXT DEFAULT 'global',
  p_group_id UUID DEFAULT NULL,
  p_limit    INT  DEFAULT 100,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  rank           BIGINT,
  user_id        UUID,
  display_name   TEXT,
  tier           TEXT,
  matches_played INT,
  is_me          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  IF p_scope = 'group' AND (p_group_id IS NULL OR NOT is_group_member(p_group_id, v_me)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    RANK() OVER (ORDER BY pr.rating DESC)::BIGINT,
    pr.user_id,
    p.display_name,
    tier_for(pr.rating, pr.matches_played),
    pr.matches_played,
    pr.user_id = v_me
  FROM player_ratings pr
  JOIN profiles p ON p.id = pr.user_id
  WHERE pr.matches_played >= 5
    AND NOT p.leaderboard_opt_out
    AND (
      p_scope <> 'group'
      OR EXISTS (
        SELECT 1 FROM group_members m
        WHERE m.group_id = p_group_id AND m.user_id = pr.user_id
      )
    )
  ORDER BY pr.rating DESC, p.display_name
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION get_competitive_leaderboard(TEXT, UUID, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_competitive_leaderboard(TEXT, UUID, INT, INT) TO authenticated;


-- ── casual board: fill in the reserved tier column ──────────
-- 016 declared `tier` and returned NULL specifically so this could be added
-- without a DROP FUNCTION (changing a RETURNS TABLE signature forces one, which
-- breaks any client mid-deploy). Identical signature, so CREATE OR REPLACE is
-- enough. Only the two SELECT lists change: a LEFT JOIN onto player_ratings and
-- tier_for() in place of NULL::TEXT.
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_scope    TEXT DEFAULT 'global',
  p_group_id UUID DEFAULT NULL,
  p_subject  TEXT DEFAULT NULL,
  p_window   TEXT DEFAULT 'all',
  p_limit    INT  DEFAULT 100,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  rank         BIGINT,
  user_id      UUID,
  display_name TEXT,
  xp           BIGINT,
  tier         TEXT,
  is_me        BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me    UUID := auth.uid();
  v_since TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  IF p_scope = 'group' AND (p_group_id IS NULL OR NOT is_group_member(p_group_id, v_me)) THEN
    RETURN;
  END IF;

  v_since := CASE p_window
               WHEN '7d'  THEN NOW() - INTERVAL '7 days'
               WHEN '30d' THEN NOW() - INTERVAL '30 days'
               ELSE NULL
             END;

  RETURN QUERY
  WITH totals AS (
    SELECT r.user_id AS uid, SUM(r.xp_awarded)::BIGINT AS total
    FROM results r
    JOIN profiles pr ON pr.id = r.user_id
    WHERE r.leaderboard_eligible
      AND NOT pr.leaderboard_opt_out
      AND (v_since IS NULL OR r.taken_at >= v_since)
      AND (p_subject IS NULL OR r.subject = p_subject)
      AND (
        p_scope <> 'group'
        OR EXISTS (
          SELECT 1 FROM group_members m
          WHERE m.group_id = p_group_id AND m.user_id = r.user_id
        )
      )
    GROUP BY r.user_id
    HAVING SUM(r.xp_awarded) > 0
  )
  SELECT
    RANK() OVER (ORDER BY t.total DESC)::BIGINT,
    t.uid,
    pr.display_name,
    t.total,
    -- NULL for anyone who has not finished placements, so the casual board
    -- never shows a badge the competitive board would not.
    CASE WHEN plr.user_id IS NULL THEN NULL
         ELSE NULLIF(tier_for(plr.rating, plr.matches_played), 'unranked') END,
    t.uid = v_me
  FROM totals t
  JOIN profiles pr ON pr.id = t.uid
  LEFT JOIN player_ratings plr ON plr.user_id = t.uid
  ORDER BY t.total DESC, pr.display_name
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT) TO authenticated;


-- ── start_duel_leg_for_quiz: stamp the clock on entry ───────
-- Called by the quiz page once startOrResumeSession has confirmed the player is
-- actually in the quiz. Starting the clock on the "Play" button instead would
-- run it while a player who already has a different quiz active sits on that
-- page's redirect, and could time them out of a duel they never saw.
--
-- Idempotent (COALESCE keeps the original start on resume) and a silent no-op
-- for an ordinary quiz, so the quiz page can call it unconditionally.
CREATE OR REPLACE FUNCTION start_duel_leg_for_quiz(p_quiz_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  UPDATE duel_participants dp
  SET started_at = COALESCE(dp.started_at, NOW())
  FROM duels d
  WHERE d.id = dp.duel_id
    AND d.quiz_id = p_quiz_id
    AND d.status = 'active'
    AND dp.user_id = v_me
    AND dp.submitted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION start_duel_leg_for_quiz(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION start_duel_leg_for_quiz(TEXT) TO authenticated;
