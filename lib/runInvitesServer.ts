import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN_PATTERN, parseInvitePreview, toCourseRunInvite, type CourseRunInvite, type CourseRunInviteRow, type InvitePreview } from "./runInvites";

// COH-003 — the reads behind the runs page and the claim page (059,
// docs/decisions/0107). run_invites has no grants: both go through
// SECURITY DEFINER functions, which decide who sees what.

/** Every invite of every run of a course, labels included. Zero rows unless
 * the caller edits the course; called only from pages already gated on
 * canEditCourse(id). */
export async function getCourseRunInvites(courseId: string): Promise<CourseRunInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("course_run_invites", { p_course_id: courseId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CourseRunInviteRow[]).map(toCourseRunInvite);
}

/** The claim page's view of a token, for the signed-in caller or anon.
 * Never carries the contact label. A malformed token is not_found without a
 * round trip. */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!INVITE_TOKEN_PATTERN.test(token)) return { state: "not_found" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_invite_preview", { p_token: token });
  if (error) throw new Error(error.message);
  return parseInvitePreview(data);
}
