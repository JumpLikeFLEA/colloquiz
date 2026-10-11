import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SHELL-021 (docs/decisions/0109 Decision 4) — whether `userId` may enter
 * Studio: an admin, or the holder of at least one `course_editors` grant.
 * The same two conditions as `can_edit_course` (migration 029) and as the
 * Studio layout's gate (`getCourseAccess`, lib/courseAccess.ts), asked as
 * "for ANY course" rather than for one.
 *
 * It only decides what to SHOW and where to SEND (the account menu's
 * "Studio" link, the post-sign-in landing). It authorises nothing: the
 * Studio layout gates on its own, and RLS on every authoring table is the
 * boundary underneath. So a failed read degrades to `false` (no link, land
 * on `/` as before this card) rather than throwing on a learner's page.
 *
 * Both reads run in parallel. `is_admin` is SECURITY DEFINER (027) and
 * `course_editors` is readable for one's own rows (the Colloquiz (main)
 * layout's head+count is the precedent), so a head+count is the whole
 * payload.
 */
export async function isStudioEditor(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const [admin, grants] = await Promise.all([
      supabase.rpc("is_admin", { p_user_id: userId }),
      supabase.from("course_editors").select("course_id", { head: true, count: "exact" }).eq("user_id", userId),
    ]);
    if (admin.data === true) return true;
    return (grants.count ?? 0) > 0;
  } catch {
    return false;
  }
}
