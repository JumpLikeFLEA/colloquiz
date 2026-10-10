import type { SupabaseClient } from "@supabase/supabase-js";

export type LessonOpenResult = "skipped" | "no-session" | "recorded" | "refused";

/**
 * PROG-001 — records that the signed-in learner opened this lesson
 * (`record_lesson_open`, migration 056), for the learners page (AUTH-011).
 *
 * Called from the player's mount (LessonPlayer's lesson_start effect), never
 * from the page's server render: a Link prefetch can render a page without
 * the learner opening it, but it never mounts a client component
 * (docs/decisions/0101 Decision 1).
 *
 * Checks the session first, the same way `uploadPendingAttempts` does, so an
 * expired session costs no doomed RPC. The RPC itself refuses an anonymous
 * caller and a lesson the caller can't read; a refusal is returned, not
 * thrown, because nothing the learner did is wrong. A transport error is
 * thrown for the caller to log.
 */
export async function recordLessonOpen(
  supabase: SupabaseClient,
  lessonVersionId: string,
): Promise<LessonOpenResult> {
  if (!lessonVersionId) return "skipped";

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return "no-session";

  const { data, error } = await supabase.rpc("record_lesson_open", {
    p_lesson_version_id: lessonVersionId,
  });
  if (error) throw new Error(error.message);

  return (data as { ok?: boolean } | null)?.ok ? "recorded" : "refused";
}
