import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/courseLevels";
import type { CatalogueCourse } from "@/lib/courseCatalogue";
import { summariseLessons, type CatalogueLessonRow } from "@/lib/catalogueSummary";

/**
 * SHELL-010 — the public catalogue read, one row per published course.
 * Split out from lib/courseCatalogue.ts (which stays client-safe: the
 * authoring editor imports COURSE_SUBTITLE_MAX_LENGTH from there into a
 * Client Component) because this pulls in @/lib/supabase/server, which
 * fails the build the moment a Client Component imports anything from the
 * same module ("You're importing a module that depends on 'next/headers'"
 * — confirmed by a real `next build` failure, not assumed).
 *
 * Unlike lib/coursePage.ts's getPublicCourse (a single row fetched by a slug
 * the caller already chose deliberately), this is a LISTING, so it filters
 * `status = 'published'` explicitly rather than leaning on RLS alone: 035's
 * "courses: editor read" policy also grants a signed-in editor SELECT on
 * their own draft courses, which is fine for a slug they typed on purpose
 * but would leak that editor's drafts into their own view of the public
 * catalogue if this query relied only on RLS. The published-read policy
 * (028) still applies underneath — this filter is belt-and-braces, not a
 * second source of truth for what's public.
 *
 * Ordered by created_at: courses has no ordinal column (only lessons do),
 * and at one-course-today (docs/handoff.md, "Launch bar") the order is
 * moot — created_at is the least-surprising default for when a second and
 * third course arrive.
 *
 * Each course embeds its lessons' `estimated_minutes` plus the two columns
 * the size line needs to exclude drafts and archived lessons
 * (docs/decisions/0078). That exclusion happens in summariseLessons, not
 * here and not by RLS alone — "lessons: editor read" (041) hands a
 * signed-in editor every lesson of their course, so this listing would
 * otherwise count their drafts. One query, no N+1: PostgREST resolves the
 * embed through lessons.course_id.
 */
export const getPublishedCourses = cache(async (): Promise<CatalogueCourse[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses")
    .select("slug, title, subtitle, cover_image_url, level, lessons(estimated_minutes, published_version_id, archived_at)")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => {
    const { lessonCount, totalMinutes } = summariseLessons((c.lessons ?? []) as CatalogueLessonRow[]);
    return {
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      coverImageUrl: c.cover_image_url,
      level: c.level as CefrLevel,
      lessonCount,
      totalMinutes,
    };
  });
});
