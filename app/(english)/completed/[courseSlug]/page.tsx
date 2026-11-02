import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, Trophy } from "lucide-react";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { getPublicCourse } from "@/lib/coursePage";
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import { BandTopBar } from "../../BandTopBar";
import { HERO_ENTER_CLASS, OFFSET_CTA_CLASS, PAPER_PANEL_CLASS, PAPER_PILL_HIGHLIGHT_CLASS } from "../../surfaceClasses";
import { completedCopy } from "./completedCopy";

/**
 * PROG-008 (docs/decisions/0209) — where a course-complete share link lands.
 * Its point is the og:image (`opengraph-image.tsx`) a messenger shows; a
 * friend who taps through sees the course and one button into it. It names
 * nobody and shows no score (0209 Decision 5): the URL is the same for every
 * learner who finishes the course. Top-level rather than under
 * `/courses/<course>/`, where a static segment would shadow a lesson whose
 * slug is "complete" (0209 Decision 6). Server Component, no client JS.
 */
export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string }> }): Promise<Metadata> {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);
  if (course.state === "not_found") return {};
  return {
    title: `${completedCopy.en.eyebrow}: ${course.title}`,
    description: course.subtitle ?? course.description ?? undefined,
  };
}

export default async function CompletedPage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  const course = await getPublicCourse(courseSlug);
  if (course.state === "not_found") notFound();
  const c = completedCopy[parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value)];
  const lead = course.subtitle ?? course.description;

  return (
    <main className="grid-paper flex flex-1 flex-col">
      <section>
        <div className={`${LESSON_READING_FRAME_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>
              <Trophy className="size-3.5" aria-hidden="true" />
              {c.eyebrow}
            </span>
            <h1 className="max-w-full text-balance break-words font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {course.title}
            </h1>
            {lead && <p className="whitespace-pre-line text-base text-muted-foreground sm:text-lg">{lead}</p>}
          </div>
        </div>
      </section>

      <div className={`${LESSON_READING_FRAME_CLASS} pb-10 pt-4 sm:pb-12`}>
        <section className={`${PAPER_PANEL_CLASS} flex flex-col items-center gap-4 px-6 py-10 text-center`}>
          <p className="max-w-md text-sm text-muted-foreground sm:text-base">{c.body}</p>
          <Link href={`/courses/${courseSlug}`} className={`${OFFSET_CTA_CLASS} max-w-full`}>
            <span className="truncate">{c.cta}</span>
            <ArrowRight className="size-4 flex-none" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
