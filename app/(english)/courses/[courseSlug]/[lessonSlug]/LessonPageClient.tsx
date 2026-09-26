"use client";

import { LESSON_HEADER_COLUMN_CLASS, LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * PLAY-006's client half of the RSC boundary. `practiceRenderer` is a
 * function prop — it has to be imported here, not passed down from the
 * server page.tsx, per docs/decisions/0029 Decision 5 — same shape as
 * PreviewClient.tsx and LessonPlayerDemoClient.tsx. `document`/`attemptId`
 * are plain JSON, generated server-side and forwarded down unchanged.
 * Invalid-document handling (an author error, not a crash) already lives
 * inside LessonPlayer itself; nothing extra is needed here for it.
 */
export function LessonPageClient({
  title,
  document,
  attemptId,
}: {
  title: string;
  document: unknown[];
  attemptId: string;
}) {
  return (
    <div className="py-8">
      <div className={`${LESSON_HEADER_COLUMN_CLASS} mb-2`}>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      <LessonPlayer document={document} attemptId={attemptId} practiceRenderer={practiceRenderer} />
    </div>
  );
}
