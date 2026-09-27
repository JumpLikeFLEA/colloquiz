import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getPublicCourse } from "@/lib/coursePage";
import { firstFreeLesson } from "@/lib/coursePageProgress";
import { getPublishedCourses } from "@/lib/publicCatalogue";
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { CourseCard } from "./CourseCard";

/**
 * SHELL-010 — the Russian landing page: hero, then the catalogue. Built
 * once, late (docs/handoff.md, "Visual work" §3's landing-page exception) —
 * the copy in lib/alliengll/copy.ts's `landing`/`catalogue` blocks is the
 * partner's, already in place; this route is the first thing that reads it.
 *
 * "From the bio link to the first free lesson takes at most one tap after /
 * loads" (acceptance): the hero's primary CTA does NOT go to the catalogue
 * first — it links straight to the FIRST published course's first
 * free-sample lesson (firstFreeLesson, the same SHELL-008 helper the course
 * page's own "one tap" CTA already uses), so tapping it once from `/` is a
 * complete reel-to-lesson path. Which course is "first" is
 * getPublishedCourses' created_at order; at one-course-today
 * (docs/handoff.md, "Launch bar") there is no ambiguity to resolve. The
 * catalogue below is still the secondary path, for a visitor who wants to
 * browse instead of jump straight in.
 */
export default async function EnglishLandingPage() {
  const courses = await getPublishedCourses();

  const featured = courses.length > 0 ? await getPublicCourse(courses[0].slug) : null;
  const heroLesson =
    featured && featured.state === "ok" ? firstFreeLesson(featured.lessons) : null;
  const heroHref = heroLesson ? `/courses/${courses[0].slug}/${heroLesson.slug}` : "#catalogue";

  return (
    <main className="min-h-svh bg-background">
      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex flex-col gap-16 py-12`}>
        <section className="flex flex-col items-start gap-6">
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
            {alliengllCopy.landing.heroTitle}
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">{alliengllCopy.landing.heroSubtitle}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={heroHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              {alliengllCopy.landing.ctaPrimary}
            </Link>
            <Link
              href="#catalogue"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {alliengllCopy.landing.catalogueLink}
            </Link>
          </div>
        </section>

        <section id="catalogue" className="flex flex-col gap-6">
          <h2 className="text-xl font-semibold text-foreground">{alliengllCopy.catalogue.title}</h2>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{alliengllCopy.catalogue.empty}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
