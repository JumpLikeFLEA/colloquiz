/**
 * AUTH-009 — the three `lessons.access_level` values (migration 055,
 * docs/decisions/0094) as the course editor shows them. Import-free, so the
 * "unit" vitest project can load it (docs/decisions/0004).
 *
 * This module names levels and lists lessons by level. It never says whether
 * anyone may OPEN a lesson: that is `can_read_lesson` / `lesson_state` in SQL
 * (docs/handoff.md, "Entitlement is decided in one place").
 */

export const LESSON_ACCESS_LEVELS = ["anyone", "signed_in", "entitled"] as const;

export type LessonAccessLevel = (typeof LESSON_ACCESS_LEVELS)[number];

/** Authoring chrome, English (0018 Decision 5). */
export const LESSON_ACCESS_LEVEL_LABELS: Record<LessonAccessLevel, string> = {
  anyone: "Open to anyone",
  signed_in: "Sign-in required",
  entitled: "Purchase required",
};

/**
 * The course-level summary: lessons whose level is `anyone`, in list order,
 * archived ones left out. Archived lessons are excluded because 055's
 * open-lesson rule counts only non-archived `anyone` lessons
 * (docs/decisions/0099 Decision 3), and the summary should agree with the
 * rule the RPC enforces.
 */
export function lessonsOpenToAnyone<T extends { accessLevel: LessonAccessLevel; archivedAt: string | null }>(
  lessons: T[],
): T[] {
  return lessons.filter((l) => l.accessLevel === "anyone" && l.archivedAt === null);
}
