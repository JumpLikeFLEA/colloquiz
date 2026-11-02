import { needsLastOpened, pickContinueLesson, type ContinueCandidate } from "./continueLesson";
import {
  courseProgress,
  type AttemptsByLessonSlug,
  type CourseProgress,
  type LessonState,
  type PublicCourseLesson,
} from "./coursePageProgress";

/**
 * PROG-008 (docs/decisions/0209) — "has this learner finished the course?",
 * decided from what the lesson page already holds: the signed-in learner's
 * `get_course_attempt_summary` map, or the anonymous visitor's local stores
 * turned into the same shape (`anonAttemptSummary`), plus this session's
 * result for the lesson on screen. Pure, so the lesson page and the course
 * page share one rule.
 *
 * Per-lesson completion is NOT decided here: `complete` in the summary is
 * `lesson_completion()`'s (docs/decisions/0143), and this session's own
 * result only says what the summary cannot know yet (the attempt that just
 * finished the lesson may still be uploading).
 *
 * The course is complete when it has at least one lesson and EVERY listed
 * lesson is `open` to the caller and complete. A lesson that is not open
 * (a cohort learner's `scheduled` week, a sign-in or paid lesson) can't be
 * finished, so it keeps the course incomplete until it opens and is done:
 * "lessons N of N" is never shown with lessons still to come (0209 Decision 1).
 */

/** What this session knows about the lesson on screen. `complete` follows
 * 0143: every exercise answered, or a lesson with no exercises opened. */
export type SessionLessonResult = { slug: string; complete: boolean; percent: number | null };

type CompletionLesson = ContinueCandidate & Pick<PublicCourseLesson, "slug" | "state">;

/** The summary with this session's result folded in. A lesson the summary
 * already has as complete stays complete (a retake never undoes it), and the
 * best score is never lowered (docs/handoff.md, "Display the best score"). */
export function withSessionResult(attempts: AttemptsByLessonSlug, session: SessionLessonResult): AttemptsByLessonSlug {
  if (!session.complete) return attempts;
  const prior = attempts[session.slug];
  const best =
    prior?.bestPercent != null && session.percent != null
      ? Math.max(prior.bestPercent, session.percent)
      : (session.percent ?? prior?.bestPercent ?? null);
  return {
    ...attempts,
    [session.slug]: {
      bestPercent: best,
      complete: true,
      exercisesAnswered: prior?.exercisesTotal ?? prior?.exercisesAnswered ?? 0,
      exercisesTotal: prior?.exercisesTotal ?? 0,
    },
  };
}

export function isCourseComplete(lessons: readonly CompletionLesson[], attempts: AttemptsByLessonSlug): boolean {
  return lessons.length > 0 && lessons.every((l) => l.state === "open" && attempts[l.slug]?.complete === true);
}

/** The first open lesson that is not complete, other than `currentSlug`,
 * by `pickContinueLesson`'s rule (PROG-003). Null when every open lesson is
 * complete: `pickContinueLesson` would then fall back to the last opened
 * lesson, which is a "continue" target, not a "next" one. */
export function nextUnfinishedLesson<T extends CompletionLesson>(
  lessons: readonly T[],
  attempts: AttemptsByLessonSlug,
  currentSlug: string,
): T | null {
  // The lesson on screen is treated as complete for the pick: it is never its
  // own "next", and it is what makes the learner engaged (pickContinueLesson
  // returns null before anything is).
  const marked: AttemptsByLessonSlug = {
    ...attempts,
    [currentSlug]: { ...(attempts[currentSlug] ?? { bestPercent: null, exercisesAnswered: 0, exercisesTotal: 0 }), complete: true },
  };
  if (needsLastOpened(lessons, marked)) return null;
  return pickContinueLesson(lessons, marked, null);
}

/** Everything the completion card needs, for a lesson the learner has just
 * finished in this session. */
export function courseCompletionView<T extends CompletionLesson>(
  lessons: readonly T[],
  attempts: AttemptsByLessonSlug,
  session: SessionLessonResult,
): {
  complete: boolean;
  /** The two numbers, never blended (docs/handoff.md). */
  progress: CourseProgress;
  next: T | null;
} {
  const merged = withSessionResult(attempts, session);
  return {
    complete: isCourseComplete(lessons, merged),
    progress: courseProgress(lessons, merged),
    next: nextUnfinishedLesson(lessons, merged, session.slug),
  };
}

/** The course to offer after this one: the next in catalogue order,
 * wrapping round; the first listed course when this one isn't listed (a
 * teacher's unlisted course, 0171); null when there is no other. */
export function nextCatalogueCourse<T extends { slug: string }>(courses: readonly T[], currentSlug: string): T | null {
  const others = courses.filter((c) => c.slug !== currentSlug);
  if (others.length === 0) return null;
  const index = courses.findIndex((c) => c.slug === currentSlug);
  return index === -1 ? others[0] : courses[(index + 1) % courses.length];
}

/**
 * What the lesson page hands its completion card about the course (PROG-008).
 * Plain JSON across the RSC boundary. `attempts` is the signed-in learner's
 * server summary; null means an anonymous visitor, whose summary the card
 * builds in the browser from the local stores (`anonAttemptSummary`), which
 * is why each lesson carries its current `versionId` and `itemCount`.
 */
export type LessonCourseContext = {
  title: string;
  /** The lesson on screen. */
  lessonSlug: string;
  lessons: { slug: string; title: string; state: LessonState; versionId: string | null; itemCount: number }[];
  attempts: AttemptsByLessonSlug | null;
  nextCourse: { slug: string; title: string } | null;
};
