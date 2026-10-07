import type { ReactNode } from "react";
import { alliengllCopy } from "@/lib/alliengll/copy";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import type { LessonProgress } from "@/app/components/lesson-player/LessonPlayer";

/**
 * The lesson page's sticky progress strip (docs/decisions/0079 D5). It sits
 * directly under the gradient band and sticks to the top for the rest of
 * the lesson. It holds the back arrow, a bar of answered exercises out of
 * the lesson's total, and "x/y". Once every exercise is answered, the
 * count becomes the lesson score.
 *
 * It replaces the score banner `LessonPlayer` used to render at the top of
 * its column. That banner appeared at the top of the page while the
 * learner was at the bottom, where they never saw it.
 *
 * Plain CSS `position: sticky`, with no scroll listener and no observer.
 * Its parent (`LessonPageClient`'s wrapper) spans the band and the whole
 * player, so it stays stuck until the lesson ends. It is a sibling of the
 * player's column, never an ancestor of matching's sticky bank (0039
 * Decision 5), and that bank sticks to the bottom, not the top, so the two
 * never meet.
 *
 * Rendered only through `LessonPlayer`'s `renderProgress`, which only
 * `LessonPageClient` passes. The admin preview and the demo get no strip.
 * Not rendered at all for a lesson with no exercises, where there is
 * nothing to count.
 */
export function LessonProgressStrip({ progress, backLink }: { progress: LessonProgress; backLink: ReactNode }) {
  const { answered, total, complete, percent } = progress;
  if (total === 0) return null;
  const fill = Math.round((answered / total) * 100);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className={`${LESSON_READING_FRAME_CLASS} flex h-12 items-center gap-3`}>
        {backLink}
        <div
          role="progressbar"
          aria-label={alliengllCopy.player.progressLabel}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-accent transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${fill}%` }}
          />
        </div>
        <span className="min-w-10 text-right text-xs font-semibold tabular-nums text-muted-foreground">
          {complete && percent !== null ? `${percent}%` : `${answered}/${total}`}
        </span>
      </div>
    </div>
  );
}
