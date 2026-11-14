import type { SupabaseClient } from "@supabase/supabase-js";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attemptsFromSummaryRows, type AttemptsByLessonSlug } from "@/lib/coursePageProgress";
import { carriedAttempts, type EarlierAttempt } from "@/lib/lessonPlayer/answeredBefore";

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

  return attemptsFromSummaryRows(data ?? []);
}

/**
 * PROG-003 (docs/decisions/0179) — the slug of the lesson of this course the
 * signed-in learner opened most recently, from `lesson_opens` (056, owner-read
 * RLS). Read only when every open lesson is complete (`needsLastOpened`), the
 * one case "Continue" has nothing unfinished to point at. Null when nothing was
 * opened, and on a failed read: the caller then falls back to the course's last
 * open lesson, which is a wrong-but-harmless target, so the failure is logged
 * rather than thrown.
 */
export async function getLastOpenedLessonSlug(supabase: SupabaseClient, courseId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("lesson_opens")
    .select("last_opened_at, lessons!inner(slug, course_id)")
    .eq("lessons.course_id", courseId)
    .order("last_opened_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("lesson_opens:", error.message);
    return null;
  }
  const lesson = (data?.[0] as { lessons?: { slug: string } | { slug: string }[] } | undefined)?.lessons;
  const row = Array.isArray(lesson) ? lesson[0] : lesson;
  return row?.slug ?? null;
}

/**
 * PLAY-019 (docs/decisions/0210) — the signed-in learner's own attempts on one
 * lesson version, for the player's "answered before" set
 * (`lib/lessonPlayer/answeredBefore.ts`). `lesson_attempts` has an owner-read
 * policy (048), so the caller's JWT scopes the rows; the `user_id` filter is
 * belt-and-braces for the index. Empty when signed out. Throws on a failed
 * read; the page treats that as "nothing answered before".
 */
export async function getLessonVersionAttempts(lessonVersionId: string): Promise<EarlierAttempt[]> {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return [];

  // PLAY-021 (docs/decisions/0228): beside this version's own rows, the
  // exercises answered on an earlier version that this one carries unchanged
  // (`carried_lesson_answers`, migration 110). That read fails soft on its
  // own, so a missing function (110 not applied) keeps PLAY-019's figures.
  const [own, carried] = await Promise.all([
    supabase
      .from("lesson_attempts")
      .select("block_id, earned, possible")
      .eq("user_id", user.id)
      .eq("lesson_version_id", lessonVersionId),
    supabase.rpc("carried_lesson_answers", { p_lesson_version_id: lessonVersionId }),
  ]);
  if (own.error) throw new Error(own.error.message);
  if (carried.error) console.error("failed to read carried lesson answers:", carried.error.message);

  const current: EarlierAttempt[] = (own.data ?? []).map((r) => ({
    lessonVersionId,
    blockId: r.block_id as string,
    earned: Number(r.earned),
    possible: Number(r.possible),
  }));
  return carried.error ? current : [...current, ...carriedAttempts(carried.data ?? [], lessonVersionId)];
}
