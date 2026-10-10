import { TheoryBlockSchema, type TheoryBlock } from "./lessons";

/**
 * ANON-011 — the "start of the lesson" a visitor sees on a sign-in lesson
 * (docs/decisions/0094 Decision 3, option b). The cut is made in SQL by
 * `lesson_teaser` (migration 055): it returns only whitelisted theory blocks
 * before the first interactive block, so nothing here decides what a denied
 * visitor may see. This module only turns its rows into blocks the theory
 * renderers accept.
 *
 * Each row is re-validated with `TheoryBlockSchema`, the same schema
 * `parseLessonDocument` applies to a playable lesson, so the renderers never
 * receive a shape they were not written for. A row that fails throws: the
 * caller (lib/publicLesson.ts) logs it and shows no teaser, which is 0094's
 * own fallback for a lesson with nothing to show (option a: title and
 * description only) — docs/decisions/0104 Decision 3.
 *
 * Kept free of `@/` imports so the "unit" vitest project can load it
 * (vitest.config.mts, docs/decisions/0004).
 */
export type LessonTeaserRow = { block_index: number; block: unknown };

export function parseLessonTeaser(rows: readonly LessonTeaserRow[]): TheoryBlock[] {
  return [...rows]
    .sort((a, b) => a.block_index - b.block_index)
    .map((row) => {
      const result = TheoryBlockSchema.safeParse(row.block);
      if (!result.success) {
        throw new Error(`lesson_teaser block ${row.block_index} is not a valid theory block: ${result.error.message}`);
      }
      // SQL already excludes self_check (its modelAnswer is the answer key);
      // checked again so a change to 055's whitelist can't leak it here.
      if (result.data.type === "self_check") {
        throw new Error(`lesson_teaser block ${row.block_index} is a self_check block`);
      }
      return result.data;
    });
}
