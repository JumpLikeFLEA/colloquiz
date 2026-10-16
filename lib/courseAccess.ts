import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";

/**
 * Page-level authorization for the course-authoring UI (AUTH-007,
 * docs/decisions/0041). Every check here mirrors the SQL function
 * `can_edit_course` (migration 029) rather than re-implementing its logic —
 * this module only decides which page renders, never which row a query may
 * touch; RLS (already gated on `can_edit_course` for every authoring table)
 * remains the actual security boundary underneath it.
 */

export type CourseAccess = {
  isAdmin: boolean;
  /** Course ids this user holds a `course_editors` grant for. Always an
   * explicit self-filtered query — "course_editors: admin read" (029) would
   * return every course's editor rows to an admin caller, so relying on RLS
   * alone here would leak every course's id to an admin asking "which
   * courses am I an editor of", not just the ones they were actually
   * granted. Left empty (not queried) for an admin, who doesn't need it:
   * `listAuthoredCourses` shows an admin every course regardless. */
  editableCourseIds: string[];
  /** The caller holds an author seat, in any state (TCH-007, migration 082).
   * A seated teacher with no course yet must still reach Studio to make one.
   * Always false for an admin (not queried): they enter on role alone. */
  hasSeat: boolean;
};

/** Whether the caller may open Studio at all: an admin, an editor of at least
 * one course, or a seated teacher. The one expression the Studio layout and
 * every Studio page gate on; it decides what to render, never which row a
 * query may touch (RLS and the SQL functions are that boundary). */
export function canEnterStudio(access: CourseAccess): boolean {
  return access.isAdmin || access.editableCourseIds.length > 0 || access.hasSeat;
}

export async function getCourseAccess(): Promise<CourseAccess> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { isAdmin: false, editableCourseIds: [], hasSeat: false };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";
  if (isAdmin) return { isAdmin, editableCourseIds: [], hasSeat: false };

  const [{ data: editorRows, error }, seat] = await Promise.all([
    supabase.from("course_editors").select("course_id").eq("user_id", user.id),
    supabase.rpc("has_author_seat"),
  ]);
  if (error) throw new Error(error.message);

  // A failed seat read degrades to "no seat" (the gate then falls back to the
  // editor rows, as before 082), so Studio still opens on a database where 082
  // is not applied yet.
  return {
    isAdmin,
    editableCourseIds: (editorRows ?? []).map((r) => r.course_id),
    hasSeat: seat.data === true,
  };
}

/** Per-course gate for the detail/lesson/preview pages, called via the RPC
 * so the decision is made by `can_edit_course` itself, not re-derived from
 * `getCourseAccess()`'s course list (which a caller could otherwise use as
 * the sole gate and silently drift from the SQL function's own logic). */
export async function canEditCourse(courseId: string): Promise<boolean> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_edit_course", {
    p_course_id: courseId,
    p_user_id: user.id,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
