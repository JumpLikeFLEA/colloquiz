import type { LessonPracticeBlock } from "@/lib/lessons";

/**
 * PLAY-001 builds the shell only; the real per-type interactive renderers
 * (selection/selection_grid, ordering/matching, slots) are PLAY-002..004.
 * `LessonPlayer` accepts a `practiceRenderer` prop so those cards can plug
 * in without touching this file — this is the default when none is
 * supplied, so the shell still renders something for every authored block
 * in order rather than silently skipping practice blocks.
 */
export function PracticeBlockPlaceholder({ block }: { block: LessonPracticeBlock }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
      Practice item ({block.item.type}) — renderer not yet available.
    </div>
  );
}
