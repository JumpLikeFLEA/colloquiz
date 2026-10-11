import type { FeedbackContent } from "@/lib/feedback/content";

/**
 * The Studio review queue (VOICE-006, docs/decisions/0114). Rows come from
 * review_queue() / review_final_comments() (migration 062), which decide
 * who may see what and every row's status. This module only parses the
 * page's URL filters and shapes rows for the page: no rule lives here.
 */

export const REVIEW_STATUSES = ["not_open", "not_sent", "waiting", "draft", "answered"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The status filter's options. "to_review" (the default) is waiting +
 * draft: every take without published feedback, the acceptance's queue. */
export const STATUS_FILTERS = ["to_review", "all", ...REVIEW_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const DEFAULT_STATUS_FILTER: StatusFilter = "to_review";

export type ReviewRow = {
  courseId: string;
  courseTitle: string;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  runEndsAt: string;
  enrolmentId: string;
  tier: string;
  userId: string;
  learnerEmail: string;
  inviteeName: string | null;
  inviteeContact: string | null;
  lessonId: string;
  lessonTitle: string;
  lessonOrdinal: number;
  week: number | null;
  opensAt: string;
  blockId: string;
  blockPrompt: unknown;
  blockMaxSeconds: number | null;
  submissionId: string | null;
  submittedAt: string | null;
  recordingRemoved: boolean;
  feedbackBody: FeedbackContent | null;
  feedbackUpdatedAt: string | null;
  feedbackPublishedAt: string | null;
  status: ReviewStatus;
};

export type FinalCommentRow = {
  courseId: string;
  courseTitle: string;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  runEndsAt: string;
  enrolmentId: string;
  tier: string;
  userId: string;
  learnerEmail: string;
  inviteeName: string | null;
  inviteeContact: string | null;
  body: FeedbackContent | null;
  updatedAt: string | null;
  publishedAt: string | null;
};

export type ReviewFilters = {
  course: string | null;
  run: string | null;
  week: number | null;
  status: StatusFilter;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL → filters. Everything is allow-listed: an id that isn't a UUID, a
 * week outside 1–52 or an unknown status falls back to "no filter" /
 * the default, never reaches the RPC. */
export function parseReviewFilters(params: Record<string, string | string[] | undefined>): ReviewFilters {
  const course = first(params.course);
  const run = first(params.run);
  const weekRaw = first(params.week);
  const status = first(params.status);
  const week = weekRaw && /^\d{1,2}$/.test(weekRaw) ? Number(weekRaw) : null;
  return {
    course: course && UUID.test(course) ? course.toLowerCase() : null,
    run: run && UUID.test(run) ? run.toLowerCase() : null,
    week: week !== null && week >= 1 && week <= 52 ? week : null,
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "")
      ? (status as StatusFilter)
      : DEFAULT_STATUS_FILTER,
  };
}

/** Filters → query string, dropping defaults so a link stays short. */
export function reviewFiltersQuery(f: Partial<ReviewFilters>): string {
  const q = new URLSearchParams();
  if (f.course) q.set("course", f.course);
  if (f.run) q.set("run", f.run);
  if (f.week != null) q.set("week", String(f.week));
  if (f.status && f.status !== DEFAULT_STATUS_FILTER) q.set("status", f.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function matchesStatus(status: ReviewStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "to_review") return status === "waiting" || status === "draft";
  return status === filter;
}

/** Course, run and week narrow every section; status narrows the list of
 * recordings only (the learner × week table shows every status). A run
 * filter from another course than the course filter matches nothing. */
export function scopeRows<T extends { courseId: string; runId: string; week?: number | null }>(
  rows: readonly T[],
  f: Pick<ReviewFilters, "course" | "run" | "week">,
): T[] {
  return rows.filter(
    (r) =>
      (!f.course || r.courseId === f.course) &&
      (!f.run || r.runId === f.run) &&
      (f.week == null || !("week" in r) || r.week === f.week),
  );
}

export type FilterOptions = {
  courses: { id: string; title: string }[];
  runs: { id: string; courseId: string; title: string | null; startsAt: string }[];
  weeks: number[];
};

/** The filter menus, from the unfiltered rows: only courses, runs and
 * weeks that have something in them, so no option is a dead end. Runs and
 * weeks follow the course filter. */
export function filterOptions(rows: readonly ReviewRow[], course: string | null): FilterOptions {
  const courses = new Map<string, string>();
  const runs = new Map<string, FilterOptions["runs"][number]>();
  const weeks = new Set<number>();
  for (const r of rows) {
    courses.set(r.courseId, r.courseTitle);
    if (course && r.courseId !== course) continue;
    runs.set(r.runId, { id: r.runId, courseId: r.courseId, title: r.runTitle, startsAt: r.runStartsAt });
    if (r.week != null) weeks.add(r.week);
  }
  return {
    courses: [...courses].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
    runs: [...runs.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    weeks: [...weeks].sort((a, b) => a - b),
  };
}

/** A learner's label: the invite's name when there is one, else the email. */
export function learnerLabel(r: { learnerEmail: string; inviteeName: string | null }): string {
  return r.inviteeName?.trim() || r.learnerEmail;
}

export type StatusGrid = {
  /** Column keys: weeks in order, then null ("no week") last if present. */
  weeks: (number | null)[];
  learners: {
    enrolmentId: string;
    label: string;
    email: string;
    runLabel: string;
    /** Per column key ("none" for null): that learner's slots' statuses. */
    cells: Record<string, ReviewStatus[]>;
  }[];
};

export const weekKey = (w: number | null) => (w == null ? "none" : String(w));

/** "Status per learner and week": one row per enrolment, one column per
 * week, each cell listing that week's voice-task statuses (a week can hold
 * more than one voice task). */
export function statusGrid(rows: readonly ReviewRow[]): StatusGrid {
  const weekSet = new Set<number | null>();
  const learners = new Map<string, StatusGrid["learners"][number]>();
  const sorted = [...rows].sort(
    (a, b) =>
      a.runStartsAt.localeCompare(b.runStartsAt) ||
      learnerLabel(a).localeCompare(learnerLabel(b)) ||
      a.lessonOrdinal - b.lessonOrdinal ||
      a.blockId.localeCompare(b.blockId),
  );
  for (const r of sorted) {
    weekSet.add(r.week);
    let l = learners.get(r.enrolmentId);
    if (!l) {
      l = {
        enrolmentId: r.enrolmentId,
        label: learnerLabel(r),
        email: r.learnerEmail,
        runLabel: `${r.courseTitle} · ${r.runTitle || "Untitled run"}`,
        cells: {},
      };
      learners.set(r.enrolmentId, l);
    }
    (l.cells[weekKey(r.week)] ??= []).push(r.status);
  }
  const weeks = [...weekSet].sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b));
  return { weeks, learners: [...learners.values()] };
}

/** RPC row (snake_case) → ReviewRow. */
export function toReviewRow(r: Record<string, unknown>): ReviewRow {
  return {
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    runId: r.run_id as string,
    runTitle: (r.run_title as string | null) ?? null,
    runStartsAt: r.run_starts_at as string,
    runEndsAt: r.run_ends_at as string,
    enrolmentId: r.enrolment_id as string,
    tier: r.tier as string,
    userId: r.user_id as string,
    learnerEmail: r.learner_email as string,
    inviteeName: (r.invitee_name as string | null) ?? null,
    inviteeContact: (r.invitee_contact as string | null) ?? null,
    lessonId: r.lesson_id as string,
    lessonTitle: r.lesson_title as string,
    lessonOrdinal: r.lesson_ordinal as number,
    week: (r.week as number | null) ?? null,
    opensAt: r.opens_at as string,
    blockId: r.block_id as string,
    blockPrompt: r.block_prompt ?? null,
    blockMaxSeconds: (r.block_max_seconds as number | null) ?? null,
    submissionId: (r.submission_id as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    recordingRemoved: Boolean(r.recording_removed),
    feedbackBody: (r.feedback_body as FeedbackContent | null) ?? null,
    feedbackUpdatedAt: (r.feedback_updated_at as string | null) ?? null,
    feedbackPublishedAt: (r.feedback_published_at as string | null) ?? null,
    status: r.status as ReviewStatus,
  };
}

/** RPC row (snake_case) → FinalCommentRow. */
export function toFinalCommentRow(r: Record<string, unknown>): FinalCommentRow {
  return {
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    runId: r.run_id as string,
    runTitle: (r.run_title as string | null) ?? null,
    runStartsAt: r.run_starts_at as string,
    runEndsAt: r.run_ends_at as string,
    enrolmentId: r.enrolment_id as string,
    tier: r.tier as string,
    userId: r.user_id as string,
    learnerEmail: r.learner_email as string,
    inviteeName: (r.invitee_name as string | null) ?? null,
    inviteeContact: (r.invitee_contact as string | null) ?? null,
    body: (r.body as FeedbackContent | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}
