import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { listAuthoredCourses } from "@/lib/courseAuthoring";
import type { CourseAccess } from "@/lib/courseAccess";
import { toFinalCommentRow, toReviewRow, type FinalCommentRow, type ReviewRow } from "@/lib/reviews/queue";
import type { InboxCall } from "@/lib/studio/inbox";
import type { Thread } from "@/lib/messages/messages";
import { getThreads } from "@/lib/messages/messagesServer";

// AUTH-012 — the inbox's reads (docs/decisions/0118). Who may see which row
// is decided in SQL: review_queue() / review_final_comments() (062) and
// course_calls() (058) return rows only for courses the caller edits.

/** The takes waiting for feedback. ONE source for both the nav badge
 * (layout.tsx) and the inbox list (page.tsx): cache() makes the two a single
 * call per request, so they can't disagree (0118 Decision 1). */
export const getWaitingRows = cache(async (): Promise<ReviewRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_queue", { p_status: "waiting" });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toReviewRow);
});

export async function getDraftRows(): Promise<{ voice: ReviewRow[]; final: FinalCommentRow[] }> {
  const supabase = await createClient();
  const [voice, final] = await Promise.all([
    supabase.rpc("review_queue", { p_status: "draft" }),
    supabase.rpc("review_final_comments"),
  ]);
  if (voice.error) throw new Error(voice.error.message);
  if (final.error) throw new Error(final.error.message);
  return {
    voice: ((voice.data ?? []) as Record<string, unknown>[]).map(toReviewRow),
    final: ((final.data ?? []) as Record<string, unknown>[]).map(toFinalCommentRow),
  };
}

/** Every call of every run of a course the caller edits. Runs are read with
 * an explicit course filter: course_runs' "published read" policy would
 * also return other courses' runs to an editor. */
export async function getEditorCalls(access: CourseAccess): Promise<InboxCall[]> {
  const courses = await listAuthoredCourses(access.isAdmin ? undefined : access.editableCourseIds);
  if (courses.length === 0) return [];
  const titles = new Map(courses.map((c) => [c.id, c.title]));

  const supabase = await createClient();
  const runsRes = await supabase
    .from("course_runs")
    .select("id, title, course_id, starts_at")
    .in("course_id", [...titles.keys()]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  const runs = new Map((runsRes.data ?? []).map((r) => [r.id as string, r]));
  const courseIds = [...new Set((runsRes.data ?? []).map((r) => r.course_id as string))];

  const results = await Promise.all(
    courseIds.map((id) => supabase.rpc("course_calls", { p_course_id: id })),
  );
  const calls: InboxCall[] = [];
  for (const res of results) {
    if (res.error) throw new Error(res.error.message);
    for (const c of (res.data ?? []) as {
      call_id: string;
      run_id: string;
      starts_at: string;
      meet_url: string;
      title: string | null;
    }[]) {
      const run = runs.get(c.run_id);
      if (!run) continue;
      calls.push({
        callId: c.call_id,
        courseId: run.course_id,
        courseTitle: titles.get(run.course_id) ?? "",
        runId: c.run_id,
        runTitle: run.title,
        runStartsAt: run.starts_at,
        startsAt: c.starts_at,
        meetUrl: c.meet_url,
        title: c.title,
      });
    }
  }
  return calls;
}

/** The teacher's message threads, for the nav badge (layout.tsx) and the
 * inbox's "Unanswered questions" (page.tsx). ONE cached read, so the two
 * can't disagree (TCH-004, docs/decisions/0151 Decision 7). Fail-soft: null
 * on error, because Studio's main page and every page's nav sit on it and the
 * rest of the inbox does not depend on it (079 may not be applied yet). The
 * inbox says it could not load them rather than showing an empty list. */
export const getTeacherThreads = cache(async (): Promise<Thread[] | null> => {
  try {
    return await getThreads("teacher");
  } catch (e) {
    console.error("Studio: message_threads failed", e);
    return null;
  }
});
