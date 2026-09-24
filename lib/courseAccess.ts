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
};

export async function getCourseAccess(): Promise<CourseAccess> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { isAdmin: false, editableCourseIds: [] };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";
  if (isAdmin) return { isAdmin, editableCourseIds: [] };

  const { data: editorRows, error } = await supabase
    .from("course_editors")
    .select("course_id")
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  return { isAdmin, editableCourseIds: (editorRows ?? []).map((r) => r.course_id) };
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
