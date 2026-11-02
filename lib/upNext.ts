/**
 * PROG-009 (docs/decisions/0211) — the "Up next" card at the top of `/my`.
 * A pure ranking over data the page already reads: no read of its own.
 *
 * One candidate per kind, in this order, at most three rows:
 *   1. an unread teacher reply (every thread with unread messages, as one row);
 *   2. the undone homework with the soonest due date;
 *   3. the Continue lesson (PROG-003, 0179) of a course not yet complete;
 *   4. a call in the next seven days.
 * Nothing to do means no rows, and the page draws no card.
 */

import { threadPath } from "./messages/messages";

export const UP_NEXT_MAX = 3;
export const UP_NEXT_CALL_DAYS = 7;

export type UpNextThread = { peerId: string; peerLabel: string; unreadCount: number; lastAt: string | null };

export type UpNextHomework = {
  id: string;
  courseSlug: string;
  courseTitle: string;
  lessonSlug: string | null;
  lessonTitle: string | null;
  teacherName: string;
  dueOn: string | null;
  createdAt: string;
  done: boolean;
  /** Null for a whole-course assignment; otherwise `_lesson_access_at`'s state. */
  access: string | null;
};

export type UpNextCourse = {
  courseSlug: string;
  courseTitle: string;
  continueLesson: { slug: string; title: string } | null;
  completed: number;
  total: number;
};

export type UpNextCall = { startsAt: string; meetUrl: string; title: string | null; courseTitle: string };

export type UpNextItem =
  | { kind: "message"; href: string; count: number; teacherName: string | null }
  | { kind: "homework"; href: string; title: string; courseTitle: string | null; teacherName: string; dueOn: string | null }
  | { kind: "continue"; href: string; lessonTitle: string; courseTitle: string }
  | { kind: "call"; href: string; startsAt: string; title: string | null; courseTitle: string };

export type UpNextInput = {
  threads: readonly UpNextThread[];
  homework: readonly UpNextHomework[];
  courses: readonly UpNextCourse[];
  call: UpNextCall | null;
  now: Date;
};

function messageItem(threads: readonly UpNextThread[]): UpNextItem | null {
  const unread = threads.filter((t) => t.unreadCount > 0);
  if (unread.length === 0) return null;
  const count = unread.reduce((n, t) => n + t.unreadCount, 0);
  // One teacher: open that conversation. Several: the list, which shows each.
  if (unread.length === 1) {
    const [t] = unread;
    return { kind: "message", href: threadPath("student", t.peerId), count, teacherName: t.peerLabel };
  }
  return { kind: "message", href: "/my/messages", count, teacherName: null };
}

/** Soonest due date first (an overdue one is soonest), no due date last, then
 * the oldest assignment, then the id, so the order never depends on the read's. */
export function compareHomework(a: UpNextHomework, b: UpNextHomework): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function homeworkHrefOf(h: UpNextHomework): string {
  return h.lessonSlug ? `/courses/${h.courseSlug}/${h.lessonSlug}` : `/courses/${h.courseSlug}`;
}

function homeworkItem(homework: readonly UpNextHomework[]): UpNextItem | null {
  // A lesson the learner cannot open yet (scheduled, paid) is not something to
  // do now; its row in the Homework section still says why.
  const todo = homework.filter((h) => !h.done && (h.access === null || h.access === "open"));
  const first = [...todo].sort(compareHomework)[0];
  if (!first) return null;
  return {
    kind: "homework",
    href: homeworkHrefOf(first),
    title: first.lessonTitle ?? first.courseTitle,
    courseTitle: first.lessonTitle ? first.courseTitle : null,
    teacherName: first.teacherName,
    dueOn: first.dueOn,
  };
}

function continueItem(courses: readonly UpNextCourse[], taken: ReadonlySet<string>): UpNextItem | null {
  // The page's course order (enrolled first, then the catalogue's); a finished
  // course has nothing to continue, and a lesson the homework row already opens
  // is not offered twice.
  for (const c of courses) {
    if (!c.continueLesson || c.completed >= c.total) continue;
    const href = `/courses/${c.courseSlug}/${c.continueLesson.slug}`;
    if (taken.has(href)) continue;
    return { kind: "continue", href, lessonTitle: c.continueLesson.title, courseTitle: c.courseTitle };
  }
  return null;
}

function callItem(call: UpNextCall | null, now: Date): UpNextItem | null {
  if (!call) return null;
  if (Date.parse(call.startsAt) > now.getTime() + UP_NEXT_CALL_DAYS * 86_400_000) return null;
  return { kind: "call", href: call.meetUrl, startsAt: call.startsAt, title: call.title, courseTitle: call.courseTitle };
}

export function upNext(input: UpNextInput): UpNextItem[] {
  const items: UpNextItem[] = [];
  const message = messageItem(input.threads);
  if (message) items.push(message);
  const homework = homeworkItem(input.homework);
  if (homework) items.push(homework);
  const cont = continueItem(input.courses, new Set(items.map((i) => i.href)));
  if (cont) items.push(cont);
  const call = callItem(input.call, input.now);
  if (call) items.push(call);
  return items.slice(0, UP_NEXT_MAX);
}
