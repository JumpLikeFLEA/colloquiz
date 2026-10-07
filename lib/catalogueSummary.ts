/**
 * Per-course size line for the landing catalogue card ("5 lessons · ~60
 * min"), derived from the lesson rows lib/publicCatalogue.ts embeds under
 * each course (docs/decisions/0078).
 *
 * Filters `published_version_id IS NOT NULL` and `archived_at IS NULL` here,
 * not only by leaning on RLS: "lessons: editor read" (migration 041) returns
 * every lesson of a course to a signed-in editor, drafts and archived ones
 * included, so an editor would otherwise see inflated counts on the public
 * catalogue. These two conditions mirror the public "lessons: published
 * read" policy (041, amended by 044) — the policy is still what decides
 * visibility for everyone else.
 *
 * `totalMinutes` is null rather than a partial sum when any counted lesson
 * has no estimate: summing only the known ones would understate the course.
 */

export type CatalogueLessonRow = {
  estimated_minutes: number | null;
  published_version_id: string | null;
  archived_at: string | null;
};

export type CatalogueLessonSummary = {
  lessonCount: number;
  totalMinutes: number | null;
};

export function summariseLessons(rows: readonly CatalogueLessonRow[]): CatalogueLessonSummary {
  const counted = rows.filter((r) => r.published_version_id !== null && r.archived_at === null);
  if (counted.length === 0) return { lessonCount: 0, totalMinutes: null };

  let total = 0;
  for (const r of counted) {
    if (r.estimated_minutes === null) return { lessonCount: counted.length, totalMinutes: null };
    total += r.estimated_minutes;
  }
  return { lessonCount: counted.length, totalMinutes: total };
}
