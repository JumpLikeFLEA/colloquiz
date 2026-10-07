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

/**
 * Drops draft and archived lessons from a lessons read (docs/decisions/0079
 * D4). Same two conditions, and the same reason, as lib/catalogueSummary.ts:
 * "lessons: editor read" (migration 041) returns every lesson of a course to
 * a signed-in editor, drafts and archived ones included, so a public page
 * that leaned on RLS alone listed lessons to an editor that 404 on tap
 * (lib/publicLesson.ts serves `published_version_id IS NOT NULL` only). For
 * everyone else "lessons: published read" (041, amended by 044) has already
 * excluded these rows, so this changes nothing for them.
 */
export function publishedLessonsOnly<T extends { published_version_id: string | null; archived_at: string | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => r.published_version_id !== null && r.archived_at === null);
}

export type CourseTotals = { lessonCount: number; exerciseCount: number; totalMinutes: number | null; allFree: boolean };

/**
 * The course page hero's size line and "whole course is free" flag
 * (docs/decisions/0079 D1/D3). `exerciseCount` sums each lesson's
 * `published_item_count` (= its practice-block count). `totalMinutes` follows
 * lib/catalogueSummary.ts's rule — null rather than a partial sum when any
 * lesson has no estimate, so the hero never understates the course and
 * never disagrees with the catalogue card that led here. `allFree` is false
 * for a course with no lessons: "the whole course is free" about nothing
 * would be a claim with no evidence behind it.
 */
export function courseTotals(lessons: readonly PublicCourseLesson[]): CourseTotals {
  const lessonCount = lessons.length;
  const allFree = lessonCount > 0 && lessons.every((l) => l.inFreeSample);
  const totalMinutes =
    lessonCount > 0 && lessons.every((l) => l.estimatedMinutes !== null)
      ? lessons.reduce((sum, l) => sum + (l.estimatedMinutes ?? 0), 0)
      : null;
  const exerciseCount = lessons.reduce((sum, l) => sum + l.itemCount, 0);
  return { lessonCount, exerciseCount, totalMinutes, allFree };
}

export type LessonNav<T> = { position: number; total: number; next: T | null };

/**
 * "Урок N из M" and the next-lesson link for the lesson page
 * (docs/decisions/0079 D5), from the course's lessons already in display
 * order. Position is the 1-based INDEX in that list, never the ordinal:
 * ordinals are display order only, neither unique nor gapless (migration
 * 041's comment on `lessons.ordinal`), so "ordinal 30" is not "lesson 30".
 * `null` when the slug isn't in the list — the caller shows no position
 * rather than a wrong one.
 */
export function lessonNav<T extends { slug: string }>(lessons: readonly T[], slug: string): LessonNav<T> | null {
  const index = lessons.findIndex((l) => l.slug === slug);
  if (index === -1) return null;
  return { position: index + 1, total: lessons.length, next: lessons[index + 1] ?? null };
}
