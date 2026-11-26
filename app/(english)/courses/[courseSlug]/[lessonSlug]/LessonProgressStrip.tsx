import type { ReactNode } from "react";
import { alliengllCopy } from "@/lib/alliengll/copy";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import type { LessonProgress } from "@/app/components/lesson-player/LessonPlayer";

/**
 * The lesson page's sticky progress strip (docs/decisions/0079 D5). It sits
 * directly under the band and sticks to the top for the rest of
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
 * the two lesson clients pass (through LessonFrame). The admin preview and the
 * demo get no strip.
 * Without an `action`, not rendered at all for a lesson with no exercises,
 * where there is nothing to count. With one (the signed-in learner's notebook
 * button, PROG-022, docs/decisions/0246 Decision 3), that lesson gets the back
 * link and the action, with no bar and no count. The action carries its own
 * `ml-auto`, so no spacer is needed. The shape is the one 0246 measured in
 * bytes on the anonymous path (+29 B): change it only with a byte figure.
 */
export function LessonProgressStrip({
  progress,
  backLink,
  action,
}: {
  progress: LessonProgress;
  backLink: ReactNode;
  action?: ReactNode;
}) {
  const { answered, total, complete, percent } = progress;
  if (!total && !action) return null;
  const fill = Math.round((answered / total) * 100);

  return (
    <div className="sticky top-0 z-20 border-b-2 border-ink bg-paper/90 backdrop-blur">
      <div className={`${LESSON_READING_FRAME_CLASS} flex h-12 items-center gap-3`}>
        {backLink}
        {!!total && (
          <>
            <div
              role="progressbar"
              aria-label={alliengllCopy.player.progressLabel}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answered}
              className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-card"
            >
              <div
                className="h-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${fill}%` }}
              />
            </div>
            <span className="min-w-10 text-right font-display text-xs font-extrabold tabular-nums text-foreground">
              {complete && percent !== null ? `${percent}%` : `${answered}/${total}`}
            </span>
          </>
        )}
        {action}
      </div>
    </div>
  );
}
