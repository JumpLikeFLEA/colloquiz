// TCH-005 — homework (migration 080, docs/decisions/0152). Pure: the shapes
// 080's functions return, the mapping from their raw rows, the date and
// error helpers, and the lookups the Studio and learner pages build from
// them. Every rule (who receives an assignment, what is done, what a teacher
// may read, whether a lesson can be opened) is decided in SQL; this module
// renames fields, formats dates and indexes rows. The reads live in
// lib/homework/homeworkServer.ts so a Client Component can import these
// without pulling in the server Supabase client.

import { SEAT_LAPSED_MESSAGE } from "../studioWriteLock";

/** Note limit; 080 enforces the same bound in a CHECK. */
export const HOMEWORK_NOTE_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isHomeworkId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

// ── Dates ────────────────────────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-20" → itself, or null for anything that is not a real calendar day. */
export function parseDueDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !DATE_ONLY.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : raw;
}

/** "20 Oct" / "20 окт." / "20 Oct 2027" when the year differs from `today`'s.
 * The day is a calendar date with no time zone, so it is formatted in UTC. */
export function formatDueDate(dueOn: string, locale: "en-GB" | "ru-RU", today: Date): string {
  const d = new Date(`${dueOn}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === today.getUTCFullYear();
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export type DueState = "none" | "upcoming" | "past";

/** A due date is information only (0141 Decision 14): this is for wording,
 * never for access. Today counts as upcoming. Compared as calendar days in
 * UTC; a learner far from UTC may see "Was due" a few hours early or late. */
export function dueState(dueOn: string | null, today: Date): DueState {
  if (!dueOn) return "none";
  return dueOn < today.toISOString().slice(0, 10) ? "past" : "upcoming";
}

// ── Errors ───────────────────────────────────────────────────────────────

/** The error codes 080's functions return, as a sentence for a toast. */
export function homeworkErrorMessage(code: unknown): string {
  switch (code) {
    case "forbidden":
      return "You can't assign homework.";
    case "seat_lapsed":
      return SEAT_LAPSED_MESSAGE;
    case "course_not_found":
      return "That course isn't available to assign.";
    case "lesson_not_found":
      return "That lesson isn't published in this course.";
    case "invalid_note":
      return `A note is up to ${HOMEWORK_NOTE_MAX} characters.`;
    case "no_targets":
      return "Choose at least one student or group.";
    case "too_many":
      return "That is too many students or groups at once.";
    case "not_linked":
      return "Only students linked to you can get homework.";
    case "group_not_found":
      return "One of those groups is gone.";
    case "not_found":
      return "That homework is already gone.";
    default:
      return "Something went wrong.";
  }
}

// ── Teacher side ─────────────────────────────────────────────────────────

export type HomeworkListRow = {
  assignment_id: string;
  course_id: string;
  course_title: string;
  course_slug: string;
  course_published: boolean;
  lesson_id: string | null;
  lesson_title: string | null;
  due_on: string | null;
  note: string | null;
  created_at: string;
};

export type TeacherHomework = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  coursePublished: boolean;
  lessonId: string | null;
  lessonTitle: string | null;
  dueOn: string | null;
  note: string | null;
  createdAt: string;
};

export function toTeacherHomework(r: HomeworkListRow): TeacherHomework {
  return {
    id: r.assignment_id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    courseSlug: r.course_slug,
    coursePublished: Boolean(r.course_published),
    lessonId: r.lesson_id ?? null,
    lessonTitle: r.lesson_title ?? null,
    dueOn: r.due_on ?? null,
    note: r.note ?? null,
    createdAt: r.created_at,
  };
}

export type HomeworkTargetRow = { assignment_id: string; student_id: string | null; group_id: string | null };

export type HomeworkProgressRow = {
  assignment_id: string;
  student_id: string;
  done_lessons: number;
  total_lessons: number;
  done: boolean;
  best_percent: number | null;
  last_activity_at: string | null;
};

export type StudentProgress = {
  studentId: string;
  doneLessons: number;
  totalLessons: number;
  done: boolean;
  bestPercent: number | null;
  lastActivityAt: string | null;
};

export function toStudentProgress(r: HomeworkProgressRow): StudentProgress {
  return {
    studentId: r.student_id,
    doneLessons: num(r.done_lessons),
    totalLessons: num(r.total_lessons),
    done: Boolean(r.done),
    bestPercent: r.best_percent == null ? null : num(r.best_percent),
    lastActivityAt: r.last_activity_at ?? null,
  };
}

export type HomeworkView = TeacherHomework & {
  /** Students named directly. */
  studentIds: string[];
  /** Groups named. */
  groupIds: string[];
  /** One row per current recipient, not-done first, then by label. */
  recipients: StudentProgress[];
  doneCount: number;
};

/**
 * Joins the three reads into one view per assignment, newest first (the list's
 * own order). `labelOf` orders recipients within a state; it decides nothing
 * about who is a recipient: that is the progress rows, i.e. SQL's.
 */
export function buildHomeworkViews(
  list: readonly TeacherHomework[],
  targets: readonly HomeworkTargetRow[],
  progress: readonly HomeworkProgressRow[],
  labelOf: (studentId: string) => string,
): HomeworkView[] {
  return list.map((a) => {
    const mine = targets.filter((t) => t.assignment_id === a.id);
    const recipients = progress
      .filter((p) => p.assignment_id === a.id)
      .map(toStudentProgress)
      .sort(
        (x, y) =>
          Number(x.done) - Number(y.done) || labelOf(x.studentId).localeCompare(labelOf(y.studentId)),
      );
    return {
      ...a,
      studentIds: mine.flatMap((t) => (t.student_id ? [t.student_id] : [])),
      groupIds: mine.flatMap((t) => (t.group_id ? [t.group_id] : [])),
      recipients,
      doneCount: recipients.filter((r) => r.done).length,
    };
  });
}

/** The assignments one student receives, from the whole list. */
export function homeworkForStudent(views: readonly HomeworkView[], studentId: string): HomeworkView[] {
  return views.filter((v) => v.recipients.some((r) => r.studentId === studentId));
}

/** The assignments that name one group. */
export function homeworkForGroup(views: readonly HomeworkView[], groupId: string): HomeworkView[] {
  return views.filter((v) => v.groupIds.includes(groupId));
}

/** The assignments on one course (course-wide or any of its lessons). */
export function homeworkForCourse(views: readonly HomeworkView[], courseId: string): HomeworkView[] {
  return views.filter((v) => v.courseId === courseId);
}

export type AssignableRow = {
  course_id: string;
  course_title: string;
  course_slug: string;
  course_edited: boolean;
  lesson_id: string;
  lesson_title: string;
  lesson_ordinal: number;
};

export type AssignableCourse = {
  id: string;
  title: string;
  edited: boolean;
  lessons: { id: string; title: string; ordinal: number }[];
};

/** homework_assignable()'s flat rows → courses with their lessons, in order. */
export function groupAssignable(rows: readonly AssignableRow[]): AssignableCourse[] {
  const out = new Map<string, AssignableCourse>();
  for (const r of rows) {
    const c = out.get(r.course_id) ?? {
      id: r.course_id,
      title: r.course_title,
      edited: Boolean(r.course_edited),
      lessons: [],
    };
    c.lessons.push({ id: r.lesson_id, title: r.lesson_title, ordinal: num(r.lesson_ordinal) });
    out.set(r.course_id, c);
  }
  return [...out.values()];
}

export type AssignInput = {
  courseId: string;
  lessonId: string | null;
  dueOn: string | null;
  note: string | null;
  studentIds: string[];
  groupIds: string[];
};

/** The assign route's body → AssignInput, or a message for the 400. */
export function parseAssignInput(body: Record<string, unknown>): { ok: true; input: AssignInput } | { ok: false; error: string } {
  if (!isHomeworkId(body.courseId)) return { ok: false, error: "Choose a course." };
  if (body.lessonId != null && !isHomeworkId(body.lessonId)) return { ok: false, error: "Invalid request." };
  let dueOn: string | null = null;
  if (body.dueOn != null && body.dueOn !== "") {
    dueOn = parseDueDate(body.dueOn);
    if (!dueOn) return { ok: false, error: "That due date isn't a date." };
  }
  let note: string | null = null;
  if (body.note != null) {
    if (typeof body.note !== "string") return { ok: false, error: "Invalid request." };
    note = body.note.trim() === "" ? null : body.note.trim();
    if (note && note.length > HOMEWORK_NOTE_MAX) return { ok: false, error: homeworkErrorMessage("invalid_note") };
  }
  const ids = (v: unknown): string[] | null =>
    v == null ? [] : Array.isArray(v) && v.every(isHomeworkId) ? [...new Set(v)] : null;
  const studentIds = ids(body.studentIds);
  const groupIds = ids(body.groupIds);
  if (!studentIds || !groupIds) return { ok: false, error: "Invalid request." };
  if (studentIds.length + groupIds.length === 0) return { ok: false, error: homeworkErrorMessage("no_targets") };
  return {
    ok: true,
    input: { courseId: body.courseId, lessonId: (body.lessonId as string | null | undefined) ?? null, dueOn, note, studentIds, groupIds },
  };
}

// ── Learner side ─────────────────────────────────────────────────────────

export type MyHomeworkRow = {
  assignment_id: string;
  teacher_name: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  lesson_id: string | null;
  lesson_slug: string | null;
  lesson_title: string | null;
  due_on: string | null;
  note: string | null;
  created_at: string;
  done: boolean;
  done_lessons: number;
  total_lessons: number;
  state: string | null;
  opens_at: string | null;
};

/** The access states `_lesson_access_at` returns (058). */
export type HomeworkAccess = "open" | "scheduled" | "needs_sign_in" | "needs_entitlement";

export type MyHomework = {
  id: string;
  teacherName: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  lessonId: string | null;
  lessonSlug: string | null;
  lessonTitle: string | null;
  dueOn: string | null;
  note: string | null;
  createdAt: string;
  done: boolean;
  doneLessons: number;
  totalLessons: number;
  /** Set for a lesson assignment only; null for a course. */
  access: HomeworkAccess | null;
  opensAt: string | null;
};

export function toMyHomework(r: MyHomeworkRow): MyHomework {
  const known: readonly string[] = ["open", "scheduled", "needs_sign_in", "needs_entitlement"];
  return {
    id: r.assignment_id,
    teacherName: r.teacher_name,
    courseId: r.course_id,
    courseSlug: r.course_slug,
    courseTitle: r.course_title,
    lessonId: r.lesson_id ?? null,
    lessonSlug: r.lesson_slug ?? null,
    lessonTitle: r.lesson_title ?? null,
    dueOn: r.due_on ?? null,
    note: r.note ?? null,
    createdAt: r.created_at,
    done: Boolean(r.done),
    doneLessons: num(r.done_lessons),
    totalLessons: num(r.total_lessons),
    access: r.state && known.includes(r.state) ? (r.state as HomeworkAccess) : null,
    opensAt: r.opens_at ?? null,
  };
}

/** Where a homework row sends the student: the lesson, else the course. */
export function homeworkHref(h: Pick<MyHomework, "courseSlug" | "lessonSlug">): string {
  return h.lessonSlug ? `/courses/${h.courseSlug}/${h.lessonSlug}` : `/courses/${h.courseSlug}`;
}

/**
 * The one assignment a lesson's band should mention, from the student's
 * homework: those that cover the lesson (the lesson itself, matched by its
 * slug within the course, or its whole course). Not-done ones first, then the soonest due date (none last), then
 * the oldest, so the pill names what is still to do.
 */
export function homeworkForLesson(
  rows: readonly MyHomework[],
  courseId: string,
  lessonSlug: string,
): MyHomework | null {
  const cover = rows.filter((h) => h.courseId === courseId && (h.lessonId === null || h.lessonSlug === lessonSlug));
  if (cover.length === 0) return null;
  return [...cover].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
      a.createdAt.localeCompare(b.createdAt),
  )[0];
}

/**
 * The lesson band's pill text (English lesson chrome, docs/decisions/0080
 * Decision 5): "Homework", with the due date when there is one and a check
 * when it is done. A past date reads "was due", never "overdue" (0141
 * Decision 14).
 */
export function homeworkPillText(h: Pick<MyHomework, "dueOn" | "done">, today: Date): string {
  if (h.done) return "Homework ✓";
  if (!h.dueOn) return "Homework";
  const when = formatDueDate(h.dueOn, "en-GB", today);
  return dueState(h.dueOn, today) === "past" ? `Homework · was due ${when}` : `Homework · due ${when}`;
}
