// TCH-009 — a teacher opens a self-paced paid course for a linked student
// (migration 087, docs/decisions/0164). Pure: the shapes 087's functions
// return, the mapping from their raw rows, and the sentence for each error
// code. Every rule (who edits the course, who is a live linked student, whether
// the seat can write, which rows are teacher-made) is decided in SQL; this
// module renames fields. The reads live in lib/courseGrantsServer.ts so a Client
// Component can import these without the server Supabase client.

import { SEAT_LAPSED_MESSAGE } from "./studioWriteLock";

/**
 * The student's state for one course, as teacher_grantable_courses returns it:
 * granted (a teacher grant, revocable), other (a purchase or an admin comp),
 * revoked (a teacher grant that was revoked, grantable again), unavailable
 * (revoked by someone else; a teacher cannot reopen it), none.
 */
export type GrantState = "none" | "granted" | "other" | "revoked" | "unavailable";

export type GrantableCourseRow = {
  course_id: string;
  title: string;
  status: string;
  state: string;
  granted_at: string | null;
};
export type GrantableCourse = {
  courseId: string;
  title: string;
  published: boolean;
  state: GrantState;
  grantedAt: string | null;
};

const STATES: readonly GrantState[] = ["none", "granted", "other", "revoked", "unavailable"];

export function toGrantableCourse(row: GrantableCourseRow): GrantableCourse {
  // An unknown state is shown as the one a teacher cannot act on, never as a
  // grantable one: the database would refuse, and the page should not offer it.
  const state = (STATES as readonly string[]).includes(row.state) ? (row.state as GrantState) : "unavailable";
  return {
    courseId: row.course_id,
    title: row.title,
    published: row.status === "published",
    state,
    grantedAt: row.granted_at,
  };
}

export type GranteeRow = { student_id: string; granted_at: string };
export type Grantee = { studentId: string; grantedAt: string };
export function toGrantee(row: GranteeRow): Grantee {
  return { studentId: row.student_id, grantedAt: row.granted_at };
}

/** What the button for a state does, or null when the teacher cannot act. */
export function grantAction(state: GrantState): "grant" | "revoke" | null {
  if (state === "none" || state === "revoked") return "grant";
  if (state === "granted") return "revoke";
  return null;
}

/** The note shown for a state the teacher cannot change. */
export function grantStateNote(state: GrantState): string | null {
  if (state === "other") return "Already has access (a purchase or a grant from an admin).";
  if (state === "unavailable") return "Access was removed by someone else. Ask an admin to reopen it.";
  return null;
}

/** The error codes 087's functions return, as a sentence for a toast. */
export function grantErrorMessage(code: unknown): string {
  switch (code) {
    case "forbidden":
      return "You don't edit this course.";
    case "seat_lapsed":
      return SEAT_LAPSED_MESSAGE;
    case "cohort_course":
      return "Cohort courses are opened with runs and invites, not grants.";
    case "not_linked":
      return "This student is no longer linked to you.";
    case "has_access":
      return "This student already has access to the course.";
    case "not_grantable":
      return "This student's access was removed by someone else. Ask an admin to reopen it.";
    case "not_granted":
      return "This student has no grant from a teacher on this course.";
    default:
      return "Something went wrong.";
  }
}
