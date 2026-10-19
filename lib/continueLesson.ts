import type { AttemptsByLessonSlug, LessonState } from "./coursePageProgress";

/** What the rule reads of a lesson; a full `PublicCourseLesson` fits. */
export type ContinueCandidate = { slug: string; state: LessonState };

/**
 * PROG-003 (docs/decisions/0179) — where "Continue" goes. Pure, so the same
 * rule serves the course page, /my and the anonymous (local store) variant.
 *
 * A candidate is a lesson whose SQL `state` for the caller is `open`: that
 * keeps a cohort learner's `scheduled` lessons, and any sign-in or paid
 * lesson the caller cannot open, from ever being the target (entitlement
 * stays decided in SQL, docs/handoff.md "Entitlement is decided in one
 * place"; nothing here re-derives it).
 *
 * "Not yet attempted" is "not complete" in the sense of docs/decisions/0143:
 * a partly answered lesson is not complete, so it is where the learner left
 * off. The CTA appears only once the learner is engaged with the course: some
 * lesson complete or partly answered. Before that the caller keeps its
 * first-lesson CTA.
 *
 * When every candidate is complete the target is the last one the learner
 * opened (`lastOpenedSlug`), else the last candidate in course order.
 *
 * `lessons` must be in course order (the order the course page lists them).
 */
export function pickContinueLesson<T extends ContinueCandidate>(
  lessons: readonly T[],
  attempts: AttemptsByLessonSlug,
  lastOpenedSlug: string | null,
): T | null {
  const engaged = lessons.some((l) => {
    const a = attempts[l.slug];
    return a !== undefined && (a.complete || a.exercisesAnswered > 0);
  });
  if (!engaged) return null;

  const candidates = lessons.filter((l) => l.state === "open");
  if (candidates.length === 0) return null;

  const firstUnfinished = candidates.find((l) => attempts[l.slug]?.complete !== true);
  if (firstUnfinished) return firstUnfinished;

  return candidates.find((l) => l.slug === lastOpenedSlug) ?? candidates[candidates.length - 1];
}

/** True when every candidate is complete, i.e. the pick falls back to the
 * last opened lesson and the caller needs `lastOpenedSlug`. Lets the signed-in
 * path skip the `lesson_opens` read in the common case. */
export function needsLastOpened(lessons: readonly ContinueCandidate[], attempts: AttemptsByLessonSlug): boolean {
  const candidates = lessons.filter((l) => l.state === "open");
  return candidates.length > 0 && candidates.every((l) => attempts[l.slug]?.complete === true);
}
