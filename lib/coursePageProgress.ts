/**
 * SHELL-008 — pure helpers for the course page, kept import-free (no
 * `@/lib/supabase/server`) so they're unit-testable under the "unit" vitest
 * project, which has no `@/` alias (vitest.config.mts, docs/decisions/0004).
 * lib/coursePage.ts (the server-bound data fetcher) imports `PublicCourseLesson`
 * from here as a type only.
 */

export type PublicCourseLesson = {
  slug: string;
  title: string;
  description: string | null;
  itemCount: number;
  estimatedMinutes: number | null;
  inFreeSample: boolean;
  ordinal: number;
};

/**
 * "One tap from this page to the first free lesson" (SHELL-008 acceptance).
 * Lowest-ordinal free-sample lesson among whatever `getPublicCourse` already
 * returned — never re-derives "free" from position (docs/handoff.md,
 * "Ordinal-derived free samples" failure mode): `inFreeSample` is the
 * author's explicit flag, ordinal only picks among the lessons that already
 * carry it. `null` when a course has no free-sample lesson at all (shouldn't
 * happen given "the first course(s) are entirely free" at launch, but a
 * data invariant this module doesn't own isn't one it should assume).
 */
export function firstFreeLesson(lessons: readonly PublicCourseLesson[]): PublicCourseLesson | null {
  return [...lessons].filter((l) => l.inFreeSample).sort((a, b) => a.ordinal - b.ordinal)[0] ?? null;
}

/**
 * Per-lesson best score and course-wide progress, kept as pure functions
 * over an explicit attempts map rather than a live query — ANON-002
 * (localStorage store) and ANON-003 (`lesson_attempts` table + RPC) are
 * still open, so no attempt is recorded anywhere in this system today, for
 * anyone. Called with an empty map until one of those lands; `{}` isn't a
 * stub value standing in for real data, it's the actually-correct current
 * state (zero attempts exist), so "0 attempted / N, no average yet" and "no
 * best-score badge" are what this page should show right now. See
 * docs/decisions/0059-shell008-course-page.md for the reasoning and what
 * ANON-002/003 need to wire in here later.
 */
export type LessonAttemptSummary = { bestPercent: number };
export type AttemptsByLessonSlug = Readonly<Record<string, LessonAttemptSummary>>;

export function bestScoreForLesson(slug: string, attempts: AttemptsByLessonSlug): number | null {
  return attempts[slug]?.bestPercent ?? null;
}

export type CourseProgress = { attempted: number; total: number; averagePercent: number | null };

export function courseProgress(
  lessons: readonly PublicCourseLesson[],
  attempts: AttemptsByLessonSlug,
): CourseProgress {
  const total = lessons.length;
  const attemptedScores = lessons
    .map((l) => attempts[l.slug]?.bestPercent)
    .filter((p): p is number => p !== undefined);
  if (attemptedScores.length === 0) return { attempted: 0, total, averagePercent: null };
  const sum = attemptedScores.reduce((acc, p) => acc + p, 0);
  return { attempted: attemptedScores.length, total, averagePercent: Math.round(sum / attemptedScores.length) };
}
