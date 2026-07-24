import { Result, QuizMode, Difficulty } from "@/types";
import { v4 as uuidv4 } from "uuid";

export interface AnswerRecord {
  questionId: string;
  userAnswer: string;
}

/**
 * Server-side truth about a submitted question. Difficulty and subject drive XP
 * and leaderboard attribution, so they are read from the DB alongside the
 * correct answer — never taken from the client.
 */
export interface QuestionMeta {
  correctAnswer: string;
  difficulty: Difficulty;
  subject: string;
}

interface ScoredAnswer extends AnswerRecord {
  correct: boolean;
}

export interface ScoreResult {
  id: string;
  quiz_id: string;
  mode: QuizMode;
  score: number;
  correctCount: number;
  total: number;
  xp: number;
  /** Subject id when every scored question shares one, else null (a mixed quiz). */
  subject: string | null;
  /** Questions that earned full XP here for the first time — the novelty ledger rows to write. */
  newlyEarnedQuestionIds: string[];
  tag_breakdown: Result["tag_breakdown"];
  wrong_question_ids: string[];
  grading_type: "auto";
  taken_at: string;
  time_taken?: number;
}

/**
 * XP per correct answer, by difficulty. A flat rate made grinding easy
 * questions strictly optimal once XP became a ranking, so hard questions now
 * pay ~2.7× easy ones.
 */
export const XP_WEIGHTS: Record<Difficulty, number> = { easy: 6, medium: 10, hard: 16 };

/** Exam mode is longer and unforgiving, so it keeps its premium. */
export const EXAM_MULTIPLIER = 1.5;

/**
 * Rate paid for a question that has already earned full XP for this user.
 * Repetition is still worth something (it is how you actually learn), but it
 * cannot be farmed: every Quick Play mints a fresh quiz id, so per-quiz
 * de-duplication would catch nothing — novelty has to be tracked per question.
 */
export const REPEAT_RATE = 0.25;

function completionBonus(ratio: number): number {
  return ratio >= 1 ? 50 : ratio >= 0.9 ? 25 : ratio >= 0.8 ? 10 : 0;
}

/**
 * Score a submission and price it.
 *
 * `meta` is keyed by question id; a missing entry means the question no longer
 * exists (deleted or edited away) and is treated as wrong, as before.
 * `alreadyEarned` is the set of question ids that have previously paid this
 * user full XP — see user_question_xp.
 */
export function scoreQuiz(
  quizId: string,
  mode: QuizMode,
  answers: AnswerRecord[],
  meta: Record<string, QuestionMeta>,
  alreadyEarned: Set<string>,
  timeTaken?: number
): ScoreResult {
  const scored: ScoredAnswer[] = answers.map((a) => ({
    ...a,
    correct: meta[a.questionId] !== undefined && a.userAnswer === meta[a.questionId].correctAnswer,
  }));

  const correctCount = scored.filter((a) => a.correct).length;
  const total = answers.length;
  const wrongIds = scored.filter((a) => !a.correct).map((a) => a.questionId);

  // Only a CORRECT answer consumes a question's full-XP novelty. Getting it
  // wrong pays nothing anyway, and burning the novelty on a wrong answer would
  // penalise going back to review the questions you missed — the one habit this
  // app exists to encourage. Anti-farming is unaffected: a question can still
  // pay full XP only once, ever.
  const newlyEarnedQuestionIds = scored
    .filter((a) => a.correct && !alreadyEarned.has(a.questionId))
    .map((a) => a.questionId);
  const newlyEarned = new Set(newlyEarnedQuestionIds);

  const modeMultiplier = mode === "exam" ? EXAM_MULTIPLIER : 1;
  const correctAnswers = scored.filter((a) => a.correct);
  const base = correctAnswers.reduce((sum, a) => {
    const weight = XP_WEIGHTS[meta[a.questionId].difficulty] ?? XP_WEIGHTS.medium;
    const novelty = newlyEarned.has(a.questionId) ? 1 : REPEAT_RATE;
    return sum + weight * modeMultiplier * novelty;
  }, 0);

  // The completion bonus is scaled by the same novelty the answers earned,
  // otherwise replaying a quiz you have already mastered still pays the bonus
  // in full — a perfect repeat would yield 50% of first-play XP rather than
  // REPEAT_RATE, which is most of the farming incentive back again.
  const noveltyFactor =
    correctAnswers.length > 0
      ? correctAnswers.reduce(
          (sum, a) => sum + (newlyEarned.has(a.questionId) ? 1 : REPEAT_RATE),
          0
        ) / correctAnswers.length
      : 0;

  const ratio = total > 0 ? correctCount / total : 0;
  const xp = Math.round(base) + Math.round(completionBonus(ratio) * noveltyFactor);

  // Attribution for the per-subject leaderboards. Random Quiz and tag-only Deep
  // Dive selections genuinely span subjects; those get null and count only
  // towards the all-subjects board rather than being misfiled under one.
  const subjects = new Set(
    answers.map((a) => meta[a.questionId]?.subject).filter((s): s is string => !!s)
  );
  const subject = subjects.size === 1 ? [...subjects][0] : null;

  return {
    id: uuidv4(),
    quiz_id: quizId,
    mode,
    score: ratio,
    correctCount,
    total,
    xp,
    subject,
    newlyEarnedQuestionIds,
    tag_breakdown: {},
    wrong_question_ids: wrongIds,
    grading_type: "auto",
    taken_at: new Date().toISOString(),
    ...(timeTaken !== undefined && { time_taken: timeTaken }),
  };
}

export function isCorrect(correctAnswer: string, userAnswer: string): boolean {
  return correctAnswer.trim().toLowerCase() === userAnswer.trim().toLowerCase();
}
