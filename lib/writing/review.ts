import type { FeedbackContent } from "../feedback/content";
import { UUID_RE } from "../ids";

/**
 * WRITE-003 (docs/decisions/0225 Decision 4): Studio's Written answers tab, the
 * inbox rows and the Reviews nav target. Rows come from writing_review_queue()
 * (migration 109), which decides who may see which answer and every row's
 * status. This module only parses the URL filters, shapes rows and picks the
 * nav link: no access rule lives here.
 */

export const WRITING_STATUSES = ["waiting", "draft", "answered"] as const;
export type WritingStatus = (typeof WRITING_STATUSES)[number];

/** "to_review" (the default) is waiting + draft: every answer without published feedback. */
export const WRITING_STATUS_FILTERS = ["to_review", "all", ...WRITING_STATUSES] as const;
export type WritingStatusFilter = (typeof WRITING_STATUS_FILTERS)[number];
export const DEFAULT_WRITING_STATUS: WritingStatusFilter = "to_review";

export type WritingReviewRow = {
  submissionId: string;
  route: "cohort" | "linked";
  courseId: string;
  courseTitle: string;
  runId: string | null;
  runTitle: string | null;
  userId: string;
  learnerLabel: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrdinal: number;
  blockId: string;
  blockPrompt: unknown;
  body: string;
  submittedAt: string;
  updatedAt: string;
  feedbackBody: FeedbackContent | null;
  feedbackUpdatedAt: string | null;
  feedbackPublishedAt: string | null;
  status: WritingStatus;
};

export type WritingFilters = { course: string | null; status: WritingStatusFilter };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL → filters. An id that isn't a UUID or an unknown status falls back to the default. */
export function parseWritingFilters(params: Record<string, string | string[] | undefined>): WritingFilters {
  const course = first(params.course);
  const status = first(params.status);
  return {
    course: course && UUID_RE.test(course) ? course.toLowerCase() : null,
    status: (WRITING_STATUS_FILTERS as readonly string[]).includes(status ?? "")
      ? (status as WritingStatusFilter)
      : DEFAULT_WRITING_STATUS,
  };
}

/** Filters → query string, dropping defaults so a link stays short. */
export function writingFiltersQuery(f: Partial<WritingFilters>): string {
  const q = new URLSearchParams();
  if (f.course) q.set("course", f.course);
  if (f.status && f.status !== DEFAULT_WRITING_STATUS) q.set("status", f.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function matchesWritingStatus(status: WritingStatus, filter: WritingStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "to_review") return status === "waiting" || status === "draft";
  return status === filter;
}

/** RPC row (snake_case) → WritingReviewRow. */
export function toWritingReviewRow(r: Record<string, unknown>): WritingReviewRow {
  return {
    submissionId: r.submission_id as string,
    route: r.route === "linked" ? "linked" : "cohort",
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    runId: (r.run_id as string | null) ?? null,
    runTitle: (r.run_title as string | null) ?? null,
    userId: r.user_id as string,
    learnerLabel: ((r.learner_label as string | null) ?? "").trim() || "Learner",
    lessonId: r.lesson_id as string,
    lessonTitle: r.lesson_title as string,
    lessonOrdinal: r.lesson_ordinal as number,
    blockId: r.block_id as string,
    blockPrompt: r.block_prompt ?? null,
    body: r.body as string,
    submittedAt: r.submitted_at as string,
    updatedAt: r.updated_at as string,
    feedbackBody: (r.feedback_body as FeedbackContent | null) ?? null,
    feedbackUpdatedAt: (r.feedback_updated_at as string | null) ?? null,
    feedbackPublishedAt: (r.feedback_published_at as string | null) ?? null,
    status: r.status as WritingStatus,
  };
}

/** The learner changed the answer after the teacher saved a draft (never after publishing: that locks). */
export function editedAfterDraft(r: Pick<WritingReviewRow, "status" | "updatedAt" | "feedbackUpdatedAt">): boolean {
  return r.status === "draft" && r.feedbackUpdatedAt != null && r.updatedAt > r.feedbackUpdatedAt;
}

/** The nav badge and inbox count: answers still waiting. */
export function writingWaitingCount(rows: readonly WritingReviewRow[]): number {
  return rows.filter((r) => r.status === "waiting").length;
}

/** Filter options: the courses that have an answer, by title. */
export function writingCourseOptions(rows: readonly WritingReviewRow[]): { id: string; title: string }[] {
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.courseId, r.courseTitle);
  return [...m].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
}

export type WritingInboxGroup = { courseId: string; courseTitle: string; count: number; oldestAt: string; href: string };

/** Waiting answers per course, oldest first; each links to the tab filtered to that course. */
export function writingWaitingGroups(rows: readonly WritingReviewRow[]): WritingInboxGroup[] {
  const groups = new Map<string, WritingInboxGroup>();
  for (const r of rows) {
    if (r.status !== "waiting") continue;
    const g = groups.get(r.courseId);
    if (!g) {
      groups.set(r.courseId, {
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        count: 1,
        oldestAt: r.submittedAt,
        href: `/studio/writing${writingFiltersQuery({ course: r.courseId, status: "waiting" })}`,
      });
    } else {
      g.count += 1;
      if (r.submittedAt < g.oldestAt) g.oldestAt = r.submittedAt;
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.oldestAt.localeCompare(b.oldestAt) || a.courseTitle.localeCompare(b.courseTitle),
  );
}

/**
 * The sidebar's one "Reviews" entry (0225 Decision 4, superseding 0208 Decision 2's label).
 * Opens the recordings queue while a recording waits, else the written answers while one
 * waits, else the AI feedback list (which covers every course). A null count (its read
 * failed) counts as nothing waiting there. The badge sums what is known; it is hidden
 * (null) only when both reads failed, so one failing read never hides the other's work.
 */
export function reviewsNav(
  recordingsWaiting: number | null,
  writingWaiting: number | null,
): { href: string; badge: number | null } {
  const rec = recordingsWaiting ?? 0;
  const wri = writingWaiting ?? 0;
  const href = rec > 0 ? "/studio/reviews" : wri > 0 ? "/studio/writing" : "/studio/voice";
  const badge = recordingsWaiting == null && writingWaiting == null ? null : rec + wri;
  return { href, badge };
}
