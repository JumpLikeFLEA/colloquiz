import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AttemptsByLessonSlug } from "@/lib/coursePageProgress";

/**
 * ANON-005 — the course page's real replacement for the `{}` placeholder
 * SHELL-008/0059 called out as temporary. Signed out, there is nothing to
 * read (no attempt has ever been recorded for an anonymous visitor — that's
 * ANON-004/006's job, not this one's), so this returns `{}` without a query,
 * same "correct current state, not a stub" reasoning 0059 used.
 *
 * The RPC (migration 050) does the version-history aggregation server-side;
 * this module only reshapes its rows into the map lib/coursePageProgress.ts's
 * pure functions already expect.
 */
export async function getCourseAttemptSummary(courseId: string): Promise<AttemptsByLessonSlug> {
  const supabase = await createClient();

  const user = await authUserFrom(supabase);
  if (!user) return {};

  const { data, error } = await supabase.rpc("get_course_attempt_summary", { p_course_id: courseId });
  if (error) throw new Error(error.message);

  const map: Record<string, { bestPercent: number }> = {};
  for (const row of data ?? []) {
    map[row.lesson_slug] = { bestPercent: row.best_percent };
  }
  return map;
}
