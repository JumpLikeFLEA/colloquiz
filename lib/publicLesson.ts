import { createClient } from "@/lib/supabase/server";

export type PublicLessonMeta = {
  title: string;
  description: string | null;
  itemCount: number;
  estimatedMinutes: number | null;
};

export type PublicLesson =
  | { state: "not_found" }
  | ({ state: "not_available" } & PublicLessonMeta)
  | ({ state: "ok"; document: unknown[] } & PublicLessonMeta);

/**
 * The public read path for a lesson (PLAY-006) — the first place the English
 * surface's anon key hits the database with no session guaranteed. `state`
 * is decided by two things only, and this module never re-derives either:
 * the "lessons: published read" / "editor read" RLS policies (migration 041,
 * widened by 044) decide whether the METADATA row is visible at all, and
 * `can_read_lesson()` (the one entitlement function, migration 041/044) is
 * called directly — never inferred from a null `lesson_versions` read — to
 * decide whether the CONTENT is. `createClient()` is the same cookie-aware
 * SSR client used everywhere else: with no session it runs as anon, with one
 * it runs as that caller, so anonymous, signed-in and entitled callers all
 * go through this exact code path.
 *
 * One check is NOT left to RLS: `published_version_id IS NULL` is read
 * directly here, because an editor's own "editor read" policies would
 * otherwise surface an unpublished draft on this public URL too. This route
 * only ever serves published content, editors included — the author path
 * for a draft is the preview screen (AUTH-005), not this one.
 */
export async function getPublicLesson(courseSlug: string, lessonSlug: string): Promise<PublicLesson> {
  const supabase = await createClient();

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", courseSlug)
    .maybeSingle();
  if (courseErr) throw new Error(courseErr.message);
  if (!course) return { state: "not_found" };

  const { data: lesson, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, title, description, published_item_count, estimated_minutes, published_version_id")
    .eq("course_id", course.id)
    .eq("slug", lessonSlug)
    .maybeSingle();
  if (lessonErr) throw new Error(lessonErr.message);
  if (!lesson || lesson.published_version_id === null) return { state: "not_found" };

  const meta: PublicLessonMeta = {
    title: lesson.title,
    description: lesson.description,
    itemCount: lesson.published_item_count,
    estimatedMinutes: lesson.estimated_minutes,
  };

  const { data: canRead, error: canReadErr } = await supabase.rpc("can_read_lesson", {
    p_lesson_id: lesson.id,
  });
  if (canReadErr) throw new Error(canReadErr.message);
  if (canRead !== true) return { state: "not_available", ...meta };

  const { data: version, error: versionErr } = await supabase
    .from("lesson_versions")
    .select("document")
    .eq("id", lesson.published_version_id)
    .maybeSingle();
  if (versionErr) throw new Error(versionErr.message);
  if (!version) {
    // can_read_lesson said yes, but the published version row itself came
    // back empty. RLS grants this exact row whenever can_read_lesson is true
    // (migration 041 §8's "lesson_versions: published content read" policy
    // IS can_read_lesson plus an id match) — the two disagreeing is a real
    // invariant break, not a "paid, not entitled" state, and must not be
    // hidden behind a normal-looking screen.
    throw new Error(`can_read_lesson(${lesson.id}) is true but its published_version_id has no readable row`);
  }

  return { state: "ok", document: version.document as unknown[], ...meta };
}
