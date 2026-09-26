import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getPublicCourse } from "@/lib/coursePage";
import { bestScoreForLesson, courseProgress, firstFreeLesson } from "@/lib/coursePageProgress";
// Direct path, not the `@/app/components/lesson-player` barrel: that barrel
// also re-exports LessonPlayer + practiceRenderer (dnd-kit and every
// per-type practice renderer, PLAY-012), which this route never uses but a
// barrel import still pulled into its bundle (confirmed by npm run budget —
// see docs/decisions/0059). lesson-player-demo/page.tsx has the same latent
// barrel-import issue; out of scope to fix here since it's a Colloquiz admin
// route the OPS-006 budget guard doesn't cover.
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";

/**
 * SHELL-008 — the page a catalogue card opens into (SHELL-010 builds the
 * card itself; this route doesn't depend on it, both link to the same
 * `/courses/[courseSlug]` URL). Server Component, same dynamic-by-cookies
 * shape as PLAY-006's lesson page (lib/coursePage.ts reads via
 * lib/supabase/server.ts).
 *
 * No `attempts` argument is passed to `courseProgress`/lesson best-score yet
 * — see lib/coursePageProgress.ts's header comment: ANON-002/003 don't
 * exist, so an empty map is the true current state, not a stub.
 */
export default async function CoursePage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);

  if (course.state === "not_found") notFound();

  const progress = courseProgress(course.lessons, {});
  const firstFree = firstFreeLesson(course.lessons);

  return (
    <main className="min-h-svh bg-background">
      <div className={`${LESSON_HEADER_COLUMN_CLASS} py-8 flex flex-col gap-6`}>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted">
          {course.coverImageUrl ? (
            <Image src={course.coverImageUrl} alt="" fill className="object-cover" sizes="(min-width: 1024px) 1024px, 100vw" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {alliengllCopy.course.noCover}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-brand-subtle px-3 py-1 text-xs font-medium text-brand-text">
              {course.level}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{course.title}</h1>
          {course.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{course.description}</p>}
        </div>

        <p className="text-sm text-muted-foreground">
          {progress.attempted}/{progress.total} {alliengllCopy.course.progressAttempted}
          {progress.averagePercent !== null && (
            <>
              {" · "}
              {alliengllCopy.course.progressAverage}: {progress.averagePercent}%
            </>
          )}
        </p>

        {firstFree ? (
          <Link
            href={`/courses/${courseSlug}/${firstFree.slug}`}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            {alliengllCopy.course.startFirstFree}
          </Link>
        ) : (
          course.lessons.length > 0 && (
            <p className="text-sm text-muted-foreground">{alliengllCopy.course.noFreeLesson}</p>
          )
        )}

        <ul className="flex flex-col gap-3">
          {course.lessons.map((lesson) => {
            const bestPercent = bestScoreForLesson(lesson.slug, {});
            return (
              <li key={lesson.slug}>
                <Link
                  href={`/courses/${courseSlug}/${lesson.slug}`}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{lesson.title}</h2>
                    {lesson.inFreeSample && (
                      <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text">
                        {alliengllCopy.course.freeBadge}
                      </span>
                    )}
                  </div>
                  {lesson.description && <p className="text-xs text-muted-foreground">{lesson.description}</p>}
                  <p className="text-xs text-muted-foreground">
                    {alliengllCopy.course.itemCountLabel}: {lesson.itemCount}
                    {lesson.estimatedMinutes !== null && (
                      <>
                        {" · "}
                        {lesson.estimatedMinutes} {alliengllCopy.course.minutesLabel}
                      </>
                    )}
                    {bestPercent !== null && (
                      <>
                        {" · "}
                        {alliengllCopy.course.bestScoreLabel}: {bestPercent}%
                      </>
                    )}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        {course.lessons.length === 0 && (
          <p className="text-sm text-muted-foreground">{alliengllCopy.course.noLessons}</p>
        )}
      </div>
    </main>
  );
}
