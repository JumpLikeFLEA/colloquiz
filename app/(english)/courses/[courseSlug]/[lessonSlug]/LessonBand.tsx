import type { ReactNode } from "react";
import { Clock, ListChecks } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { pluralize } from "@/lib/pluralCategory";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import { BandTopBar } from "../../../BandTopBar";
import { GradientBackdrop } from "../../../HeroDecor";
import { GLASS_PILL_CLASS, GRADIENT_BAND_CLASS, HERO_ENTER_CLASS } from "../../../surfaceClasses";

/**
 * The lesson page's header (docs/decisions/0079 D5): a compact version of
 * the course page's gradient band. It holds `BandTopBar` with "← Back to
 * course" (and no EN/RU toggle: lesson chrome is always English,
 * docs/decisions/0080 Decision 5), the course title, the lesson title, its description, and
 * "Lesson N of M · K min · J exercises".
 *
 * Everything sits in `LESSON_READING_FRAME_CLASS`, so the title starts at
 * the same x as the theory and exercises below it. The old header put an
 * `<h1>` at the edge of the 1024px column, over content centred at 672px.
 *
 * A Server Component: page.tsx renders it and hands it to the client
 * `LessonPageClient` as a node, so its markup and icons cost no client JS
 * (the 0078 Decision 5 pattern). The paid "not_available" state renders
 * the same band (D8), which is why the lesson-specific fields are plain
 * props rather than a `PublicLesson`. `account` is the signed-in learner's
 * `AccountMenu` (SHELL-019, docs/decisions/0086), English like the rest of
 * the lesson chrome; null for a signed-out visitor.
 */
export function LessonBand({
  courseSlug,
  courseTitle,
  title,
  description,
  position,
  estimatedMinutes,
  itemCount,
  account,
}: {
  courseSlug: string;
  courseTitle: string;
  title: string;
  description: string | null;
  position: { index: number; total: number } | null;
  estimatedMinutes: number | null;
  itemCount: number;
  account: ReactNode;
}) {
  const p = alliengllCopy.player;

  return (
    <section className={GRADIENT_BAND_CLASS}>
      <GradientBackdrop />
      <div className={`${LESSON_READING_FRAME_CLASS} relative flex flex-col gap-8 pb-10 pt-5 sm:pb-12 lg:pt-6`}>
        <BandTopBar back={{ href: `/courses/${courseSlug}`, label: p.backToCourse }} account={account} />
        <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
          <p className="line-clamp-1 text-sm font-medium text-white/75">{courseTitle}</p>
          <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
          {description && <p className="text-base text-white/80">{description}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {position && (
              <span className={GLASS_PILL_CLASS}>
                {p.lessonLabel} {position.index} {p.lessonOf} {position.total}
              </span>
            )}
            {estimatedMinutes !== null && (
              <span className={GLASS_PILL_CLASS}>
                <Clock className="size-3.5" aria-hidden="true" />
                {estimatedMinutes} {p.minutesLabel}
              </span>
            )}
            {itemCount > 0 && (
              <span className={GLASS_PILL_CLASS}>
                <ListChecks className="size-3.5" aria-hidden="true" />
                {itemCount} {pluralize(itemCount, "en", p.exercises)}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
