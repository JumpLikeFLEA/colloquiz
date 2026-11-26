import "server-only";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notebookView, type NotebookView } from "@/lib/notebook/notebookView";
import { parseNotebook } from "@/lib/notebook/parseNotebook";
import { courseIds, toCompletion, toGate, toLessons, toTakes, type LessonRow, type TakeRow } from "@/lib/notebook/readRows";

/**
 * PROG-014 (docs/decisions/0240) — `/my/notebook`'s reads, every one under the learner's own
 * session. The service role is never used here: To try must not name a phrase from a lesson this
 * learner cannot open, and the RLS on `lesson_versions` (`can_read_lesson`) is what decides that.
 * VOICE_ANALYSIS_MODE is not read: existing copies show with it off (0235).
 *
 * Every read is strict. A courtesy fallback would show a shorter notebook or a lower number as if
 * it were the learner's record.
 *
 * Filters beyond RLS, for a learner who also edits a course (the "editor read" policies return
 * more than their own): takes by `user_id`; lessons by a published version, so a draft is neither
 * named nor linked. The document embed is by `published_version_id`, so a draft version is never
 * a list's source.
 *
 * Null when nobody is signed in; the page redirects then.
 */
export async function getNotebookView(filters: { tab: unknown; course: unknown }): Promise<NotebookView | null> {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return null;

  const [notebookRes, gateRes, takesRes] = await Promise.all([
    supabase.rpc("my_notebook"),
    supabase.rpc("notebook_try_gate"),
    supabase
      .from("voice_submissions")
      .select("id, course_id, lesson_id, submitted_at, enrolment_id, object_name, content_type, run_enrolments(course_runs(ends_at))")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false }),
  ]);
  for (const r of [notebookRes, gateRes, takesRes]) if (r.error) throw new Error(r.error.message);

  const notebook = parseNotebook(notebookRes.data, () => console.error("/my/notebook: a my_notebook row does not read"));
  if (!notebook) throw new Error("my_notebook returned an unexpected shape");
  const { entries, summaries } = notebook;
  const gate = toGate(gateRes.data ?? []);
  const takes = toTakes((takesRes.data ?? []) as unknown as TakeRow[], entries, summaries);
  const ids = courseIds(gate, [...entries, ...summaries, ...takes]);

  const [coursesRes, lessonsRes, completion] = await Promise.all([
    supabase.from("courses").select("id, slug, title").in("id", ids),
    supabase
      .from("lessons")
      .select("id, course_id, slug, title, ordinal, archived_at, version:lesson_versions!lessons_published_version_id_fkey(document)")
      .in("course_id", ids)
      .not("published_version_id", "is", null),
    // The gate's courses are every started one, unpublished included; a completed lesson was
    // started (0239 "For PROG-014").
    Promise.all(
      gate.map(async ({ courseId }) => {
        const { data, error } = await supabase.rpc("get_course_attempt_summary", { p_course_id: courseId });
        if (error) throw new Error(error.message);
        return toCompletion(courseId, data ?? []);
      }),
    ),
  ]);
  for (const r of [coursesRes, lessonsRes]) if (r.error) throw new Error(r.error.message);

  return notebookView({
    entries,
    summaries,
    takes,
    completion: completion.flat(),
    gate,
    courses: coursesRes.data ?? [],
    lessons: toLessons((lessonsRes.data ?? []) as unknown as LessonRow[]),
    tab: filters.tab,
    course: filters.course,
  });
}
