/**
 * SHELL-008 — pure helpers for the course page, kept import-free (no
 * `@/lib/supabase/server`) so they're unit-testable under the "unit" vitest
 * project, which has no `@/` alias (vitest.config.mts, docs/decisions/0004).
 * lib/coursePage.ts (the server-bound data fetcher) imports `PublicCourseLesson`
 * from here as a type only.
 */

/** `lessons.access_level` (migration 055, docs/decisions/0094); one
 * definition, in lib/lessonAccessLevels.ts (AUTH-009). */
import type { LessonAccessLevel } from "./lessonAccessLevels";
export type { LessonAccessLevel };

/**
 * What the CALLER may do with a lesson, as `course_lesson_states` /
 * `lesson_state` (migration 055) return it. Derived in SQL from
 * `can_read_lesson`, the one entitlement function; TypeScript only reads it
 * (CNT-014, docs/decisions/0102).
 */
export type LessonState = "open" | "needs_sign_in" | "needs_entitlement";

export type LessonStateRow = { lesson_id: string; access_level: LessonAccessLevel; state: LessonState };

export type PublicCourseLesson = {
  slug: string;
  title: string;
  description: string | null;
  itemCount: number;
  estimatedMinutes: number | null;
  accessLevel: LessonAccessLevel;
  state: LessonState;
  ordinal: number;
};

/**
 * Joins each lesson row to its `course_lesson_states` row by id. Every row
 * the course page lists has one: the state function's rows are "listed OR
 * readable by the caller" (055 §4), a superset of what `publishedLessonsOnly`
 * keeps. A missing row means the two disagree, which is an invariant break,
 * not a state to render — so it throws (lib/publicLesson.ts precedent)
 * rather than guessing one.
 */
export function attachLessonStates<T extends { id: string }>(
  rows: readonly T[],
  states: readonly LessonStateRow[],
): (T & { accessLevel: LessonAccessLevel; state: LessonState })[] {
  const byId = new Map(states.map((s) => [s.lesson_id, s]));
  return rows.map((row) => {
    const s = byId.get(row.id);
    if (!s) throw new Error(`course_lesson_states returned no row for listed lesson ${row.id}`);
    return { ...row, accessLevel: s.access_level, state: s.state };
  });
}

/**
 * The course page's and the landing's one-tap CTA target (SHELL-008,
 * SHELL-010): the lowest-ordinal lesson whose SQL state for the caller is
 * `open` — for an anonymous visitor, exactly the lessons open to anyone.
 * Never re-derives "free" from position (docs/handoff.md, "Ordinal-derived
 * free samples"): ordinal only picks among lessons SQL already opened.
 * `null` when nothing is open to the caller (a cohort course a visitor
 * isn't enrolled in, from COH-002).
 */
export function firstOpenLesson(lessons: readonly PublicCourseLesson[]): PublicCourseLesson | null {
  return [...lessons].filter((l) => l.state === "open").sort((a, b) => a.ordinal - b.ordinal)[0] ?? null;
}

/**
 * ANON-011 — the sign-in screen's "start with an open lesson" link
 * (docs/decisions/0094 Decision 2, option C's residual gap). Same rule as
 * `firstOpenLesson`, over raw rows: published, not archived, state `open`
 * from `course_lesson_states`, first in the order the rows arrive (the
 * caller reads them ordinal-then-slug, the course page's order). `null` when
 * no lesson is open to the caller.
 */
export function firstOpenLessonLink<
  T extends { id: string; slug: string; title: string; published_version_id: string | null; archived_at: string | null },
>(rows: readonly T[], states: readonly LessonStateRow[]): { slug: string; title: string } | null {
  const open = attachLessonStates(publishedLessonsOnly(rows), states).find((l) => l.state === "open");
  return open ? { slug: open.slug, title: open.title } : null;
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

export type CourseTotals = {
  lessonCount: number;
  exerciseCount: number;
  totalMinutes: number | null;
  allFree: boolean;
  allOpen: boolean;
};

/**
 * The course page hero's size line and "whole course is free" flag
 * (docs/decisions/0079 D1/D3). `exerciseCount` sums each lesson's
 * `published_item_count` (= its practice-block count). `totalMinutes` follows
 * lib/catalogueSummary.ts's rule — null rather than a partial sum when any
 * lesson has no estimate, so the hero never understates the course and
 * never disagrees with the catalogue card that led here.
 *
 * `allFree` (the "whole course free" pill) is about the course, not the
 * caller: every lesson's SQL `access_level` is `anyone`. `allOpen` is about
 * the caller: every lesson's SQL `state` is `open` — it picks the CTA label,
 * so an entitled learner on a paid course isn't told "first free lesson".
 * For an anonymous visitor the two coincide. Both are false for a course
 * with no lessons: a claim about nothing has no evidence behind it.
 */
export function courseTotals(lessons: readonly PublicCourseLesson[]): CourseTotals {
  const lessonCount = lessons.length;
  const allFree = lessonCount > 0 && lessons.every((l) => l.accessLevel === "anyone");
  const allOpen = lessonCount > 0 && lessons.every((l) => l.state === "open");
  const totalMinutes =
    lessonCount > 0 && lessons.every((l) => l.estimatedMinutes !== null)
      ? lessons.reduce((sum, l) => sum + (l.estimatedMinutes ?? 0), 0)
      : null;
  const exerciseCount = lessons.reduce((sum, l) => sum + l.itemCount, 0);
  return { lessonCount, exerciseCount, totalMinutes, allFree, allOpen };
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
