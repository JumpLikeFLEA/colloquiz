import type { LessonBlock } from "../lessons";

export type LessonBlockWidth = "reading" | "fit";

/**
 * Which column width a lesson-player block renders at (ad-hoc adaptive-width
 * task, 2026-09-26, docs/decisions/0043). Exhaustive over every theory type
 * plus practice, mirroring `TheoryBlockRenderer`'s `never` fallback so a new
 * block type is a `tsc` error here too, not a silent default.
 *
 * `table` is "fit", not "wide" (owner review, 2026-09-26): a table sizes to
 * its own content, clamped between reading width and the full column,
 * rather than always claiming the whole column.
 *
 * `image`/`video` were "wide" (full column, a deliberate breakout) until
 * docs/decisions/0079 moved them to reading width: in a real browser a
 * 1024px video between 672px paragraphs read as misaligned, which 0043 had
 * left open ("pending a look in a real browser"). That left "wide" with no
 * block, so it was removed.
 */
export function lessonBlockWidth(block: LessonBlock): LessonBlockWidth {
  if (block.kind === "practice") {
    return "reading";
  }
  switch (block.type) {
    case "table":
      return "fit";
    case "heading":
    case "prose":
    case "example":
    case "callout":
    case "list":
    case "image":
    case "video":
    case "self_check":
      return "reading";
    default: {
      const exhaustive: never = block;
      throw new Error(`unhandled theory block type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
