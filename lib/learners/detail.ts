import type { FeedbackContent } from "@/lib/feedback/content";

/**
 * The Studio learner page (AUTH-013, docs/decisions/0119). Rows come from
 * learner_lessons() and learner_recordings() (migration 064), which decide
 * who may see which learner and compute every value. This module only
 * parses the URL id and groups rows for the page: no rule lives here.
 */

/** One lesson of one course the caller edits, for this learner. */
export type LessonActivityRow = {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrdinal: number;
  week: number | null;
  /** Published and not archived; false for a lesson listed only because
   * the learner has activity in it. */
  lessonListed: boolean;
  opened: boolean;
  lastOpenedAt: string | null;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
  voicesSent: number;
  voicesAnswered: number;
  lastActivityAt: string | null;
};

export type CompareSlot = "before" | "after";

/** One voice take. */
export type RecordingRow = {
  submissionId: string;
  courseId: string;
  courseTitle: string;
  enrolmentId: string;
  enrolmentRevokedAt: string | null;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrdinal: number;
  week: number | null;
  blockId: string;
  blockPrompt: unknown;
  compare: CompareSlot | null;
  submittedAt: string;
  recordingRemoved: boolean;
  feedbackBody: FeedbackContent | null;
  feedbackUpdatedAt: string | null;
  feedbackPublishedAt: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The route's [userId] → a UUID, or null (the page 404s). */
export function parseLearnerId(raw: string): string | null {
  return UUID.test(raw) ? raw.toLowerCase() : null;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** RPC row (snake_case) → LessonActivityRow. */
export function toLessonActivityRow(r: Record<string, unknown>): LessonActivityRow {
  return {
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    lessonId: r.lesson_id as string,
    lessonTitle: r.lesson_title as string,
    lessonOrdinal: num(r.lesson_ordinal),
    week: (r.week as number | null) ?? null,
    lessonListed: Boolean(r.lesson_listed),
    opened: Boolean(r.opened),
    lastOpenedAt: (r.last_opened_at as string | null) ?? null,
    firstCompletedAt: (r.first_completed_at as string | null) ?? null,
    lastCompletedAt: (r.last_completed_at as string | null) ?? null,
    voicesSent: num(r.voices_sent),
    voicesAnswered: num(r.voices_answered),
    lastActivityAt: (r.last_activity_at as string | null) ?? null,
  };
}

/** RPC row (snake_case) → RecordingRow. A compare value other than
 * before/after (none today) reads as a weekly task. */
export function toRecordingRow(r: Record<string, unknown>): RecordingRow {
  const compare = r.block_compare === "before" || r.block_compare === "after" ? r.block_compare : null;
  return {
    submissionId: r.submission_id as string,
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    enrolmentId: r.enrolment_id as string,
    enrolmentRevokedAt: (r.enrolment_revoked_at as string | null) ?? null,
    runId: r.run_id as string,
    runTitle: (r.run_title as string | null) ?? null,
    runStartsAt: r.run_starts_at as string,
    lessonId: r.lesson_id as string,
    lessonTitle: r.lesson_title as string,
    lessonOrdinal: num(r.lesson_ordinal),
    week: (r.week as number | null) ?? null,
    blockId: r.block_id as string,
    blockPrompt: r.block_prompt ?? null,
    compare,
    submittedAt: r.submitted_at as string,
    recordingRemoved: Boolean(r.recording_removed),
    feedbackBody: (r.feedback_body as FeedbackContent | null) ?? null,
    feedbackUpdatedAt: (r.feedback_updated_at as string | null) ?? null,
    feedbackPublishedAt: (r.feedback_published_at as string | null) ?? null,
  };
}

export type CourseLessons = {
  courseId: string;
  courseTitle: string;
  lessons: LessonActivityRow[];
  /** Over listed lessons only, the roster's "N of M" (063). */
  openedCount: number;
  completedCount: number;
  listedCount: number;
};

/** Lessons grouped by course, in the RPC's order (course, then ordinal). */
export function groupLessonsByCourse(rows: readonly LessonActivityRow[]): CourseLessons[] {
  const out = new Map<string, CourseLessons>();
  for (const r of rows) {
    let c = out.get(r.courseId);
    if (!c) {
      c = { courseId: r.courseId, courseTitle: r.courseTitle, lessons: [], openedCount: 0, completedCount: 0, listedCount: 0 };
      out.set(r.courseId, c);
    }
    c.lessons.push(r);
    if (r.lessonListed) {
      c.listedCount += 1;
      if (r.opened) c.openedCount += 1;
      if (r.firstCompletedAt) c.completedCount += 1;
    }
  }
  return [...out.values()];
}

export type EnrolmentRecordings = {
  enrolmentId: string;
  courseId: string;
  courseTitle: string;
  runId: string;
  runTitle: string | null;
  runStartsAt: string;
  revokedAt: string | null;
  /** Present when either compare slot has a take; the missing side is null. */
  beforeAfter: { before: RecordingRow | null; after: RecordingRow | null } | null;
  /** Every take without a compare slot, by lesson then block. */
  weekly: RecordingRow[];
};

/** Takes grouped per enrolment (one per course × run), before/after paired.
 * Publish refuses a second block per slot (0100 Decision 3); if a direct
 * write ever left two takes in one slot, the earliest lesson wins here, as
 * on the learner's screen (0115 Decision 3), and the other is listed with
 * the weekly takes so nothing is hidden. */
export function groupRecordings(rows: readonly RecordingRow[]): EnrolmentRecordings[] {
  const out = new Map<string, EnrolmentRecordings>();
  const sorted = [...rows].sort(
    (a, b) =>
      a.courseTitle.localeCompare(b.courseTitle) ||
      a.runStartsAt.localeCompare(b.runStartsAt) ||
      a.lessonOrdinal - b.lessonOrdinal ||
      a.blockId.localeCompare(b.blockId),
  );
  for (const r of sorted) {
    let e = out.get(r.enrolmentId);
    if (!e) {
      e = {
        enrolmentId: r.enrolmentId,
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        runId: r.runId,
        runTitle: r.runTitle,
        runStartsAt: r.runStartsAt,
        revokedAt: r.enrolmentRevokedAt,
        beforeAfter: null,
        weekly: [],
      };
      out.set(r.enrolmentId, e);
    }
    if (r.compare) {
      e.beforeAfter ??= { before: null, after: null };
      if (e.beforeAfter[r.compare] === null) {
        e.beforeAfter[r.compare] = r;
        continue;
      }
    }
    e.weekly.push(r);
  }
  return [...out.values()];
}
