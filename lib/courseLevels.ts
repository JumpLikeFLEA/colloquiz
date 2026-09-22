/**
 * The CEFR levels a course may declare (docs/decisions/0022 Decision 5,
 * `courses.level`). Mirrors the `courses_level_check` CHECK constraint added
 * by migration 042 — keep the two in step; this list has no authority of its
 * own over what the database accepts, it only needs to agree with it.
 */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
