import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { LessonScoreResult, ResolvedExplanation } from "@/lib/items";
import type { NextLessonLink } from "@/lib/publicLesson";
import { READING_WIDTH_CLASS } from "./columnLayout";

/**
 * PLAY-007 — closes the loop after a lesson without ever reading as a
 * failure (docs/handoff.md's scoring principles: "nothing demotivates the
 * learner," "one attempt is sufficient," "nothing blocks progress on a wrong
 * answer"). Rendered unconditionally after the last authored block —
 * `LessonPlayer` has no "reached the end" transition to gate on (it is a
 * single scrolling page, not a stepper), so this section is a footer that is
 * always present and simply has less to show before anything is attempted,
 * the same way the progress banner above it already updates live rather than
 * appearing at a discrete "done" moment.
 *
 * Score and the explanation review both come from the pure functions
 * `lib/lessonPlayer/session.ts` already exists to serve this card
 * (`scoreSession`/`explanationsForSession`) — nothing here recomputes either.
 */
export function LessonCompletion({
  score,
  explanations,
  courseSlug,
  nextLesson,
}: {
  score: LessonScoreResult;
  explanations: ReadonlyMap<string, ResolvedExplanation[]>;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
}) {
  const reviewEntries = [...explanations.entries()].filter(([, list]) => list.length > 0);

  return (
    <div className={`${READING_WIDTH_CLASS} rounded-2xl border border-border bg-card p-6 flex flex-col gap-4`}>
      <h2 className="text-lg font-semibold text-foreground">{alliengllCopy.completion.title}</h2>

      {score.status === "scored" && (
        <div className="rounded-lg border border-brand-border bg-brand-subtle px-3 py-2 text-sm text-brand-text">
          {alliengllCopy.completion.scoreLabel}: {score.percent}% ({score.earned}/{score.possible})
        </div>
      )}

      {reviewEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{alliengllCopy.completion.reviewTitle}</h3>
          <ul className="flex flex-col gap-2">
            {reviewEntries.flatMap(([itemId, list]) =>
              list.map((entry) => (
                <li
                  key={`${itemId}:${entry.subResultId}`}
                  className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground"
                >
                  {entry.explanation}
                </li>
              )),
            )}
          </ul>
        </div>
      )}

      {nextLesson && (
        <Link
          href={`/courses/${courseSlug}/${nextLesson.slug}`}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium"
        >
          {alliengllCopy.completion.nextLesson}: {nextLesson.title}
        </Link>
      )}

      <RegistrationOfferSlot />
    </div>
  );
}

/**
 * Reserved mount point for ANON-004 ("Registration offer and progress
 * migration") — that card's own acceptance requires the offer to show "after
 * a completed lesson, never before one," and depends ON this card
 * (PLAY-007), not the other way round. Intentionally renders nothing: the
 * UI it will hold does not exist yet.
 */
function RegistrationOfferSlot() {
  return null;
}
