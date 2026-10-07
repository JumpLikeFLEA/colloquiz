import type { CefrLevel } from "@/lib/courseLevels";

/**
 * `courses.subtitle`'s max length (CNT-009, migration 047's
 * `courses_subtitle_length_check`). Mirrors the DB constraint the same way
 * `lib/courseLevels.ts`'s `CEFR_LEVELS` mirrors `courses_level_check`
 * (042) — this has no authority of its own over what the database accepts,
 * it only needs to agree with it.
 */
export const COURSE_SUBTITLE_MAX_LENGTH = 200;

export type CatalogueCourse = {
  slug: string;
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  level: CefrLevel;
  /** Published, non-archived lessons only — lib/catalogueSummary.ts. */
  lessonCount: number;
  /** Sum of those lessons' estimates; null if any has none (0078). */
  totalMinutes: number | null;
};
