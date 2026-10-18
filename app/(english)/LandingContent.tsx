"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import type { CatalogueCourse } from "@/lib/courseCatalogue";
import { pluralize } from "@/lib/pluralCategory";
import { LandingHeader } from "./LandingHeader";
import { PageLang } from "./HtmlLang";
import { EnglishFooter } from "./EnglishFooter";
import { CourseCard } from "./CourseCard";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy } from "./landingCopy";
import { SectionHeading } from "./SectionHeading";
import { SparkCta } from "./SparkCta";
import { HERO_ENTER_CLASS, OFFSET_CTA_CLASS } from "./surfaceClasses";

/**
 * Landing page body, as a Client Component: holds the EN/RU toggle state
 * (docs/handoff.md, "Audience and language"; shared with the course pages
 * since docs/decisions/0080) and re-renders every string from it, at once,
 * on toggle. `initialLang` comes from page.tsx, which reads the persisted
 * choice from a cookie server-side, so a returning visitor's saved language is
 * already correct in the FIRST response, with no client-side re-render/flash
 * and no hydration mismatch to avoid (a useEffect reading localStorage after
 * mount was tried first and dropped: it flashed the default before correcting,
 * the "derive state via setState-in-effect" antipattern the react-hooks lint
 * rule `set-state-in-effect` exists to catch). The shared `LanguageToggle`
 * saves the choice to the same cookie through a Server Action, so the next
 * page (and a reload) already carries it. Data (`courses`, `heroHref`) is
 * fetched server-side in page.tsx and passed in; this component owns only the
 * lang toggle, not the Supabase reads.
 *
 * Layout (SHELL-027, docs/decisions/0165, the Alina Cher redesign that
 * supersedes 0078's gradient landing): the whole page is grid paper. A header,
 * then the hero (headline with the marker, subtitle, the one-tap CTA, the bio
 * line and social row on the left; the comic panel and sticker on the right),
 * the catalogue, "how it works" (record, feedback, compare) and a closing
 * yellow card repeating the hero's one-tap link. The hero's words are the
 * owner's mockups (SHELL-031, docs/decisions/0167), which have no eyebrow and
 * no "no account" line. `heroTitle`, `heroBio` and `comic` are
 * rendered server-side once per language by page.tsx and this component picks
 * one, so their markup costs no client JS (0078's rule, `account`'s pattern
 * from 0086); `account` is the header's account chip the same way, null for a
 * signed-out visitor, who gets the "Log in" link. Sections below the hero fade
 * up on scroll via the CSS-only `.reveal-on-scroll` (app/globals.css), no
 * observer, no script.
 *
 * The footer renders here, with the toggle's live `lang` (the root layout's
 * copy, gated by `EnglishFooterGate.tsx`, renders nothing on `/`), so it
 * switches language with the rest of the page. The content div takes `flex-1`
 * to grow and push the footer to the bottom of `<main>` when content is short,
 * exactly like the root layout does for every other route's footer.
 */
export function LandingContent({
  courses,
  heroHref,
  initialLang,
  heroTitle,
  heroBio,
  comic,
  account,
}: {
  courses: CatalogueCourse[];
  heroHref: string;
  initialLang: SurfaceLang;
  heroTitle: Record<SurfaceLang, ReactNode>;
  heroBio: Record<SurfaceLang, ReactNode>;
  comic: Record<SurfaceLang, ReactNode>;
  account: Record<SurfaceLang, ReactNode> | null;
}) {
  const [lang, setLang] = useState<SurfaceLang>(initialLang);
  const t = landingCopy[lang];

  const primaryCta = (
    <SparkCta>
      <Link href={heroHref} className={OFFSET_CTA_CLASS}>
        {t.ctaPrimary}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </Link>
    </SparkCta>
  );

  return (
    <>
      {/* The toggle switches these strings at once, before its Server
          Action's re-render reaches the root layout (SHELL-018,
          docs/decisions/0091). */}
      <PageLang lang={lang} />
      <div className="grid-paper flex flex-1 flex-col">
        <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-10 pb-16 pt-4 sm:gap-12 sm:pt-5 lg:gap-16 lg:pb-24`}>
          <LandingHeader lang={lang} onSetLang={setLang} account={account?.[lang] ?? null} />

          <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
            <div className="flex flex-col items-start gap-5">
              <h1 className={`${HERO_ENTER_CLASS} font-display text-[2rem] font-extrabold leading-[1.2] tracking-tight text-foreground sm:text-5xl sm:leading-[1.2] lg:text-6xl lg:leading-[1.2]`}>
                {heroTitle[lang]}
              </h1>
              <p className={`${HERO_ENTER_CLASS} delay-150 max-w-md text-base text-foreground/80 sm:text-lg`}>
                {t.heroSubtitle}
              </p>
              <div className={`${HERO_ENTER_CLASS} delay-200 flex flex-wrap items-center gap-x-6 gap-y-2`}>
                {primaryCta}
                <Link
                  href="#catalogue"
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-base font-semibold text-brand-text underline decoration-2 underline-offset-4 outline-none hover:decoration-brand focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t.catalogueLink}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              <div className={`${HERO_ENTER_CLASS} delay-300`}>{heroBio[lang]}</div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both motion-reduce:animate-none">
              {comic[lang]}
            </div>
          </section>
        </div>

        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex w-full flex-1 flex-col gap-16 pb-16 sm:gap-20 lg:gap-24 lg:pb-24`}>
          <section id="catalogue" className="reveal-on-scroll flex scroll-mt-6 flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <SectionHeading display eyebrow={t.catalogueEyebrow} title={t.coursesHeading} subtitle={t.catalogueSubtitle} />
              {courses.length > 0 && (
                <span className="text-sm font-medium text-muted-foreground">
                  {courses.length} {pluralize(courses.length, lang, t.courses)}
                </span>
              )}
            </div>
            {courses.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                {t.empty}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                {courses.map((course) => (
                  <CourseCard key={course.slug} course={course} lang={lang} />
                ))}
              </div>
            )}
          </section>

          <section className="reveal-on-scroll flex flex-col gap-6">
            <SectionHeading display eyebrow={t.stepsEyebrow} title={t.stepsHeading} subtitle={t.stepsSubtitle} />
            <ol className="grid gap-3 lg:grid-cols-3 lg:gap-4">
              {t.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4 rounded-2xl border border-border bg-card p-4 lg:flex-col lg:p-6">
                  <span className="flex size-10 flex-none items-center justify-center rounded-xl border-2 border-highlight-foreground bg-highlight font-display text-base font-extrabold text-highlight-foreground">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-bold text-foreground sm:text-base">{step.title}</h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="reveal-on-scroll flex flex-col items-center gap-4 rounded-3xl border-2 border-highlight-foreground bg-highlight px-6 py-12 text-center text-highlight-foreground shadow-offset sm:px-10 sm:py-16">
            <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{t.closingTitle}</h2>
            <p className="text-sm sm:text-base">{t.closingText}</p>
            <div className="pt-2">{primaryCta}</div>
          </section>
        </div>
      </div>
      <EnglishFooter lang={lang} />
    </>
  );
}
