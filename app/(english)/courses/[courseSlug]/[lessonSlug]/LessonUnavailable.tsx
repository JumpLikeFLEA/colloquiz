import type { ReactNode } from "react";
import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { TheoryBlock } from "@/lib/lessons";
import type { NextLessonLink } from "@/lib/publicLesson";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import {
  HEADING_WIDTH_CLASS,
  LESSON_READING_FRAME_CLASS,
  READING_WIDTH_CLASS,
} from "@/app/components/lesson-player/columnLayout";
import { TeaserBlock } from "./TeaserBlock";
import { SUBMIT_BUTTON_CLASS } from "@/app/components/lesson-player/practice/practiceClasses";
import { signInCopy } from "./signInCopy";

export type LessonUnavailableAccess =
  | { access: "needs_entitlement" }
  | { access: "needs_sign_in"; teaser: TheoryBlock[]; openLesson: NextLessonLink | null };

const BACK_BUTTON_CLASS =
  "inline-flex min-h-11 items-center rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand";

/**
 * The lesson page's denied state (docs/decisions/0079 D8): the same
 * `LessonBand` as a playable lesson, then what the caller still needs.
 *
 * - `needs_entitlement`: one card with the existing copy and a way back to
 *   the course. No buy CTA, no lock icon (M3's paid preview is not built).
 * - `needs_sign_in` (ANON-011, docs/decisions/0104): the lesson's leading
 *   theory as `lesson_teaser` (055) cut it, then a card asking for sign-in
 *   that links to `/login?next=<this lesson>` (ANON-016 returns the learner
 *   here), and, when the course has one, a link to a lesson open to this
 *   caller (0094 Decision 2). The teaser is rendered by `TeaserBlock`, over
 *   the player's own block views (see that module for `video`).
 *
 * Its own module since AUTH-009 so the course editor's "Visitor view"
 * renders this exact component rather than a look-alike. `access` is also
 * written to `data-access`, so a fetched page says which state SQL returned.
 *
 * Renders a <div>, not <main>: the lesson page wraps it in its <main>, and
 * the editor renders it inside the Colloquiz shell, which has its own. No
 * min-h-svh (the root layout's sticky-footer wrapper sizes the page,
 * docs/ui-decisions.md 2026-09-28). A Server Component, and so is
 * everything it renders except `next/link` and `next/image`, which the
 * route already ships.
 */
export function LessonUnavailable({
  band,
  courseSlug,
  lessonPath,
  state,
}: {
  band: ReactNode;
  courseSlug: string;
  /** This lesson's public path, the sign-in `next`. */
  lessonPath: string;
  state: LessonUnavailableAccess;
}) {
  return (
    <div className="bg-background" data-access={state.access}>
      {band}
      {state.access === "needs_entitlement" ? (
        <div className={`${LESSON_READING_FRAME_CLASS} py-10 sm:py-12`}>
          <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
            <p className="max-w-sm text-base font-medium text-foreground">{alliengllCopy.notAvailable.body}</p>
            <Link href={`/courses/${courseSlug}`} className={BACK_BUTTON_CLASS}>
              {alliengllCopy.player.backToCourse}
            </Link>
          </section>
        </div>
      ) : (
        <div className={`${LESSON_READING_FRAME_CLASS} flex flex-col gap-4 py-10 lg:gap-6 sm:py-12`}>
          {state.teaser.length > 0 && (
            <div className="flex flex-col gap-4 lg:gap-6" data-testid="lesson-teaser">
              {state.teaser.map((block) => (
                <div key={block.id} className={block.type === "heading" ? HEADING_WIDTH_CLASS : READING_WIDTH_CLASS}>
                  <TeaserBlock block={block} />
                </div>
              ))}
            </div>
          )}
          <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">{signInCopy.title}</h2>
            <p className="max-w-sm text-sm text-muted-foreground sm:text-base">{signInCopy.body}</p>
            <Link href={`/login?${new URLSearchParams({ next: lessonPath }).toString()}`} className={SUBMIT_BUTTON_CLASS}>
              {signInCopy.cta}
            </Link>
            {state.openLesson && (
              <p className="max-w-sm text-sm text-muted-foreground">
                {signInCopy.openLessonLead}{" "}
                <Link
                  href={`/courses/${courseSlug}/${state.openLesson.slug}`}
                  className="font-medium text-brand-text underline underline-offset-2 hover:text-foreground"
                >
                  {state.openLesson.title}
                </Link>
              </p>
            )}
            <Link href={`/courses/${courseSlug}`} className={BACK_BUTTON_CLASS}>
              {alliengllCopy.player.backToCourse}
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
