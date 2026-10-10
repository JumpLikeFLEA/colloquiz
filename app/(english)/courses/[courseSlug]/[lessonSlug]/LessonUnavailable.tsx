import type { ReactNode } from "react";
import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { LessonState } from "@/lib/coursePageProgress";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";

/**
 * The lesson page's denied state (docs/decisions/0079 D8): the same
 * `LessonBand` as a playable lesson, then one card with the existing copy
 * and a way back to the course. There is no buy CTA, and no lock icon.
 *
 * Its own module since AUTH-009 so the course editor's "Visitor view"
 * renders this exact component rather than a look-alike. `access` is what
 * `lesson_state` (055) returned for the caller; it renders one screen for
 * both values today and ANON-011 gives `needs_sign_in` its prompt. It is
 * also written to `data-access`, so a fetched page says which state SQL
 * returned.
 *
 * Renders a <div>, not <main>: the lesson page wraps it in its <main>, and
 * the editor renders it inside the Colloquiz shell, which has its own. No
 * min-h-svh (the root layout's sticky-footer wrapper sizes the page,
 * docs/ui-decisions.md 2026-09-28). A Server Component.
 */
export function LessonUnavailable({
  band,
  courseSlug,
  access,
}: {
  band: ReactNode;
  courseSlug: string;
  access: Exclude<LessonState, "open">;
}) {
  return (
    <div className="bg-background" data-access={access}>
      {band}
      <div className={`${LESSON_READING_FRAME_CLASS} py-10 sm:py-12`}>
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
          <p className="max-w-sm text-base font-medium text-foreground">{alliengllCopy.notAvailable.body}</p>
          <Link
            href={`/courses/${courseSlug}`}
            className="inline-flex min-h-11 items-center rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            {alliengllCopy.player.backToCourse}
          </Link>
        </section>
      </div>
    </div>
  );
}
