"use client";

import { LESSON_HEADER_COLUMN_CLASS, LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import type { NextLessonLink } from "@/lib/publicLesson";

/**
 * PLAY-006's client half of the RSC boundary. `practiceRenderer` is a
 * function prop — it has to be imported here, not passed down from the
 * server page.tsx, per docs/decisions/0029 Decision 5 — same shape as
 * PreviewClient.tsx and LessonPlayerDemoClient.tsx. `document`/`attemptId`
 * are plain JSON, generated server-side and forwarded down unchanged.
 * Invalid-document handling (an author error, not a crash) already lives
 * inside LessonPlayer itself; nothing extra is needed here for it.
 *
 * PLAY-007 adds `courseSlug`/`nextLesson`, forwarded straight to `LessonPlayer`
 * for its completion screen — see that component for why the "next lesson"
 * link is resolved server-side rather than here.
 *
 * ANON-005 adds `lessonVersionId`/`isSignedIn`, forwarded straight to
 * `LessonPlayer` so it can record a signed-in learner's attempts — see that
 * component for why the recording code is dynamically imported rather than
 * a static import here.
 */
export function LessonPageClient({
  title,
  document,
  attemptId,
  courseSlug,
  nextLesson,
  lessonVersionId,
  isSignedIn,
}: {
  title: string;
  document: unknown[];
  attemptId: string;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
  lessonVersionId: string;
  isSignedIn: boolean;
}) {
  return (
    <div className="py-8">
      <div className={`${LESSON_HEADER_COLUMN_CLASS} mb-2`}>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      <LessonPlayer
        document={document}
        attemptId={attemptId}
        practiceRenderer={practiceRenderer}
        courseSlug={courseSlug}
        nextLesson={nextLesson}
        lessonVersionId={lessonVersionId}
        isSignedIn={isSignedIn}
      />
    </div>
  );
}
