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
import { GradientBackdrop } from "../../HeroDecor";
import { LanguageToggle } from "../../LanguageToggle";
import { GLASS_PILL_CLASS, GRADIENT_BAND_CLASS, HERO_ENTER_CLASS, WHITE_CTA_CLASS } from "../../surfaceClasses";
import { courseCopy } from "./courseCopy";

/**
 * The course page's gradient hero band (docs/decisions/0079 D1–D3), in the
 * landing hero's vocabulary (0078): `BandTopBar`, then the text column on
 * the left (level and "whole course is free" pills, title, lead, a size
 * line, the two progress numbers once anything is attempted, the white
 * CTA) and the cover on the right at `lg`. On a phone the cover moves above
 * the text, the way the catalogue card that led here shows it.
 *
 * A course with no cover gets a translucent level tile at `lg` only. The
 * gradient tile `CourseCard` uses would be gradient-on-gradient here, and on
 * a phone the level pill already says the same thing, so a tile there would
 * only push the lesson list further down.
 *
 * Progress (D2) is TWO numbers, never blended (docs/handoff.md, "Scoring
 * and progress"), and only rendered once something is attempted: "0 из 8"
 * told every anonymous visitor nothing, on every visit.
 *
 * The top bar carries the EN/RU toggle shared with the landing page
 * (docs/decisions/0080); every string here comes from `courseCopy[lang]`.
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
}: {
  lang: SurfaceLang;
  title: string;
  level: CefrLevel;
  lead: string | null;
  coverImageUrl: string | null;
  totals: CourseTotals;
  progress: CourseProgress;
  cta: { href: string; label: string } | null;
}) {
  const c = courseCopy[lang];

  return (
    <section className={GRADIENT_BAND_CLASS}>
      <GradientBackdrop />
      <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-12 pt-5 sm:pb-16 lg:gap-12 lg:pb-20 lg:pt-6`}>
        <BandTopBar
          back={{ href: "/#catalogue", label: c.backToCatalogue }}
          toggle={<LanguageToggle lang={lang} label={c.languageGroupLabel} />}
        />

        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div className="flex flex-col items-start gap-5">
            <div className={`${HERO_ENTER_CLASS} flex flex-wrap items-center gap-2`}>
              <span className={GLASS_PILL_CLASS}>{level}</span>
              {totals.allFree && (
                <span className={GLASS_PILL_CLASS}>
                  <Gift className="size-3.5" aria-hidden="true" />
                  {c.allFree}
                </span>
              )}
            </div>
            <h1
              className={`${HERO_ENTER_CLASS} delay-75 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]`}
            >
              {title}
            </h1>
            {lead && (
              <p className={`${HERO_ENTER_CLASS} delay-150 max-w-xl whitespace-pre-line text-base text-white/80 sm:text-lg`}>
                {lead}
              </p>
            )}
            {totals.lessonCount > 0 && (
              <ul className={`${HERO_ENTER_CLASS} delay-200 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85`}>
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
                <div className="flex flex-col-reverse gap-0.5 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20">
                  <dt className="text-xs text-white/75">{c.progressAttempted}</dt>
                  <dd className="text-xl font-semibold">
                    {progress.attempted} {c.progressOf} {progress.total}
                  </dd>
                </div>
                {progress.averagePercent !== null && (
                  <div className="flex flex-col-reverse gap-0.5 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20">
                    <dt className="text-xs text-white/75">{c.progressAverage}</dt>
                    <dd className="text-xl font-semibold">{progress.averagePercent}%</dd>
                  </div>
                )}
              </dl>
            )}
            <div className={`${HERO_ENTER_CLASS} delay-300 pt-1`}>
              {cta ? (
                <Link href={cta.href} className={WHITE_CTA_CLASS}>
                  {cta.label}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                totals.lessonCount > 0 && <p className="text-sm text-white/75">{c.noFreeLesson}</p>
              )}
            </div>
          </div>

          {coverImageUrl ? (
            <div className="relative order-first aspect-video w-full overflow-hidden rounded-2xl bg-white/10 shadow-2xl shadow-brand-deep/40 ring-1 ring-white/20 animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-both motion-reduce:animate-none lg:order-none lg:rotate-1">
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
              className="relative hidden aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20 animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-both motion-reduce:animate-none lg:flex lg:rotate-1"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle,white_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
              <span className="relative text-8xl font-semibold tracking-tight text-white/90">{level}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
