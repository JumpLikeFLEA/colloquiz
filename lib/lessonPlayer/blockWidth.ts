import type { LessonBlock } from "../lessons";

export type LessonBlockWidth = "reading" | "wide";

/**
 * Which column width a lesson-player block renders at (ad-hoc adaptive-width
 * task, 2026-09-26, docs/decisions/0043). Exhaustive over every theory type
 * plus practice, mirroring `TheoryBlockRenderer`'s `never` fallback so a new
 * block type is a `tsc` error here too, not a silent default.
 */
export function lessonBlockWidth(block: LessonBlock): LessonBlockWidth {
  if (block.kind === "practice") {
    return "reading";
  }
  switch (block.type) {
    case "table":
    case "image":
    case "video":
      return "wide";
    case "heading":
    case "prose":
    case "example":
    case "callout":
    case "list":
    case "self_check":
      return "reading";
    default: {
      const exhaustive: never = block;
      throw new Error(`unhandled theory block type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
