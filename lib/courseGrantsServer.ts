import { createClient } from "@/lib/supabase/server";
import { toGrantableCourse, toGrantee, type GrantableCourse, type GrantableCourseRow, type Grantee, type GranteeRow } from "./courseGrants";

// TCH-009 — the reads behind the linked student's "Course access" section and
// the course editor's "Granted access" list (087, docs/decisions/0164).
// course_entitlements is readable only by its own user, so both go through
// SECURITY DEFINER functions scoped to auth.uid().

/** The self-paced courses the caller edits, with this linked student's state
 * for each. Empty for a student who is not linked to the caller. */
export async function getGrantableCourses(studentId: string): Promise<GrantableCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_grantable_courses", { p_student: studentId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GrantableCourseRow[]).map(toGrantableCourse);
}

/** The caller's linked students with an active teacher grant on this course. */
export async function getCourseGrantees(courseId: string): Promise<Grantee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("course_grantees", { p_course: courseId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GranteeRow[]).map(toGrantee);
}
