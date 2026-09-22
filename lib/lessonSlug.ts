/**
 * Mirrors `create_lesson`'s slug-generation algorithm (migration 044) for the
 * create-lesson form's live preview only — the RPC is the authority, since it
 * alone can check uniqueness within the course under the row lock it already
 * holds. This function never sees existing slugs and never dedupes; it only
 * has to agree with the RPC's base-slug step, the same "mirror, not source of
 * truth" relationship `CEFR_LEVELS` (lib/courseLevels.ts) has with
 * `courses_level_check`.
 */
export function slugifyLessonTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "lesson" : base;
}
