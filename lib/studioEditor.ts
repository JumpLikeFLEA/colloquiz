import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SHELL-021 (docs/decisions/0109 Decision 4) — whether `userId` may enter
 * Studio: an admin, the holder of at least one `course_editors` grant, or
 * (TCH-007, migration 082) the holder of an author seat. The same conditions
 * as `can_edit_course` (migration 029) plus the seat, and as the Studio
 * layout's gate (`getCourseAccess`, lib/courseAccess.ts), asked as "for ANY
 * course" rather than for one.
 *
 * It only decides what to SHOW and where to SEND (the account menu's
 * "Studio" link, the post-sign-in landing). It authorises nothing: the
 * Studio layout gates on its own, and RLS on every authoring table is the
 * boundary underneath. So a failed read degrades to `false` (no link, land
 * on `/` as before this card) rather than throwing on a learner's page.
 *
 * The reads run in parallel. `is_admin` is SECURITY DEFINER (027),
 * `course_editors` is readable for one's own rows (the Colloquiz (main)
 * layout's head+count is the precedent), so a head+count is the whole
 * payload, and `has_author_seat` (082) answers a boolean about the caller's
 * own seat only. Before 082 is applied that rpc errors, which reads as "no
 * seat", so the function behaves as it did.
 */
export async function isStudioEditor(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const [admin, grants, seat] = await Promise.all([
      supabase.rpc("is_admin", { p_user_id: userId }),
      supabase.from("course_editors").select("course_id", { head: true, count: "exact" }).eq("user_id", userId),
      supabase.rpc("has_author_seat"),
    ]);
    if (admin.data === true) return true;
    return (grants.count ?? 0) > 0 || seat.data === true;
  } catch {
    return false;
  }
}
