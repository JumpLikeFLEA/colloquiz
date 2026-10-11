import { reviewFiltersQuery, type FinalCommentRow, type ReviewRow } from "../reviews/queue";

/**
 * The Studio inbox (AUTH-012, docs/decisions/0109 Decision 5, 0118). Rows
 * come from review_queue() / review_final_comments() (062) and
 * course_calls() (058), which decide who may see what and every row's
 * status. This module only groups rows for the page: no rule lives here.
 */

/** The nav badge. Counts takes with status "waiting" in the SAME rows the
 * inbox groups (0118 Decision 1), so the badge and the list can't differ. */
export function waitingCount(rows: readonly ReviewRow[]): number {
  return rows.filter((r) => r.status === "waiting").length;
}

export type InboxGroup = {
  courseId: string;
  courseTitle: string;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  /** null: lessons with no week, and every final-comment group. */
  week: number | null;
  count: number;
  /** The oldest submission (waiting) or the oldest save (drafts). */
  oldestAt: string;
  href: string;
};

type Keyed = Pick<ReviewRow, "courseId" | "courseTitle" | "runId" | "runTitle" | "runStartsAt"> & {
  week: number | null;
  at: string;
};

function group(items: readonly Keyed[], href: (k: Keyed) => string): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();
  for (const it of items) {
    const key = `${it.courseId}:${it.runId}:${it.week ?? "none"}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        courseId: it.courseId,
        courseTitle: it.courseTitle,
        runId: it.runId,
        runTitle: it.runTitle,
        runStartsAt: it.runStartsAt,
        week: it.week,
        count: 1,
        oldestAt: it.at,
        href: href(it),
      });
    } else {
      g.count += 1;
      if (it.at < g.oldestAt) g.oldestAt = it.at;
    }
  }
  // Oldest first: the group that has waited longest is the one to open.
  return [...groups.values()].sort(
    (a, b) =>
      a.oldestAt.localeCompare(b.oldestAt) ||
      a.courseTitle.localeCompare(b.courseTitle) ||
      a.runStartsAt.localeCompare(b.runStartsAt) ||
      (a.week ?? Infinity) - (b.week ?? Infinity),
  );
}

/** Takes waiting for feedback, per course × run × week. The link opens the
 * review queue on exactly that group. A weekless group links by course and
 * run only: the queue's week filter has no "no week" value. */
export function waitingGroups(rows: readonly ReviewRow[]): InboxGroup[] {
  return group(
    rows
      .filter((r) => r.status === "waiting" && r.submittedAt)
      .map((r) => ({ ...r, at: r.submittedAt! })),
    (k) => `/studio/reviews${reviewFiltersQuery({ course: k.courseId, run: k.runId, week: k.week, status: "waiting" })}`,
  );
}

/** Voice feedback saved but not published, per course × run × week. */
export function voiceDraftGroups(rows: readonly ReviewRow[]): InboxGroup[] {
  return group(
    rows
      .filter((r) => r.status === "draft" && r.feedbackUpdatedAt)
      .map((r) => ({ ...r, at: r.feedbackUpdatedAt! })),
    (k) => `/studio/reviews${reviewFiltersQuery({ course: k.courseId, run: k.runId, week: k.week, status: "draft" })}`,
  );
}

/** Final comments saved but not published, per course × run. */
export function finalDraftGroups(rows: readonly FinalCommentRow[]): InboxGroup[] {
  return group(
    rows
      .filter((r) => r.body !== null && r.publishedAt === null && r.updatedAt)
      .map((r) => ({ ...r, week: null, at: r.updatedAt! })),
    (k) => `/studio/reviews${reviewFiltersQuery({ course: k.courseId, run: k.runId })}#final-comments`,
  );
}

export type InboxCall = {
  callId: string;
  courseId: string;
  courseTitle: string;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  startsAt: string;
  meetUrl: string;
  title: string | null;
};

export const CALL_WINDOW_DAYS = 7;

/** Calls starting in [now, now + days), soonest first. */
export function upcomingCalls(calls: readonly InboxCall[], now: Date, days = CALL_WINDOW_DAYS): InboxCall[] {
  const from = now.getTime();
  const to = from + days * 24 * 60 * 60 * 1000;
  return calls
    .filter((c) => {
      const t = Date.parse(c.startsAt);
      return t >= from && t < to;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.callId.localeCompare(b.callId));
}

/** "3 days", "5 hours", "under an hour": how long the oldest item has
 * waited. Rounded down, so a group never reads older than it is. */
export function ageLabel(fromIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - Date.parse(fromIso));
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
