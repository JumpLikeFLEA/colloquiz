import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { getNextLesson, getPublicLesson } from "@/lib/publicLesson";
import { LessonPageClient } from "./LessonPageClient";

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

  if (lesson.state === "not_available") {
    return (
      // flex-1 (not min-h-svh): same reasoning as error.tsx/not-found.tsx.
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">{lesson.title}</h1>
          {lesson.description && <p className="text-sm text-muted-foreground">{lesson.description}</p>}
          <p className="text-sm text-muted-foreground">
            {alliengllCopy.notAvailable.itemCountLabel}: {lesson.itemCount}
          </p>
          <p className="text-sm text-muted-foreground">{alliengllCopy.notAvailable.body}</p>
        </div>
      </main>
    );
  }

  const attemptId = crypto.randomUUID();
  const nextLesson = await getNextLesson(lesson.courseId, lesson.ordinal);

  return (
    <LessonPageClient
      title={lesson.title}
      document={lesson.document}
      attemptId={attemptId}
      courseSlug={courseSlug}
      nextLesson={nextLesson}
      lessonVersionId={lesson.lessonVersionId}
      isSignedIn={lesson.isSignedIn}
      lessonPath={`/courses/${courseSlug}/${lessonSlug}`}
    />
  );
}
