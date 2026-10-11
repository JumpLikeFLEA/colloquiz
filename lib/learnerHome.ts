import { splitCalls, type RunCall } from "./cohortCoursePage";
import { FeedbackContentSchema, type FeedbackContent } from "./feedback/content";

/**
 * PROG-002 (docs/decisions/0120): the pure half of the learner home at
 * `/my`. Import-free apart from other pure lib modules, so the "unit"
 * vitest project can load it (docs/decisions/0004).
 *
 * Nothing here decides access. Every input is a row SQL already returned to
 * the learner under their own session (lib/learnerHomeData.ts lists the
 * reads). These functions only choose which rows to show and in what
 * order, and where they filter they only drop rows (the 0108 Decision 2
 * rule).
 */

export type HomeCourse = {
  id: string;
  slug: string;
  title: string;
  level: string;
  coverImageUrl: string | null;
  format: "self_paced" | "cohort";
};

/** One of the learner's own non-revoked `run_enrolments` rows. */
export type HomeEnrolment = {
  courseId: string;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  tier: "basic" | "extended";
};

export type ListedCourse = {
  course: HomeCourse;
  /** Non-revoked enrolments in this course's runs, latest run first. */
  enrolments: HomeEnrolment[];
  granted: boolean;
  attempted: boolean;
};

/**
 * The courses `/my` lists: every PUBLISHED course the learner has attempted
 * a lesson of, is enrolled in through a non-revoked run, or holds a grant
 * for. A grant or enrolment on a course that isn't published is dropped,
 * because its course page would 404 (lib/coursePage.ts). Courses with an
 * enrolment come first, since a running cohort has a schedule; inside each
 * group the catalogue's own order is kept.
 */
export function listedCourses(
  published: readonly HomeCourse[],
  attemptedCourseIds: ReadonlySet<string>,
  enrolments: readonly HomeEnrolment[],
  grantedCourseIds: ReadonlySet<string>,
): ListedCourse[] {
  const listed: ListedCourse[] = [];
  for (const course of published) {
    const own = enrolments
      .filter((e) => e.courseId === course.id)
      .sort((a, b) => Date.parse(b.runStartsAt) - Date.parse(a.runStartsAt));
    const granted = grantedCourseIds.has(course.id);
    const attempted = attemptedCourseIds.has(course.id);
    if (own.length === 0 && !granted && !attempted) continue;
    listed.push({ course, enrolments: own, granted, attempted });
  }
  return [...listed.filter((l) => l.enrolments.length > 0), ...listed.filter((l) => l.enrolments.length === 0)];
}

export type HomeCall = RunCall & { courseId: string };

/**
 * The next call for an extended enrolee: the soonest upcoming
 * `course_calls` row (058) of a run the learner holds an `extended`
 * enrolment in. `course_calls` already returns nothing to a basic learner;
 * the run filter only matters for a learner who is also an editor, who gets
 * every run's calls from SQL (`callsForAudience`'s reason, 0108 Decision 2).
 * "Upcoming" is `splitCalls`'s: a call stays joinable for two hours after it
 * starts.
 */
export function nextCall(calls: readonly HomeCall[], enrolments: readonly HomeEnrolment[], now: Date): HomeCall | null {
  const extendedRuns = new Set(enrolments.filter((e) => e.tier === "extended").map((e) => e.runId));
  const mine = calls.filter((c) => extendedRuns.has(c.runId));
  const first = splitCalls(mine, now).upcoming[0];
  return first ? (mine.find((c) => c.id === first.id) ?? null) : null;
}

type FeedbackBase = {
  /** Null when the course isn't readable as published any more. */
  courseSlug: string | null;
  courseTitle: string | null;
  publishedAt: string;
};

/** Raw rows: a published `voice_feedback` on one of the learner's own
 * takes, or a published `run_final_comments` row of their own. */
export type FeedbackRow =
  | (FeedbackBase & {
      kind: "voice";
      submissionId: string;
      /** Null when the lesson isn't readable (archived, unpublished). */
      lessonSlug: string | null;
      lessonTitle: string | null;
      body: unknown;
    })
  | (FeedbackBase & { kind: "final"; runId: string; body: unknown });

export type FeedbackItem =
  | (Omit<Extract<FeedbackRow, { kind: "voice" }>, "body"> & { body: FeedbackContent })
  | (Omit<Extract<FeedbackRow, { kind: "final" }>, "body"> & { body: FeedbackContent });

export function feedbackKey(item: FeedbackRow | FeedbackItem): string {
  return item.kind === "voice" ? `voice:${item.submissionId}` : `final:${item.runId}`;
}

/**
 * Published feedback, newest first. A body that doesn't parse as
 * FeedbackContent is dropped and reported through `onInvalid`, never
 * rendered raw (the lib/voiceTaskContext.ts precedent): the write RPCs
 * validate the same shape, so this means stored data and code disagree.
 */
export function feedbackItems(rows: readonly FeedbackRow[], onInvalid: (key: string) => void): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  for (const row of rows) {
    const parsed = FeedbackContentSchema.safeParse(row.body);
    if (!parsed.success) {
      onInvalid(feedbackKey(row));
      continue;
    }
    items.push({ ...row, body: parsed.data } as FeedbackItem);
  }
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
