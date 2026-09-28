"use client";

import { useState } from "react";
import Link from "next/link";
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import type { CatalogueCourse } from "@/lib/courseCatalogue";
import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { CourseCard } from "./CourseCard";
import type { LandingLang } from "./landingCopy";
import { landingCopy, LANDING_LANG_COOKIE } from "./landingCopy";

/**
 * Landing page body, as a Client Component: holds the EN/RU toggle state
 * (docs/handoff.md, "Audience and language", 2026-09-28 landing exception)
 * and re-renders the header/hero/catalogue-heading/footer strings from it.
 * `initialLang` comes from page.tsx, which reads the persisted choice from a
 * cookie server-side — so a returning visitor's saved language is already
 * correct in the FIRST response, with no client-side re-render/flash and no
 * hydration mismatch to avoid (a useEffect reading localStorage after mount
 * was tried first and dropped: it flashed the default before correcting,
 * and reads as exactly the "derived state via setState-in-effect" antipattern
 * the react-hooks lint rule (`set-state-in-effect`) exists to catch — the
 * fix is to not need the effect, not to silence the rule). `handleSetLang`
 * writes the same cookie on toggle so the next request already carries it.
 * Data (`courses`, `heroHref`) is fetched server-side in page.tsx and passed
 * in — this component owns only the lang toggle, not the Supabase reads.
 * `LandingFooter` renders here (not the shared `EnglishFooter` the root
 * layout uses on every other route — see `EnglishFooterGate.tsx`) because
 * it needs `lang` to translate.
 *
 * This component's two returned elements are `<main>`'s DIRECT children
 * (a Fragment adds no DOM node), so `<main>`'s `flex flex-col` (page.tsx)
 * lays them out as a column: the content div below takes `flex-1` to grow
 * and push `LandingFooter` to the bottom of `<main>` when content is short,
 * exactly like the root layout does for every other route's footer.
 */
export function LandingContent({
  courses,
  heroHref,
  initialLang,
}: {
  courses: CatalogueCourse[];
  heroHref: string;
  initialLang: LandingLang;
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

  return (
    <>
      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex flex-1 flex-col gap-12 py-6 lg:py-8`}>
        <LandingHeader lang={lang} onSetLang={handleSetLang} />

        <section className="flex flex-col items-start gap-6 lg:pt-8">
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl lg:text-5xl">{t.heroTitle}</h1>
          <p className="max-w-xl text-base text-muted-foreground lg:text-lg">{t.heroSubtitle}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={heroHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              {t.ctaPrimary}
            </Link>
            <Link
              href="#catalogue"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.catalogueLink}
            </Link>
          </div>
          <span className="text-xs text-muted-foreground">{t.noAccount}</span>
        </section>

        <section id="catalogue" className="flex flex-col gap-6">
          <h2 className="text-xl font-semibold text-foreground">{t.coursesHeading}</h2>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} />
              ))}
            </div>
          )}
        </section>
      </div>
      <LandingFooter lang={lang} />
    </>
  );
}
