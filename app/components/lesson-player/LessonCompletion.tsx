import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { LessonScoreResult } from "@/lib/items";
import { exerciseAnchorId } from "@/lib/lessonPlayer/anchors";
import type { ReviewEntry } from "@/lib/lessonPlayer/reviewEntries";
import type { SessionProgress } from "@/lib/lessonPlayer/session";
import { pluralize } from "@/lib/pluralCategory";
import type { NextLessonLink } from "@/lib/publicLesson";
import { OFFSET_CTA_CLASS, OUTLINE_CTA_CLASS } from "@/app/(english)/surfaceClasses";
import { READING_WIDTH_CLASS } from "./columnLayout";

// ANON-012 (docs/decisions/0139): loaded when the offer first shows, after a
// completed lesson, so its OAuth buttons and provider icons are not in a
// lesson's first load. Client-only: completion never exists on the server.
const RegistrationOffer = dynamic(() => import("./RegistrationOffer").then((m) => m.RegistrationOffer), {
  ssr: false,
});

/** Partial credit makes points fractional ("1.5 of 2"). The lesson page's
 * chrome is English (docs/decisions/0080 Decision 5), so the decimal is a
 * point, not the Russian comma ("1,5") this used before. */
const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/**
 * PLAY-007 — closes the loop after a lesson without ever reading as a
 * failure (docs/handoff.md's scoring principles: "nothing demotivates the
 * learner," "one attempt is sufficient," "nothing blocks progress on a wrong
 * answer"). Still rendered unconditionally after the last authored block:
 * the player is a single scrolling page with no "reached the end"
 * transition, so this footer is always there.
 *
 * docs/decisions/0079 D7 revises 0058 Decision 1. What the footer SAYS now
 * depends on `progress` (lib/lessonPlayer/session.ts's `sessionProgress`):
 * - Until every exercise has an answer: a neutral card, "N exercises
 *   left", plus the next-lesson link. It no longer says "Lesson complete"
 *   over an untouched lesson.
 * - Once every exercise is answered: a marker-yellow card in the landing's
 *   closing-CTA look (SHELL-028, docs/decisions/0166; a gradient card before
 *   that), with "Lesson complete", the score as a large display-face number,
 *   and the violet offset "Next lesson" CTA (or an outlined "Back to course"
 *   on the course's last lesson).
 * - A lesson with no exercises gets the neutral card's link only.
 *
 * The registration offer (ANON-004) now waits for ALL exercises too,
 * revising docs/decisions/0068 Decision 2. 0068 used "any item scored"
 * because no "every item attempted" signal existed. `sessionProgress` is
 * that signal, and docs/handoff.md asks for the offer "AFTER a completed
 * lesson". It renders as its own card under the score, not inside the
 * gradient. The review list ("Answer review") stays available in both
 * states, as its own card. It is the same text a wrong row's inline "Why?"
 * shows, deliberately (0058 Decision 2).
 *
 * Score and review come from the pure functions in
 * lib/lessonPlayer/session.ts; nothing here recomputes either.
 */
export function LessonCompletion({
  score,
  progress,
  review,
  courseSlug,
  nextLesson,
  lessonPath = "",
  isSignedIn = true,
}: {
  score: LessonScoreResult;
  progress: SessionProgress;
  /** PLAY-016 — wrong sub-parts with their exercise number and statement. */
  review: ReadonlyArray<ReviewEntry>;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
  /** ANON-004 — the current lesson's own path (`/courses/<slug>/<slug>`), for
   * the registration offer's `emailRedirectTo`/OAuth `next=` so a same-
   * browser confirmation returns here. Defaults to "" (offer still renders,
   * just returns to "/" on confirm) for callers that don't pass it. */
  lessonPath?: string;
  /** ANON-004 — the offer only makes sense for a learner who isn't already
   * signed in. Defaults to true (no offer) so pre-ANON-004 callers — tests,
   * the demo page — see no behavior change. */
  isSignedIn?: boolean;
}) {
  const c = alliengllCopy.completion;
  const complete = progress.total > 0 && progress.answered === progress.total;
  const remaining = progress.total - progress.answered;
  const nextHref = nextLesson ? `/courses/${courseSlug}/${nextLesson.slug}` : null;
  // A theory-only lesson that is also the course's last has nothing to say
  // here; render no empty card.
  const showNeutral = progress.total > 0 || nextHref !== null;

  return (
    <div className={`${READING_WIDTH_CLASS} flex flex-col gap-4`}>
      {complete && score.status === "scored" ? (
        <section className="flex flex-col items-center gap-2 rounded-3xl border-2 border-ink bg-highlight px-6 py-10 text-center text-highlight-foreground shadow-offset sm:px-10">
          <h2 className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 py-1 text-sm font-semibold text-foreground">
            <Check className="size-4" aria-hidden="true" />
            {c.title}
          </h2>
          <p className="pt-3 text-sm font-medium text-highlight-foreground/75">{c.scoreLabel}</p>
          <p className="font-display text-6xl font-extrabold tracking-tight tabular-nums">{score.percent}%</p>
          <p className="text-sm tabular-nums text-highlight-foreground/75">
            {pointsFormat.format(score.earned)} {c.scoreOf} {pointsFormat.format(score.possible)}
          </p>
          {nextHref && nextLesson ? (
            <Link href={nextHref} className={`${OFFSET_CTA_CLASS} mt-5 max-w-full text-sm`}>
              <span className="min-w-0 text-balance">
                {c.nextLesson}: {nextLesson.title}
              </span>
              <ArrowRight className="size-4 flex-none transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
          ) : (
            courseSlug && (
              <Link href={`/courses/${courseSlug}`} className={`${OUTLINE_CTA_CLASS} mt-5`}>
                {alliengllCopy.player.backToCourse}
              </Link>
            )
          )}
        </section>
      ) : (
        showNeutral && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink/40 bg-card px-6 py-8 text-center">
            {progress.total > 0 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">
                  {remaining} {pluralize(remaining, "en", alliengllCopy.player.exercises)} {c.remainingSuffix}
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">{c.remainingBody}</p>
              </>
            )}
            {nextHref && nextLesson && (
              <Link
                href={nextHref}
                className="group inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="min-w-0 text-balance">
                  {c.nextLesson}: {nextLesson.title}
                </span>
                <ArrowRight className="size-4 flex-none transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </Link>
            )}
          </section>
        )
      )}

      {complete && score.status === "scored" && !isSignedIn && <RegistrationOffer lessonPath={lessonPath} />}

      {review.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">{c.reviewTitle}</h3>
          <ul className="flex flex-col gap-2">
            {review.map((entry) => (
              <li key={entry.key} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <a
                  href={`#${exerciseAnchorId(entry.blockId)}`}
                  className="flex min-w-0 items-baseline gap-2 rounded text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="flex-none font-semibold text-foreground">
                    {c.reviewExercise} {entry.exerciseNumber}
                    {entry.subPart !== null && ` · ${entry.subPart}`}
                  </span>
                  <span className="min-w-0 truncate">{entry.context}</span>
                </a>
                <p className="pt-1">{entry.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
