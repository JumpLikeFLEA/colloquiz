import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Gift, ListChecks } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { CefrLevel } from "@/lib/courseLevels";
import type { CourseProgress, CourseTotals } from "@/lib/coursePageProgress";
import { pluralize } from "@/lib/pluralCategory";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { BandTopBar } from "../../BandTopBar";
import { LanguageToggle } from "../../LanguageToggle";
import {
  HERO_ENTER_CLASS,
  OFFSET_CTA_CLASS,
  PAPER_PILL_CLASS,
  PAPER_PILL_HIGHLIGHT_CLASS,
} from "../../surfaceClasses";
import { courseCopy } from "./courseCopy";

/**
 * The course page's hero (docs/decisions/0079 D1–D3), on the Alina Cher grid
 * paper since SHELL-028 (docs/decisions/0166), in the landing's vocabulary
 * (0165): ink outlines, the offset shadow, a yellow level pill, the display
 * face for the title and the violet offset button. `BandTopBar` (paper tone), then the text column on
 * the left (level and "whole course is free" pills, title, lead, a size
 * line, the two progress numbers once anything is attempted, the violet
 * CTA) and the cover on the right at `lg`. On a phone the cover moves above
 * the text, the way the catalogue card that led here shows it.
 *
 * A course with no cover gets a grid-paper level tile at `lg` only, the one
 * `CourseCard` shows. On a phone the level pill already says the same thing,
 * so a tile there would only push the lesson list further down.
 *
 * Progress (D2) is TWO numbers, never blended (docs/handoff.md, "Scoring
 * and progress"), and only rendered once something is attempted: "0 из 8"
 * told every anonymous visitor nothing, on every visit.
 *
 * The top bar carries the EN/RU toggle shared with the landing page
 * (docs/decisions/0080); every string here comes from `courseCopy[lang]`.
 * `account` is the signed-in learner's `AccountMenu` (SHELL-019,
 * docs/decisions/0086), null for a signed-out visitor.
 */
export function CourseHero({
  lang,
  title,
  level,
  lead,
  coverImageUrl,
  totals,
  progress,
  cta,
  account,
}: {
  lang: SurfaceLang;
  title: string;
  level: CefrLevel;
  lead: string | null;
  coverImageUrl: string | null;
  totals: CourseTotals;
  progress: CourseProgress;
  cta: { href: string; label: string } | null;
  account: ReactNode;
}) {
  const c = courseCopy[lang];

  return (
    <section>
      <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-12 pt-5 sm:pb-16 lg:gap-12 lg:pb-20 lg:pt-6`}>
        <BandTopBar
          back={{ href: "/#catalogue", label: c.backToCatalogue }}
          toggle={<LanguageToggle lang={lang} label={c.languageGroupLabel} tone="paper" />}
          account={account}
          tone="paper"
        />

        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div className="flex flex-col items-start gap-5">
            <div className={`${HERO_ENTER_CLASS} flex flex-wrap items-center gap-2`}>
              <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{level}</span>
              {totals.allFree && (
                <span className={PAPER_PILL_CLASS}>
                  <Gift className="size-3.5" aria-hidden="true" />
                  {c.allFree}
                </span>
              )}
            </div>
            <h1
              className={`${HERO_ENTER_CLASS} delay-75 text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem]`}
            >
              {title}
            </h1>
            {lead && (
              <p className={`${HERO_ENTER_CLASS} delay-150 max-w-xl whitespace-pre-line text-base text-muted-foreground sm:text-lg`}>
                {lead}
              </p>
            )}
            {totals.lessonCount > 0 && (
              <ul className={`${HERO_ENTER_CLASS} delay-200 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground`}>
                <li className="inline-flex items-center gap-1.5">
                  <BookOpen className="size-4" aria-hidden="true" />
                  {totals.lessonCount} {pluralize(totals.lessonCount, lang, c.lessons)}
                </li>
                {totals.totalMinutes !== null && (
                  <li className="inline-flex items-center gap-1.5">
                    <Clock className="size-4" aria-hidden="true" />~{totals.totalMinutes} {c.minutesLabel}
                  </li>
                )}
                {totals.exerciseCount > 0 && (
                  <li className="inline-flex items-center gap-1.5">
                    <ListChecks className="size-4" aria-hidden="true" />
                    {totals.exerciseCount} {pluralize(totals.exerciseCount, lang, c.exercises)}
                  </li>
                )}
              </ul>
            )}
            {progress.attempted > 0 && (
              <dl className={`${HERO_ENTER_CLASS} delay-200 grid w-full max-w-sm grid-cols-2 gap-3`}>
                <div className="flex flex-col-reverse gap-0.5 rounded-xl border-2 border-ink bg-card px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{c.progressAttempted}</dt>
                  <dd className="font-display text-xl font-extrabold text-foreground">
                    {progress.attempted} {c.progressOf} {progress.total}
                  </dd>
                </div>
                {progress.averagePercent !== null && (
                  <div className="flex flex-col-reverse gap-0.5 rounded-xl border-2 border-ink bg-card px-4 py-3">
                    <dt className="text-xs text-muted-foreground">{c.progressAverage}</dt>
                    <dd className="font-display text-xl font-extrabold text-foreground">{progress.averagePercent}%</dd>
                  </div>
                )}
              </dl>
            )}
            <div className={`${HERO_ENTER_CLASS} delay-300 pt-1`}>
              {cta ? (
                <Link href={cta.href} className={OFFSET_CTA_CLASS}>
                  {cta.label}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                totals.lessonCount > 0 && <p className="text-sm text-muted-foreground">{c.noFreeLesson}</p>
              )}
            </div>
          </div>

          {coverImageUrl ? (
            <div className="relative order-first aspect-video w-full overflow-hidden rounded-2xl border-2 border-ink bg-muted shadow-offset animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-both motion-reduce:animate-none lg:order-none lg:rotate-1">
              <Image
                src={coverImageUrl}
                alt=""
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 440px, (min-width: 576px) 544px, 100vw"
              />
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="grid-paper relative hidden aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-ink bg-brand-subtle shadow-offset animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-both motion-reduce:animate-none lg:flex lg:rotate-1"
            >
              <span className="relative font-display text-8xl font-extrabold tracking-tight text-brand-text">{level}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
