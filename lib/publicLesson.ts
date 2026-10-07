import { cache } from "react";
import { authUserFrom } from "@/lib/auth";
import { lessonNav, publishedLessonsOnly } from "@/lib/coursePageProgress";
import { createClient } from "@/lib/supabase/server";

export type PublicLessonMeta = {
  title: string;
  description: string | null;
  itemCount: number;
  estimatedMinutes: number | null;
  /** docs/decisions/0079 D5/D8 — the lesson band's "← <course title>" back
   * link and "Урок N из M" (via `getLessonNav`), on the paid
   * "not_available" state as much as the playable one. */
  courseId: string;
  courseTitle: string;
};

export type PublicLesson =
  | { state: "not_found" }
  | ({ state: "not_available" } & PublicLessonMeta)
  | ({
      state: "ok";
      document: unknown[];
      lessonVersionId: string;
      isSignedIn: boolean;
    } & PublicLessonMeta);

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
 *
 * ANON-005 — `lessonVersionId` and `isSignedIn` are what `LessonPlayer`
 * needs to record attempts directly for a signed-in learner (lib/
 * lessonPlayer/attemptStore.ts's upload path). `isSignedIn` uses
 * `authUserFrom` (lib/auth.ts), not `getUser()`, for the same signature-only,
 * no-auth-server-round-trip reason every other server-side identity check in
 * this app does — this route in particular must stay fast for an anonymous
 * visitor.
 */
// cache(): SHELL-009's generateMetadata and the page component both call
// this for the same slugs within one request; React dedupes it to a single
// query (same precedent as lib/coursePage.ts's getPublicCourse).
export const getPublicLesson = cache(async (courseSlug: string, lessonSlug: string): Promise<PublicLesson> => {
  const supabase = await createClient();

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title")
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
    courseId: course.id,
    courseTitle: course.title,
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

  const user = await authUserFrom(supabase);

  return {
    state: "ok",
    document: version.document as unknown[],
    lessonVersionId: lesson.published_version_id,
    isSignedIn: user !== null,
    ...meta,
  };
});

export type NextLessonLink = { slug: string; title: string };

export type LessonNavInfo = { position: number; total: number; next: NextLessonLink | null };

/**
 * The lesson band's "Урок N из M" and the completion card's "next lesson"
 * link (docs/decisions/0079 D5), from ONE lessons read — it replaces
 * PLAY-007's `getNextLesson` (one query) one-for-one, so the lesson route
 * makes no more round trips than before.
 *
 * Ordinals are display order only and neither unique nor gapless within a
 * course (migration 041's comment on `lessons.ordinal`), so position is the
 * index in the ordinal-then-slug ordered list — the same order
 * lib/coursePage.ts uses, so "Урок N" here is the Nth card on the course
 * page. Draft and archived rows are dropped by `publishedLessonsOnly`: an
 * editor's own read policy (041) would otherwise count them, and offer an
 * unpublished or archived lesson as "next" on this public route — the
 * archived half of that is a fix, `getNextLesson` only checked
 * `published_version_id`.
 *
 * Deliberately does NOT call `can_read_lesson` — entitlement is decided in
 * exactly one place (docs/handoff.md), and that place is the destination
 * lesson page itself when the learner actually taps through; this is
 * metadata only, the same title/description `getPublicLesson` already shows
 * for a paid, not-yet-bought lesson. `null` when this lesson isn't in the
 * list (an archived lesson an editor can still open) — the band then shows
 * no position rather than a wrong one.
 */
export async function getLessonNav(courseId: string, lessonSlug: string): Promise<LessonNavInfo | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lessons")
    .select("slug, title, published_version_id, archived_at")
    .eq("course_id", courseId)
    .order("ordinal", { ascending: true })
    .order("slug", { ascending: true });
  if (error) throw new Error(error.message);

  const nav = lessonNav(publishedLessonsOnly(data ?? []), lessonSlug);
  if (!nav) return null;
  return {
    position: nav.position,
    total: nav.total,
    next: nav.next ? { slug: nav.next.slug, title: nav.next.title } : null,
  };
}
