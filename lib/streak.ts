// The daily streak: consecutive days on which the user COMPLETED a quiz.
// Signing in does nothing — `last_quiz_at` is only written when a result is
// saved (app/api/results/route.ts), so a login-only day never counts.
//
// `profiles.current_streak` is the value as of `profiles.last_quiz_at`. Nothing
// runs at midnight to expire it, so a stored streak goes stale the moment a day
// passes without a quiz. Every READ therefore goes through liveStreak(), which
// lapses it to 0 once the last quiz is older than yesterday; the stored column
// is only trusted while it is still current.

const DAY_MS = 86_400_000;

/** UTC calendar day, e.g. "2026-07-13". Matches how last_quiz_at is written. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

/**
 * The streak the user actually has right now. A quiz today or yesterday keeps
 * the stored streak alive (yesterday still counts — today is not over yet);
 * anything older means a day was missed and the streak is gone.
 */
export function liveStreak(lastQuizAt: string | null, storedStreak: number): number {
  if (!lastQuizAt) return 0;
  const last = dayKey(new Date(lastQuizAt).getTime());
  const now = Date.now();
  if (last === dayKey(now) || last === dayKey(now - DAY_MS)) return Math.max(storedStreak, 0);
  return 0;
}

/**
 * The streak after completing a quiz right now.
 * - already played today → unchanged (one quiz a day is what counts)
 * - played yesterday     → extended by one
 * - lapsed or first ever → a new streak of 1, because liveStreak() is 0
 */
export function streakAfterQuiz(lastQuizAt: string | null, storedStreak: number): number {
  const live = liveStreak(lastQuizAt, storedStreak);
  const playedToday =
    lastQuizAt !== null && dayKey(new Date(lastQuizAt).getTime()) === dayKey(Date.now());
  if (playedToday) return Math.max(live, 1);
  return live + 1;
}
