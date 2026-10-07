import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getLessonNav, getPublicLesson } from "@/lib/publicLesson";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import { LessonBand } from "./LessonBand";
import { LessonPageClient } from "./LessonPageClient";
import { StripBackLink } from "./StripBackLink";

/**
 * PLAY-006 — the first genuinely public read path. Replaces SHELL-007's
 * placeholder (which deliberately read no data, to prove the route group and
 * layout in isolation). Reads with the anon key and no session for an
 * anonymous visitor, or that caller's own JWT when signed in — see
 * lib/publicLesson.ts for how `state` is decided. This Server Component
 * fetches `next/headers` cookies via lib/supabase/server.ts, which makes the
 * route dynamic — correct for now (docs/decisions/0056): any future caching
 * of this route may only ever cache the free-sample case, never a
 * caller-specific entitlement result.
 *
 * attemptId is generated here, per request, server-side (docs/decisions/0029
 * Decision 1) — never derived from anything the client sends.
 */
// SHELL-009 — title/description visible for every lesson regardless of
// entitlement (docs/handoff.md, "Preview, precisely"), so this reads the
// same "not_available" (paid) state as the page and still returns real
// metadata for it, not a placeholder. og:image comes from the co-located
// opengraph-image.tsx; cache() (lib/publicLesson.ts) dedupes the repeat
// getPublicLesson call between this function and the page component.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug, lessonSlug } = await params;
  const lesson = await getPublicLesson(courseSlug, lessonSlug);
  if (lesson.state === "not_found") return {};

  return {
    title: lesson.title,
    description: lesson.description ?? undefined,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const lesson = await getPublicLesson(courseSlug, lessonSlug);

  if (lesson.state === "not_found") notFound();

  const nav = await getLessonNav(lesson.courseId, lessonSlug);
  const band = (
    <LessonBand
      courseSlug={courseSlug}
      courseTitle={lesson.courseTitle}
      title={lesson.title}
      description={lesson.description}
      position={nav && { index: nav.position, total: nav.total }}
      estimatedMinutes={lesson.estimatedMinutes}
      itemCount={lesson.itemCount}
    />
  );

  if (lesson.state === "not_available") {
    // docs/decisions/0079 D8: the paid, not-entitled state gets the same
    // band as a playable lesson. Title, description, item count and
    // minutes stay visible for every lesson (docs/handoff.md, "Preview,
    // precisely") and now sit in the band. Below it is one card with the
    // existing copy and a way back to the course. There is no buy CTA:
    // the paid preview is M3, and no lesson can reach this state at launch.
    // No min-h-svh on <main> (the root layout's sticky-footer wrapper
    // sizes the page, docs/ui-decisions.md 2026-09-28).
    return (
      <main className="bg-background">
        {band}
        <div className={`${LESSON_READING_FRAME_CLASS} py-10 sm:py-12`}>
          <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
            <p className="max-w-sm text-base font-medium text-foreground">{alliengllCopy.notAvailable.body}</p>
            <Link
              href={`/courses/${courseSlug}`}
              className="inline-flex min-h-11 items-center rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
            >
              {alliengllCopy.player.backToCourse}
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const attemptId = crypto.randomUUID();

  return (
    <LessonPageClient
      header={band}
      backLink={<StripBackLink courseSlug={courseSlug} />}
      document={lesson.document}
      attemptId={attemptId}
      courseSlug={courseSlug}
      nextLesson={nav?.next ?? null}
      lessonVersionId={lesson.lessonVersionId}
      isSignedIn={lesson.isSignedIn}
      lessonPath={`/courses/${courseSlug}/${lessonSlug}`}
    />
  );
}
