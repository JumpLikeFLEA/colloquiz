import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { getCourseAttemptSummary } from "@/lib/courseAttempts";
import { getPublicCourse } from "@/lib/coursePage";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { bestScoreForLesson, courseProgress, courseTotals, firstOpenLesson } from "@/lib/coursePageProgress";
// Direct path, not the `@/app/components/lesson-player` barrel: that barrel
// also re-exports LessonPlayer + practiceRenderer (dnd-kit and every
// per-type practice renderer, PLAY-012), which this route never uses but a
// barrel import still pulled into its bundle (confirmed by npm run budget —
// see docs/decisions/0059). lesson-player-demo/page.tsx has the same latent
// barrel-import issue; out of scope to fix here since it's a Colloquiz admin
// route the OPS-006 budget guard doesn't cover.
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { AccountMenu } from "../../AccountMenu";
import { SectionHeading } from "../../SectionHeading";
import { courseCopy } from "./courseCopy";
import { CourseHero } from "./CourseHero";
import { LessonListItem } from "./LessonListItem";

/**
 * SHELL-008 — the page a catalogue card opens into (SHELL-010 builds the
 * card itself; this route doesn't depend on it, both link to the same
 * `/courses/[courseSlug]` URL). Server Component, same dynamic-by-cookies
 * shape as PLAY-006's lesson page (lib/coursePage.ts reads via
 * lib/supabase/server.ts).
 *
 * ANON-005 — `attempts` is now a real map built by
 * lib/courseAttempts.ts's getCourseAttemptSummary() (empty for a signed-out
 * visitor, per that module's own header), superseding 0059's "called with an
 * empty map until ANON-002/003 land" note.
 *
 * docs/decisions/0079 — rebuilt in the landing's vocabulary: a gradient
 * hero band (`CourseHero`), then an optional "О курсе" section and the
 * numbered lesson list, left-aligned to the same column edge as the hero
 * text. The hero leads with the short `subtitle` (the catalogue card's
 * summary), falling back to `description`; the full `description` gets its
 * own section only when it isn't already what the hero showed, so a long
 * description never stretches the band. Still a Server Component; its only
 * client JS is the EN/RU `LanguageToggle` in the band.
 *
 * docs/decisions/0080 — the chrome follows the EN/RU choice shared with the
 * landing page, read here from the same cookie. Authored content (title,
 * descriptions, lesson titles) renders as written in either language.
 */
// SHELL-009 — og:title/og:description come from these (Next's Metadata API
// fallback), the og:image from the co-located opengraph-image.tsx, which
// does its own getPublicCourse call — cache() (lib/coursePage.ts) dedupes
// the two calls this function and the page component both make.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);
  if (course.state === "not_found") return {};

  return {
    title: course.title,
    description: course.description ?? undefined,
  };
}

export default async function CoursePage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);

  if (course.state === "not_found") notFound();

  const attempts = await getCourseAttemptSummary(course.id);
  const progress = courseProgress(course.lessons, attempts);
  const totals = courseTotals(course.lessons);
  // CNT-014: the CTA, its label, the pill and the per-row badges all render
  // from course_lesson_states (docs/decisions/0102), never a column read.
  const firstOpen = firstOpenLesson(course.lessons);
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  const c = courseCopy[lang];
  // SHELL-019 (docs/decisions/0086): the account chip, in the saved language.
  const signedIn = await getSignedInAccount();

  const lead = course.subtitle ?? course.description;
  const about = course.description && course.description !== lead ? course.description : null;

  return (
    // No min-h-svh: the root layout's wrapper div already sizes itself to
    // the viewport-minus-footer space, so main forcing its own full-viewport
    // height double-counted against EnglishFooter and forced a scrollbar on
    // a short course (same bug as the landing page, docs/ui-decisions.md,
    // 2026-09-28).
    <main className="bg-background">
      <CourseHero
        lang={lang}
        title={course.title}
        level={course.level}
        lead={lead}
        coverImageUrl={course.coverImageUrl}
        totals={totals}
        progress={progress}
        account={signedIn && <AccountMenu email={signedIn.email} lang={lang} next={`/courses/${courseSlug}`} />}
        cta={
          firstOpen
            ? { href: `/courses/${courseSlug}/${firstOpen.slug}`, label: totals.allOpen ? c.startCourse : c.startFirstFree }
            : null
        }
      />

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-12 py-12 sm:gap-16 sm:py-16`}>
        {about && (
          <section className="flex max-w-3xl flex-col gap-4">
            <SectionHeading title={c.aboutTitle} />
            <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">{about}</p>
          </section>
        )}

        <section className="flex flex-col gap-6">
          <SectionHeading eyebrow={c.lessonsEyebrow} title={c.lessonsTitle} />
          {course.lessons.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {c.noLessons}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {course.lessons.map((lesson, i) => (
                <LessonListItem
                  key={lesson.slug}
                  lang={lang}
                  href={`/courses/${courseSlug}/${lesson.slug}`}
                  position={i + 1}
                  lesson={lesson}
                  showFreeBadge={lesson.accessLevel === "anyone" && !totals.allFree}
                  bestPercent={bestScoreForLesson(lesson.slug, attempts)}
                />
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
