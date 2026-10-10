import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/courseLevels";
import {
  attachLessonStates,
  publishedLessonsOnly,
  type LessonStateRow,
  type PublicCourseLesson,
} from "@/lib/coursePageProgress";

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
 * the query below for an anonymous or ordinary signed-in caller — RLS
 * excludes it row-by-row. A signed-in EDITOR is the exception: "lessons:
 * editor read" (041) returns drafts and archived rows too, so the result is
 * passed through `publishedLessonsOnly` (docs/decisions/0079 D4) — the same
 * fix lib/catalogueSummary.ts already applies to the catalogue counts.
 *
 * CNT-014 (docs/decisions/0102): which lessons are open to the caller, and
 * at which access level, come from `course_lesson_states` (migration 055),
 * never from a column read here. The free badge, the "whole course free"
 * pill and the CTA all render from those two fields.
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
      id: string;
      title: string;
      description: string | null;
      subtitle: string | null;
      coverImageUrl: string | null;
      level: CefrLevel;
      /** COH-004: `cohort` courses group lessons by week (058). */
      format: "self_paced" | "cohort";
      howToJoinUrl: string | null;
      lessons: PublicCourseLesson[];
    };

// cache(): SHELL-009's generateMetadata and the page component both call
// this for the same courseSlug within one request; React dedupes it to a
// single query (lib/leaderboard.ts / lib/supabase/queries.ts precedent).
export const getPublicCourse = cache(async (courseSlug: string): Promise<PublicCourse> => {
  const supabase = await createClient();

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, description, subtitle, cover_image_url, level, format, how_to_join_url")
    .eq("slug", courseSlug)
    .maybeSingle();
  if (courseErr) throw new Error(courseErr.message);
  if (!course) return { state: "not_found" };

  // The states RPC runs beside the lessons read, not after it, so the page
  // pays no extra serial round trip for it.
  const [{ data: lessons, error: lessonsErr }, { data: states, error: statesErr }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, slug, title, description, published_item_count, estimated_minutes, ordinal, week, published_version_id, archived_at")
      .eq("course_id", course.id)
      .order("ordinal", { ascending: true })
      // Ordinals aren't unique (041); the slug tiebreak keeps the list order
      // identical here and in lib/publicLesson.ts's getLessonNav, so "Урок N"
      // on the lesson page matches the Nth card on this page.
      .order("slug", { ascending: true }),
    supabase.rpc("course_lesson_states", { p_course_id: course.id }),
  ]);
  if (lessonsErr) throw new Error(lessonsErr.message);
  if (statesErr) throw new Error(statesErr.message);

  return {
    state: "ok",
    id: course.id,
    title: course.title,
    description: course.description,
    subtitle: course.subtitle,
    coverImageUrl: course.cover_image_url,
    level: course.level as CefrLevel,
    format: course.format === "cohort" ? "cohort" : "self_paced",
    howToJoinUrl: course.how_to_join_url,
    lessons: attachLessonStates(publishedLessonsOnly(lessons ?? []), (states ?? []) as LessonStateRow[]).map((l) => ({
      slug: l.slug,
      title: l.title,
      description: l.description,
      itemCount: l.published_item_count,
      estimatedMinutes: l.estimated_minutes,
      accessLevel: l.accessLevel,
      state: l.state,
      opensAt: l.opensAt,
      week: l.week,
      ordinal: l.ordinal,
    })),
  };
});
