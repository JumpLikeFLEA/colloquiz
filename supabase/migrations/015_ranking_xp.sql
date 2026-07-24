-- ============================================================
-- 015_ranking_xp.sql
--
-- Turns XP from a private counter into a rankable quantity, ahead of the
-- leaderboards in 016.
--
-- Three problems with XP as it stood:
--   • it ignored difficulty (easy and hard both paid 10), so once XP ranks
--     people, grinding easy questions is strictly optimal;
--   • every Quick Play mints a fresh quiz id, so replaying the same material
--     paid full price forever and per-quiz de-duplication would catch nothing;
--   • a result carried no subject, so per-subject boards had no source data.
--
-- What this adds:
--   • results.xp_awarded / .subject / .leaderboard_eligible
--   • user_question_xp — the novelty ledger: a question pays full XP the first
--     time a user answers it CORRECTLY, and REPEAT_RATE thereafter
--   • profiles.leaderboard_opt_out
--   • xp_weight() / xp_completion_bonus() — the pricing rules, in one place,
--     shared by the backfill and the guard trigger
--   • results_price() BEFORE INSERT trigger: the database, not the client,
--     decides xp_awarded / subject / leaderboard_eligible and writes the
--     ledger. See the note on trust below.
--   • an exact rebase of every historical result under the new rules
--
-- Mirrors lib/scoring.ts. If you change the weights in one, change both.
--
-- Safe to re-apply: all operations are idempotent, INCLUDING the backfill —
-- it recomputes from source columns rather than accumulating.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── results: pricing + attribution columns ──────────────────
ALTER TABLE results ADD COLUMN IF NOT EXISTS xp_awarded           INTEGER NOT NULL DEFAULT 0;
-- NULL = a genuinely cross-subject quiz (Random Quiz, tag-only Deep Dive).
-- Those count for the all-subjects board only, rather than being misfiled.
ALTER TABLE results ADD COLUMN IF NOT EXISTS subject              TEXT;
ALTER TABLE results ADD COLUMN IF NOT EXISTS leaderboard_eligible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS results_user_taken_idx
  ON results (user_id, taken_at DESC);

-- Partial index: the boards only ever scan eligible rows.
CREATE INDEX IF NOT EXISTS results_leaderboard_idx
  ON results (subject, taken_at DESC)
  WHERE leaderboard_eligible;


-- ── profiles: leaderboard visibility ────────────────────────
-- Default visible: a ranking nobody is on is dead on arrival. The UI shows a
-- one-time notice on first visit so nobody is published without being told.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS leaderboard_opt_out BOOLEAN NOT NULL DEFAULT FALSE;


-- ── user_question_xp: the novelty ledger ────────────────────
-- One row per (user, question) the user has ever answered correctly. Presence
-- of a row means "this question has already paid you full XP".
CREATE TABLE IF NOT EXISTS user_question_xp (
  user_id         UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  question_id     TEXT        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  first_earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

ALTER TABLE user_question_xp ENABLE ROW LEVEL SECURITY;

-- SELECT only. No INSERT/UPDATE/DELETE grant: rows are written exclusively by
-- the SECURITY DEFINER trigger below, so a client cannot skip burning a
-- question's novelty (which would restore unlimited full-price replay) or
-- delete rows to reset it.
GRANT SELECT ON user_question_xp TO authenticated;

DROP POLICY IF EXISTS "user_question_xp: owner read" ON user_question_xp;
CREATE POLICY "user_question_xp: owner read"
  ON user_question_xp FOR SELECT
  USING (user_id = auth.uid());


-- ── pricing rules ───────────────────────────────────────────
-- Kept as functions so the backfill and the trigger cannot drift apart.
CREATE OR REPLACE FUNCTION xp_weight(p_difficulty TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_difficulty
           WHEN 'easy' THEN 6
           WHEN 'hard' THEN 16
           ELSE 10            -- 'medium', and anything unrecognised
         END::NUMERIC;
$$;

CREATE OR REPLACE FUNCTION xp_completion_bonus(p_ratio NUMERIC)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_ratio >= 1   THEN 50
           WHEN p_ratio >= 0.9 THEN 25
           WHEN p_ratio >= 0.8 THEN 10
           ELSE 0
         END;
$$;


-- ── guard: the database prices results, not the client ──────
-- results has a FOR ALL owner policy, so a user's own JWT can write result
-- rows directly through PostgREST — the API route is not a chokepoint. That
-- was tolerable while a result only fed the owner's dashboard; once xp_awarded
-- ranks people publicly it is not. This trigger recomputes the three
-- leaderboard columns from server-side truth (questions.correct_answer /
-- .difficulty / .subject and quizzes.visibility) and overwrites whatever was
-- submitted, and writes the novelty ledger in the same statement.
--
-- Same posture as the peer-review guard in 014: it cannot be enforced in the
-- API layer alone, so it lives in the database.
--
-- NOTE this does not make results unforgeable — a client can still submit an
-- answers array claiming answers it never gave, exactly as it could forge
-- `correct` before. What it does close is the cheap paths: inventing an XP
-- number outright, flagging a self-authored quiz as leaderboard-eligible, and
-- silently skipping the ledger write to keep replaying at full price.
CREATE OR REPLACE FUNCTION results_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base       NUMERIC := 0;
  v_novelty    NUMERIC := 0;
  v_correct    INTEGER := 0;
  v_total      INTEGER := 0;
  v_subjects   INTEGER := 0;
  v_subject    TEXT;
  v_multiplier NUMERIC := CASE WHEN NEW.mode = 'exam' THEN 1.5 ELSE 1 END;
BEGIN
  -- The scored set: every submitted answer not excluded by a report, joined to
  -- server-side truth. Priced and aggregated in one pass.
  WITH priced AS (
    SELECT
      q.difficulty,
      q.subject,
      (q.correct_answer IS NOT NULL AND a.user_answer = q.correct_answer) AS correct,
      NOT EXISTS (
        SELECT 1 FROM user_question_xp l
        WHERE l.user_id = NEW.user_id AND l.question_id = a.question_id
      ) AS is_new
    FROM jsonb_to_recordset(COALESCE(NEW.answers, '[]'::jsonb))
           AS a(question_id TEXT, user_answer TEXT)
    LEFT JOIN questions q ON q.id = a.question_id
    WHERE NOT (a.question_id = ANY (COALESCE(NEW.excluded_question_ids, '{}')))
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE correct),
    COALESCE(SUM(
      xp_weight(difficulty) * v_multiplier * CASE WHEN is_new THEN 1 ELSE 0.25 END
    ) FILTER (WHERE correct AND difficulty IS NOT NULL), 0),
    COALESCE(AVG(
      CASE WHEN is_new THEN 1 ELSE 0.25 END
    ) FILTER (WHERE correct AND difficulty IS NOT NULL), 0),
    COUNT(DISTINCT subject) FILTER (WHERE subject IS NOT NULL),
    MIN(subject)
  INTO v_total, v_correct, v_base, v_novelty, v_subjects, v_subject
  FROM priced;

  -- The completion bonus is scaled by the same novelty the answers earned;
  -- otherwise a perfect replay still collects it in full and yields 50% of
  -- first-play XP instead of the intended repeat rate.
  NEW.xp_awarded := ROUND(v_base)::INTEGER
    + ROUND(
        xp_completion_bonus(CASE WHEN v_total > 0 THEN v_correct::NUMERIC / v_total ELSE 0 END)
        * v_novelty
      )::INTEGER;
  -- Single-subject quiz => attribute it; genuinely mixed => NULL.
  NEW.subject := CASE WHEN v_subjects = 1 THEN v_subject ELSE NULL END;
  NEW.leaderboard_eligible := COALESCE(
    (SELECT z.visibility = 'shared' FROM quizzes z WHERE z.id = NEW.quiz_id), FALSE
  );

  -- Burn novelty for every question that just paid full price. Only correct
  -- answers consume it: a wrong answer earns nothing anyway, and spending the
  -- novelty on it would penalise going back to review what you missed.
  INSERT INTO user_question_xp (user_id, question_id, first_earned_at)
  SELECT NEW.user_id, a.question_id, NEW.taken_at
  FROM jsonb_to_recordset(COALESCE(NEW.answers, '[]'::jsonb))
         AS a(question_id TEXT, user_answer TEXT)
  JOIN questions q ON q.id = a.question_id
  WHERE NOT (a.question_id = ANY (COALESCE(NEW.excluded_question_ids, '{}')))
    AND a.user_answer = q.correct_answer
  ON CONFLICT (user_id, question_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS results_price_trg ON results;
CREATE TRIGGER results_price_trg
  BEFORE INSERT ON results
  FOR EACH ROW EXECUTE FUNCTION results_price();


-- ============================================================
-- Backfill. Set-based and idempotent — recomputes from source
-- columns, so re-running produces the same numbers.
-- ============================================================

-- Plain temp tables (not ON COMMIT DROP): the Supabase SQL editor does not
-- necessarily wrap a script in one explicit transaction, and ON COMMIT DROP
-- would then destroy each table at the implicit commit before the next
-- statement could read it. Temp tables die with the session regardless.
DROP TABLE IF EXISTS _mig015_events;
DROP TABLE IF EXISTS _mig015_correct;
DROP TABLE IF EXISTS _mig015_priced;
DROP TABLE IF EXISTS _mig015_subjects;

-- Every scored (result, question) pair. Derived from quizzes.question_ids
-- rather than results.answers, because rows written before 006 have an empty
-- answers array; correctness comes from wrong_question_ids either way.
CREATE TEMP TABLE _mig015_events AS
SELECT
  r.id                                                   AS result_id,
  r.user_id,
  r.taken_at,
  r.mode,
  r.correct                                              AS recorded_correct,
  r.total_questions                                      AS recorded_total,
  qid                                                    AS question_id,
  NOT (qid = ANY (COALESCE(r.wrong_question_ids, '{}'))) AS correct,
  q.difficulty,
  q.subject
FROM results r
JOIN quizzes z ON z.id = r.quiz_id
CROSS JOIN LATERAL unnest(z.question_ids) AS u(qid)
LEFT JOIN questions q ON q.id = u.qid
WHERE NOT (qid = ANY (COALESCE(r.excluded_question_ids, '{}')));

-- Rank each user's correct answers per question chronologically: the first is
-- novel and pays full price, the rest pay REPEAT_RATE. Questions deleted since
-- (difficulty IS NULL) are skipped — they were treated as wrong at the time.
CREATE TEMP TABLE _mig015_correct AS
SELECT
  e.*,
  row_number() OVER (
    PARTITION BY e.user_id, e.question_id
    ORDER BY e.taken_at, e.result_id
  ) AS rn
FROM _mig015_events e
WHERE e.correct AND e.difficulty IS NOT NULL;

-- Seed the ledger from the earliest correct answer per (user, question), so
-- existing users do not get a one-time windfall re-answering the whole pool at
-- full price on launch day.
INSERT INTO user_question_xp (user_id, question_id, first_earned_at)
SELECT user_id, question_id, taken_at
FROM _mig015_correct
WHERE rn = 1
ON CONFLICT (user_id, question_id) DO NOTHING;

CREATE TEMP TABLE _mig015_priced AS
SELECT
  c.result_id,
  SUM(
    xp_weight(c.difficulty)
      * CASE WHEN c.mode = 'exam' THEN 1.5 ELSE 1 END
      * CASE WHEN c.rn = 1 THEN 1 ELSE 0.25 END
  ) AS base,
  -- Mean novelty across this result's correct answers, used to scale the
  -- completion bonus exactly as the trigger and lib/scoring.ts do.
  AVG(CASE WHEN c.rn = 1 THEN 1 ELSE 0.25 END) AS novelty
FROM _mig015_correct c
GROUP BY c.result_id;

CREATE TEMP TABLE _mig015_subjects AS
SELECT
  e.result_id,
  CASE WHEN COUNT(DISTINCT e.subject) = 1 THEN MIN(e.subject) END AS subject
FROM _mig015_events e
WHERE e.subject IS NOT NULL
GROUP BY e.result_id;

-- Scalar subqueries rather than UPDATE ... FROM with LEFT JOINs: Postgres will
-- not accept a reference to the update target (r) inside a LEFT JOIN's ON
-- clause in the FROM list. These lookups are all PK/indexed and the row counts
-- are small, so the cost is irrelevant next to the correctness.
UPDATE results r
SET
  xp_awarded = ROUND(COALESCE(
      (SELECT p.base FROM _mig015_priced p WHERE p.result_id = r.id), 0
    ))::INTEGER
    + ROUND(
        xp_completion_bonus(
          CASE WHEN r.total_questions > 0
               THEN r.correct::NUMERIC / r.total_questions
               ELSE 0 END
        )
        * COALESCE((SELECT p.novelty FROM _mig015_priced p WHERE p.result_id = r.id), 0)
      )::INTEGER,
  subject = (SELECT s.subject FROM _mig015_subjects s WHERE s.result_id = r.id),
  leaderboard_eligible = COALESCE(
    (SELECT z.visibility = 'shared' FROM quizzes z WHERE z.id = r.quiz_id), FALSE
  );


-- ── rebase profiles.total_xp ────────────────────────────────
-- total_xp must equal quiz XP + achievement bonuses, or the sidebar's
-- "Level N · X XP" and the leaderboard will disagree and users will notice.
-- The reward table is duplicated from lib/achievements.ts (ACHIEVEMENTS[].xpReward);
-- keep them in step.
DROP TABLE IF EXISTS _mig015_achievement_xp;
CREATE TEMP TABLE _mig015_achievement_xp (achievement_id TEXT PRIMARY KEY, xp INTEGER);
INSERT INTO _mig015_achievement_xp (achievement_id, xp) VALUES
  ('first_quiz', 50), ('perfect_score', 100), ('high_achiever', 150),
  ('passing_grade', 100), ('comeback', 75),
  ('streak_3', 50), ('streak_7', 150), ('streak_30', 500), ('daily_habit', 200),
  ('curious_mind', 75), ('polymath', 150), ('deep_dive', 100),
  ('quiz_5', 50), ('quiz_25', 200), ('quiz_50', 500);

-- Snapshot the pre-rebase value first. Recomputing total_xp is the only
-- destructive step in this migration; keeping the old number makes it
-- reversible (UPDATE profiles SET total_xp = total_xp_pre_rebase) and lets you
-- see who moved and by how much. The COALESCE means re-applying the migration
-- never overwrites the original snapshot with an already-rebased value.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_xp_pre_rebase INTEGER;
UPDATE profiles SET total_xp_pre_rebase = COALESCE(total_xp_pre_rebase, total_xp);

-- Scalar subqueries rather than UPDATE ... FROM, so a profile with no results
-- and no achievements is correctly zeroed instead of being skipped by a join.
UPDATE profiles p
SET total_xp =
  COALESCE((
    SELECT SUM(r.xp_awarded) FROM results r WHERE r.user_id = p.id
  ), 0)
  + COALESCE((
    SELECT SUM(ax.xp)
    FROM user_achievements ua
    JOIN _mig015_achievement_xp ax ON ax.achievement_id = ua.achievement_id
    WHERE ua.user_id = p.id
  ), 0);
