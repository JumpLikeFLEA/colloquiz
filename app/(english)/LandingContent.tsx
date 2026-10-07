"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import type { CatalogueCourse } from "@/lib/courseCatalogue";
import { pluralize } from "@/lib/pluralCategory";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { CourseCard } from "./CourseCard";
import { HeroDemo } from "./HeroDemo";
import type { LandingLang } from "./landingCopy";
import { landingCopy, LANDING_LANG_COOKIE } from "./landingCopy";
import { SectionHeading } from "./SectionHeading";
import { GLASS_PILL_CLASS, GRADIENT_BAND_CLASS, HERO_ENTER_CLASS, WHITE_CTA_CLASS } from "./surfaceClasses";

/**
 * Landing page body, as a Client Component: holds the EN/RU toggle state
 * (docs/handoff.md, "Audience and language", 2026-09-28 landing exception)
 * and re-renders every string from it. `initialLang` comes from page.tsx,
 * which reads the persisted choice from a cookie server-side — so a
 * returning visitor's saved language is already correct in the FIRST
 * response, with no client-side re-render/flash and no hydration mismatch to
 * avoid (a useEffect reading localStorage after mount was tried first and
 * dropped: it flashed the default before correcting, and reads as exactly
 * the "derived state via setState-in-effect" antipattern the react-hooks
 * lint rule (`set-state-in-effect`) exists to catch — the fix is to not need
 * the effect, not to silence the rule). `handleSetLang` writes the same
 * cookie on toggle so the next request already carries it. Data (`courses`,
 * `heroHref`) is fetched server-side in page.tsx and passed in — this
 * component owns only the lang toggle, not the Supabase reads.
 *
 * Layout (docs/decisions/0078): a full-bleed brand-gradient hero band
 * (header, headline, the one-tap CTA, the HeroDemo card), a value strip
 * overlapping its bottom edge, the catalogue, "how it works", and a closing
 * gradient CTA card repeating the hero's one-tap link. `backdrop`,
 * `heroChips` and `valueIcons` are rendered server-side by page.tsx and
 * passed in, so their purely decorative markup costs no client JS. Sections below the
 * hero fade up on scroll via the CSS-only `.reveal-on-scroll`
 * (app/globals.css) — no observer, no script.
 *
 * `LandingFooter` renders here (not the shared `EnglishFooter` the root
 * layout uses on every other route — see `EnglishFooterGate.tsx`) because
 * it needs `lang` to translate. This component's two returned elements are
 * `<main>`'s DIRECT children (a Fragment adds no DOM node), so `<main>`'s
 * `flex flex-col` (page.tsx) lays them out as a column: the content div
 * takes `flex-1` to grow and push `LandingFooter` to the bottom of `<main>`
 * when content is short, exactly like the root layout does for every other
 * route's footer.
 */
export function LandingContent({
  courses,
  heroHref,
  initialLang,
  backdrop,
  heroChips,
  valueIcons,
}: {
  courses: CatalogueCourse[];
  heroHref: string;
  initialLang: LandingLang;
  backdrop: ReactNode;
  heroChips: ReactNode;
  /** One per `t.values` entry, same order (HeroDecor.tsx's valueIcons). */
  valueIcons: ReactNode[];
}) {
  const [lang, setLang] = useState<LandingLang>(initialLang);
  const t = landingCopy[lang];

  function handleSetLang(next: LandingLang) {
    setLang(next);
    // A UI preference, not a security-sensitive value: no HttpOnly, no
    // server round trip to set it. 1 year, matching the scope of "remember
    // this visitor's choice" rather than a session-length default.
    document.cookie = `${LANDING_LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const primaryCta = (
    <Link
      href={heroHref}
      className={WHITE_CTA_CLASS}
    >
      {t.ctaPrimary}
      <ArrowRight
        className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );

  return (
    <>
      <div className="flex flex-1 flex-col">
        <section className={GRADIENT_BAND_CLASS}>
          {backdrop}
          <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-10 pb-20 pt-5 sm:pb-24 lg:gap-14 lg:pb-28 lg:pt-6`}>
            <LandingHeader lang={lang} onSetLang={handleSetLang} />

            <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
              <div className="flex flex-col items-start gap-5">
                <span className={`${HERO_ENTER_CLASS} ${GLASS_PILL_CLASS}`}>
                  {t.heroEyebrow}
                </span>
                <h1 className={`${HERO_ENTER_CLASS} delay-75 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl`}>
                  {t.heroTitle}
                </h1>
                <p className={`${HERO_ENTER_CLASS} delay-150 max-w-md text-base text-white/80 sm:text-lg`}>
                  {t.heroSubtitle}
                </p>
                <div className={`${HERO_ENTER_CLASS} delay-200 flex flex-wrap items-center gap-3`}>
                  {primaryCta}
                  <Link
                    href="#catalogue"
                    className="inline-flex min-h-12 items-center rounded-xl px-4 py-3 text-sm font-medium text-white/90 ring-1 ring-white/30 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {t.catalogueLink}
                  </Link>
                </div>
                <span className={`${HERO_ENTER_CLASS} delay-300 inline-flex items-center gap-1.5 text-xs text-white/75`}>
                  <Check className="size-3.5" aria-hidden="true" />
                  {t.noAccount}
                </span>
              </div>

              <div className="relative animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both motion-reduce:animate-none lg:rotate-1">
                <HeroDemo lang={lang} />
                {heroChips}
              </div>
            </div>
          </div>
        </section>

        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex w-full flex-col gap-16 pb-16 sm:gap-20 lg:gap-24 lg:pb-24`}>
          <ul className="-mt-10 grid grid-cols-2 gap-3 sm:-mt-12 lg:grid-cols-4 lg:gap-4">
            {t.values.map((value, i) => (
              <li key={value.title} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-subtle text-brand-text">
                  {valueIcons[i]}
                </span>
                <span className="text-sm font-semibold text-foreground">{value.title}</span>
                <span className="text-xs text-muted-foreground">{value.text}</span>
              </li>
            ))}
          </ul>

          <section id="catalogue" className="reveal-on-scroll flex scroll-mt-6 flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <SectionHeading eyebrow={t.catalogueEyebrow} title={t.coursesHeading} subtitle={t.catalogueSubtitle} />
              {courses.length > 0 && (
                <span className="text-sm font-medium text-muted-foreground">
                  {courses.length} {pluralize(courses.length, lang, t.courses)}
                </span>
              )}
            </div>
            {courses.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t.empty}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {courses.map((course) => (
                  <CourseCard key={course.slug} course={course} lang={lang} />
                ))}
              </div>
            )}
          </section>

          <section className="reveal-on-scroll flex flex-col gap-6">
            <SectionHeading eyebrow={t.stepsEyebrow} title={t.stepsHeading} />
            <ol className="grid gap-3 lg:grid-cols-3 lg:gap-4">
              {t.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4 rounded-2xl border border-border bg-card p-4 lg:flex-col lg:p-6">
                  <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-sm font-semibold text-white shadow-md shadow-brand/30">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-foreground sm:text-base">{step.title}</h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="reveal-on-scroll relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-deep via-brand to-brand-accent px-6 py-12 text-center text-white sm:px-10 sm:py-16">
            {backdrop}
            <div className="relative flex flex-col items-center gap-4">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{t.closingTitle}</h2>
              <p className="text-sm text-white/80 sm:text-base">{t.closingText}</p>
              <div className="pt-2">{primaryCta}</div>
            </div>
          </section>
        </div>
      </div>
      <LandingFooter lang={lang} />
    </>
  );
}
