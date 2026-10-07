import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { LessonScoreResult, ResolvedExplanation } from "@/lib/items";
import type { SessionProgress } from "@/lib/lessonPlayer/session";
import { pluralize } from "@/lib/pluralCategory";
import type { NextLessonLink } from "@/lib/publicLesson";
import { READING_WIDTH_CLASS } from "./columnLayout";
import { RegistrationOffer } from "./RegistrationOffer";

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
 * - Once every exercise is answered: a gradient card in the landing's
 *   closing-CTA look, with "Lesson complete", the score as a large number,
 *   and a white "Next lesson" CTA (or "Back to course" on the course's
 *   last lesson).
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
  explanations,
  courseSlug,
  nextLesson,
  lessonPath = "",
  isSignedIn = true,
}: {
  score: LessonScoreResult;
  progress: SessionProgress;
  explanations: ReadonlyMap<string, ResolvedExplanation[]>;
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
  const reviewEntries = [...explanations.entries()].filter(([, list]) => list.length > 0);
  const complete = progress.total > 0 && progress.answered === progress.total;
  const remaining = progress.total - progress.answered;
  const nextHref = nextLesson ? `/courses/${courseSlug}/${nextLesson.slug}` : null;
  // A theory-only lesson that is also the course's last has nothing to say
  // here; render no empty card.
  const showNeutral = progress.total > 0 || nextHref !== null;

  return (
    <div className={`${READING_WIDTH_CLASS} flex flex-col gap-4`}>
      {complete && score.status === "scored" ? (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-deep via-brand to-brand-accent px-6 py-10 text-center text-white sm:px-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,white_1.5px,transparent_1.5px)] [background-size:28px_28px] opacity-[0.08]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col items-center gap-2">
            <h2 className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium ring-1 ring-white/20">
              <Check className="size-4" aria-hidden="true" />
              {c.title}
            </h2>
            <p className="pt-3 text-sm text-white/75">{c.scoreLabel}</p>
            <p className="text-6xl font-semibold tracking-tight tabular-nums">{score.percent}%</p>
            <p className="text-sm tabular-nums text-white/75">
              {pointsFormat.format(score.earned)} {c.scoreOf} {pointsFormat.format(score.possible)}
            </p>
            {nextHref && nextLesson ? (
              <Link
                href={nextHref}
                className="group mt-5 inline-flex min-h-12 max-w-full items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-deep shadow-lg shadow-brand-deep/30 outline-none transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="min-w-0 text-balance">
                  {c.nextLesson}: {nextLesson.title}
                </span>
                <ArrowRight className="size-4 flex-none transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </Link>
            ) : (
              courseSlug && (
                <Link
                  href={`/courses/${courseSlug}`}
                  className="mt-5 inline-flex min-h-12 items-center rounded-xl px-5 py-3 text-sm font-medium text-white ring-1 ring-white/30 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                >
                  {alliengllCopy.player.backToCourse}
                </Link>
              )
            )}
          </div>
        </section>
      ) : (
        showNeutral && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-8 text-center">
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

      {reviewEntries.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">{c.reviewTitle}</h3>
          <ul className="flex flex-col gap-2">
            {reviewEntries.flatMap(([itemId, list]) =>
              list.map((entry) => (
                <li key={`${itemId}:${entry.subResultId}`} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {entry.explanation}
                </li>
              )),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
