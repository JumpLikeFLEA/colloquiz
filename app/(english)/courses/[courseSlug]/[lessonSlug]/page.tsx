import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLessonNav, getPublicLesson } from "@/lib/publicLesson";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { getCourseAttemptSummary } from "@/lib/courseAttempts";
import { bestScoreForLesson } from "@/lib/coursePageProgress";
import { AccountMenu } from "../../../AccountMenu";
import { LessonBand } from "./LessonBand";
import { LessonPageClient } from "./LessonPageClient";
import { LessonUnavailable } from "./LessonUnavailable";
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
  // SHELL-019 (docs/decisions/0086): the account chip, always English here
  // (lesson chrome, docs/decisions/0080 Decision 5).
  const signedIn = await getSignedInAccount();
  const band = (
    <LessonBand
      courseSlug={courseSlug}
      courseTitle={lesson.courseTitle}
      title={lesson.title}
      description={lesson.description}
      position={nav && { index: nav.position, total: nav.total }}
      estimatedMinutes={lesson.estimatedMinutes}
      itemCount={lesson.itemCount}
      account={
        signedIn && <AccountMenu email={signedIn.email} lang="en" next={`/courses/${courseSlug}/${lessonSlug}`} />
      }
    />
  );

  if (lesson.state === "not_available") {
    // docs/decisions/0079 D8; ANON-011's sign-in prompt (0104). The course
    // editor's "Visitor view" renders the same component (AUTH-009).
    return (
      <main className="bg-background">
        <LessonUnavailable
          band={band}
          courseSlug={courseSlug}
          lessonPath={`/courses/${courseSlug}/${lessonSlug}`}
          state={lesson}
        />
      </main>
    );
  }

  const attemptId = crypto.randomUUID();

  // docs/decisions/0088 — the same "Best" the course page shows for this
  // lesson. A failed read shows no note rather than failing the lesson.
  let previousBestPercent: number | null = null;
  if (signedIn) {
    try {
      previousBestPercent = bestScoreForLesson(lessonSlug, await getCourseAttemptSummary(lesson.courseId));
    } catch (err) {
      console.error("failed to read the lesson's best score", err);
    }
  }

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
      previousBestPercent={previousBestPercent}
    />
  );
}
