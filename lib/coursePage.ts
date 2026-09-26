import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/courseLevels";
import type { PublicCourseLesson } from "@/lib/coursePageProgress";

/**
 * SHELL-008 — the public read path for a course page (the target of a
 * catalogue card). Mirrors lib/publicLesson.ts's shape: a plain data
 * fetcher over the caller's own RLS-scoped view, never a second source of
 * truth for what's visible.
 *
 * No entitlement check of its own is needed here, unlike getPublicLesson:
 * "lessons: published read" (migration 044) already returns a lesson's
 * title/description/item count for EVERY published, non-archived lesson —
 * paid included — because preview metadata is visible regardless of
 * entitlement (docs/handoff.md, "Preview, precisely"). Only a lesson's
 * CONTENT is entitlement-gated, and that gate lives on the lesson page
 * (PLAY-006), not here. A draft or archived lesson simply isn't returned by
 * the query below — RLS excludes it row-by-row, no extra filter needed.
 *
 * Same un-fixed gap as getPublicLesson: "courses: published read" (028) has
 * no entitled-purchaser bypass, so a course unpublished after purchase would
 * 404 here for its own buyers. That's pre-existing PLAY-006 behavior this
 * module deliberately mirrors rather than silently diverging from; fixing it
 * is out of scope for this card.
 */

export type PublicCourse =
  | { state: "not_found" }
  | {
      state: "ok";
      title: string;
      description: string | null;
      subtitle: string | null;
      coverImageUrl: string | null;
      level: CefrLevel;
      lessons: PublicCourseLesson[];
    };

export async function getPublicCourse(courseSlug: string): Promise<PublicCourse> {
  const supabase = await createClient();

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, description, subtitle, cover_image_url, level")
    .eq("slug", courseSlug)
    .maybeSingle();
  if (courseErr) throw new Error(courseErr.message);
  if (!course) return { state: "not_found" };

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons")
    .select("slug, title, description, published_item_count, estimated_minutes, in_free_sample, ordinal")
    .eq("course_id", course.id)
    .order("ordinal", { ascending: true });
  if (lessonsErr) throw new Error(lessonsErr.message);

  return {
    state: "ok",
    title: course.title,
    description: course.description,
    subtitle: course.subtitle,
    coverImageUrl: course.cover_image_url,
    level: course.level as CefrLevel,
    lessons: (lessons ?? []).map((l) => ({
      slug: l.slug,
      title: l.title,
      description: l.description,
      itemCount: l.published_item_count,
      estimatedMinutes: l.estimated_minutes,
      inFreeSample: l.in_free_sample,
      ordinal: l.ordinal,
    })),
  };
}
