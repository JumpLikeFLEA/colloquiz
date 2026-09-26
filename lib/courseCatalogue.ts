/**
 * `courses.subtitle`'s max length (CNT-009, migration 047's
 * `courses_subtitle_length_check`). Mirrors the DB constraint the same way
 * `lib/courseLevels.ts`'s `CEFR_LEVELS` mirrors `courses_level_check`
 * (042) — this has no authority of its own over what the database accepts,
 * it only needs to agree with it.
 */
export const COURSE_SUBTITLE_MAX_LENGTH = 200;
