// TCH-002 — a teacher groups their linked students (migration 077,
// docs/decisions/0149). Pure: the shapes 077's functions return, the mapping
// from their raw rows, and the lookups the Studio pages build from the
// membership list. Every rule (who is a teacher, who is linked, whose group
// it is) is decided in SQL; this module renames fields and indexes rows. The
// reads live in lib/teacherGroupsServer.ts so a Client Component can import
// these without pulling in the server Supabase client.

/** Group name limits; 077 enforces the same bounds in a CHECK. */
export const GROUP_NAME_MAX = 60;

/**
 * The line shown wherever Studio names a group (docs/decisions/0144 Q2: the
 * learner sees the names in their data export and nowhere else in the app).
 */
export const GROUP_EXPORT_NOTE = "Students see the names of groups they are in only in their data export.";

/** Trims like 077 (btrim); returns null for an empty or over-long name. */
export function normalizeGroupName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= GROUP_NAME_MAX ? name : null;
}

export type TeacherGroup = { id: string; name: string; memberCount: number; createdAt: string };
export type TeacherGroupRow = { group_id: string; name: string; member_count: number; created_at: string };
export function toTeacherGroup(row: TeacherGroupRow): TeacherGroup {
  return { id: row.group_id, name: row.name, memberCount: Number(row.member_count), createdAt: row.created_at };
}

export type GroupMemberRow = { group_id: string; student_id: string };

/** group id -> student ids. */
export function membersByGroup(rows: readonly GroupMemberRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.group_id) ?? new Set<string>();
    set.add(r.student_id);
    out.set(r.group_id, set);
  }
  return out;
}

/** student id -> group ids. */
export function groupsByStudent(rows: readonly GroupMemberRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.student_id) ?? new Set<string>();
    set.add(r.group_id);
    out.set(r.student_id, set);
  }
  return out;
}

/** The error codes 077's functions return, as a sentence for a toast. */
export function groupErrorMessage(code: unknown): string {
  switch (code) {
    case "name_taken":
      return "You already have a group with that name.";
    case "invalid_name":
      return `A group name is 1 to ${GROUP_NAME_MAX} characters.`;
    case "not_linked":
      return "Only students linked to you can be in a group.";
    case "too_many":
      return "Add up to 500 students at a time.";
    case "forbidden":
      return "You can't create groups.";
    case "not_found":
      return "That group or student is already gone.";
    default:
      return "Something went wrong.";
  }
}
