import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Check, ChevronRight, Clock, ListChecks } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { LessonRowProgress, PublicCourseLesson } from "@/lib/coursePageProgress";
import { pluralize } from "@/lib/pluralCategory";
import { LIFT_CARD_CLASS } from "../../surfaceClasses";
import { courseCopy } from "./courseCopy";

/**
 * One row of the course page's lesson list (docs/decisions/0079 D1–D3): a
 * numbered gradient tile (the landing's "how it works" step tile, 0078),
 * the title, badges and description, and the lesson's size. The size sits
 * on the right at `sm` and up, under the description on a phone. The whole
 * row is one link, and lifts on hover like a catalogue card.
 *
 * PAY-001 (docs/decisions/0136): a lesson whose SQL `state` for this
 * visitor is `needs_sign_in` or `needs_entitlement` gets a muted pill
 * ("Sign in to open" / "Paid"), read from `course_lesson_states` like every
 * other state here, never from `accessLevel`. Muted, like "Opens <date>":
 * a cue, not a lock icon.
 *
 * `position` is the row's place in the list, never the lesson's ordinal
 * (ordinals aren't gapless, migration 041). "Бесплатно" shows only when
 * `showFreeBadge` is set: the page drops it when every lesson is free (D3),
 * where it would repeat on every row. A paid lesson gets no lock: there is
 * no forced order (docs/handoff.md), and the paid preview is M3. An
 * completed lesson (D2, 0143) gets a ✓ on its tile and, when it has
 * exercises, its best score; an in-progress one gets "N of M exercises" and
 * no score.
 *
 * COH-004 (docs/decisions/0108): `opensAt` is a `scheduled` lesson's
 * "Opens <date>" (the page passes it only when the week header doesn't
 * already carry the date). The row stays a link: the lesson page shows the
 * same state. `headingTag` is `h4` under a cohort course's week headings.
 */
export function LessonListItem({
  lang,
  href,
  position,
  lesson,
  showFreeBadge,
  progress,
  opensAt = null,
  headingTag: Heading = "h3",
}: {
  lang: SurfaceLang;
  href: string;
  position: number;
  lesson: PublicCourseLesson;
  showFreeBadge: boolean;
  progress: LessonRowProgress;
  opensAt?: ReactNode;
  headingTag?: "h3" | "h4";
}) {
  const c = courseCopy[lang];
  const meta = (
    <>
      {lesson.estimatedMinutes !== null && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden="true" />
          {lesson.estimatedMinutes} {c.minutesLabel}
        </span>
      )}
      {lesson.itemCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <ListChecks className="size-3.5" aria-hidden="true" />
          {lesson.itemCount} {pluralize(lesson.itemCount, lang, c.exercises)}
        </span>
      )}
    </>
  );

  return (
    <li>
      <Link href={href} className={`${LIFT_CARD_CLASS} flex items-start gap-4 p-4 sm:items-center sm:p-5`}>
        <span className="relative flex size-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-sm font-semibold text-white shadow-md shadow-brand/30">
          {position}
          {progress.complete && (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-success-subtle text-success ring-2 ring-card"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Heading className="text-sm font-semibold text-foreground sm:text-base">{lesson.title}</Heading>
            {showFreeBadge && (
              <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text">
                {c.freeBadge}
              </span>
            )}
            {(lesson.state === "needs_sign_in" || lesson.state === "needs_entitlement") && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {lesson.state === "needs_sign_in" ? c.signInBadge : c.paidBadge}
              </span>
            )}
            {opensAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <CalendarClock className="size-3" aria-hidden="true" />
                {c.opensOn} {opensAt}
              </span>
            )}
            {progress.bestPercent !== null && (
              <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                {c.bestScoreLabel}: {progress.bestPercent}%
              </span>
            )}
            {progress.inProgress && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {c.inProgressLabel(progress.inProgress.answered, progress.inProgress.total)}
              </span>
            )}
          </div>
          {lesson.description && <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{lesson.description}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground sm:hidden">{meta}</p>
        </div>
        <div className="hidden flex-none items-center gap-4 text-xs text-muted-foreground sm:flex">
          {meta}
          <ChevronRight
            className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-text motion-reduce:transition-none"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}
