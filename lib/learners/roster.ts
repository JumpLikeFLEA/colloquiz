/**
 * The Studio learners page (AUTH-011, docs/decisions/0116). Rows come from
 * learner_roster() (migration 063), which decides who may see which
 * learner and computes every count. This module only parses the page's URL
 * filters and shapes rows for the page: no rule lives here.
 */

export type AcquisitionSource = "instagram" | "telegram" | "direct";

/** One row per (course, learner, enrolment); `enrolmentId` and the run
 * fields are null for a learner with no enrolment in the course. */
export type RosterRow = {
  courseId: string;
  courseTitle: string;
  userId: string;
  learnerEmail: string;
  enrolmentId: string | null;
  runId: string | null;
  runTitle: string | null;
  runStartsAt: string | null;
  tier: string | null;
  enrolmentRevokedAt: string | null;
  inviteeName: string | null;
  inviteeContact: string | null;
  acquisitionSource: AcquisitionSource | null;
  acquisitionCourseId: string | null;
  acquisitionCourseTitle: string | null;
  lessonsTotal: number;
  lessonsOpened: number;
  lessonsCompleted: number;
  lastActivityAt: string | null;
  voicesSent: number;
  voicesAnswered: number;
};

/** `group` is a teacher group id (TCH-002, migration 077): the page turns it into a member set. */
export type LearnerFilters = { course: string | null; run: string | null; group: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL → filters. An id that isn't a UUID falls back to "no filter". */
export function parseLearnerFilters(params: Record<string, string | string[] | undefined>): LearnerFilters {
  const course = first(params.course);
  const run = first(params.run);
  const group = first(params.group);
  return {
    course: course && UUID.test(course) ? course.toLowerCase() : null,
    run: run && UUID.test(run) ? run.toLowerCase() : null,
    group: group && UUID.test(group) ? group.toLowerCase() : null,
  };
}

/** Filters → query string, dropping empty ones so a link stays short. */
export function learnerFiltersQuery(f: Partial<LearnerFilters>): string {
  const q = new URLSearchParams();
  if (f.course) q.set("course", f.course);
  if (f.run) q.set("run", f.run);
  if (f.group) q.set("group", f.group);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** A run filter keeps only that run's enrolment rows; a run from another
 * course than the course filter matches nothing. A group filter keeps only
 * the learners in `groupMembers` (the caller's own group, TCH-002); an unknown
 * group has no members, so it matches nothing rather than everything. */
export function scopeRoster(
  rows: readonly RosterRow[],
  f: LearnerFilters,
  groupMembers: ReadonlySet<string> | null = null,
): RosterRow[] {
  return rows.filter(
    (r) =>
      (!f.course || r.courseId === f.course) &&
      (!f.run || r.runId === f.run) &&
      (!f.group || (groupMembers?.has(r.userId) ?? false)),
  );
}

export type RosterFilterOptions = {
  courses: { id: string; title: string }[];
  runs: { id: string; courseId: string; title: string | null; startsAt: string }[];
};

/** The filter menus, from the unfiltered rows, so no option is a dead end.
 * Runs follow the course filter. */
export function rosterFilterOptions(rows: readonly RosterRow[], course: string | null): RosterFilterOptions {
  const courses = new Map<string, string>();
  const runs = new Map<string, RosterFilterOptions["runs"][number]>();
  for (const r of rows) {
    courses.set(r.courseId, r.courseTitle);
    if (course && r.courseId !== course) continue;
    if (r.runId && r.runStartsAt)
      runs.set(r.runId, { id: r.runId, courseId: r.courseId, title: r.runTitle, startsAt: r.runStartsAt });
  }
  return {
    courses: [...courses].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
    runs: [...runs.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

/** Distinct people, not rows: a learner in two courses, or in two runs of
 * one course, has more than one row. */
export function countLearners(rows: readonly RosterRow[]): number {
  return new Set(rows.map((r) => r.userId)).size;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** RPC row (snake_case) → RosterRow. */
export function toRosterRow(r: Record<string, unknown>): RosterRow {
  return {
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    userId: r.user_id as string,
    learnerEmail: r.learner_email as string,
    enrolmentId: (r.enrolment_id as string | null) ?? null,
    runId: (r.run_id as string | null) ?? null,
    runTitle: (r.run_title as string | null) ?? null,
    runStartsAt: (r.run_starts_at as string | null) ?? null,
    tier: (r.tier as string | null) ?? null,
    enrolmentRevokedAt: (r.enrolment_revoked_at as string | null) ?? null,
    inviteeName: (r.invitee_name as string | null) ?? null,
    inviteeContact: (r.invitee_contact as string | null) ?? null,
    acquisitionSource: (r.acquisition_source as AcquisitionSource | null) ?? null,
    acquisitionCourseId: (r.acquisition_course_id as string | null) ?? null,
    acquisitionCourseTitle: (r.acquisition_course_title as string | null) ?? null,
    lessonsTotal: num(r.lessons_total),
    lessonsOpened: num(r.lessons_opened),
    lessonsCompleted: num(r.lessons_completed),
    lastActivityAt: (r.last_activity_at as string | null) ?? null,
    voicesSent: num(r.voices_sent),
    voicesAnswered: num(r.voices_answered),
  };
}
