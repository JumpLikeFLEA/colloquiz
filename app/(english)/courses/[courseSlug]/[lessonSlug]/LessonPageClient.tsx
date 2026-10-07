"use client";

import type { ReactNode } from "react";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import type { NextLessonLink } from "@/lib/publicLesson";
import { LessonProgressStrip } from "./LessonProgressStrip";

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
 *
 * ANON-004 adds `lessonPath`, forwarded straight to `LessonPlayer` for its
 * completion screen's registration offer (docs/decisions/0068).
 *
 * docs/decisions/0079 D5: the bare `<h1>` header is replaced by `header`,
 * the gradient `LessonBand` rendered server-side by page.tsx, and the
 * player gets a sticky `LessonProgressStrip` through `renderProgress`.
 * `backLink` is that strip's icon link, also rendered server-side. The
 * wrapper div is the strip's sticky containing block, so it spans the band
 * and the whole player.
 */
export function LessonPageClient({
  header,
  backLink,
  document,
  attemptId,
  courseSlug,
  nextLesson,
  lessonVersionId,
  isSignedIn,
  lessonPath,
  previousBestPercent,
}: {
  header: ReactNode;
  backLink: ReactNode;
  document: unknown[];
  attemptId: string;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
  lessonVersionId: string;
  isSignedIn: boolean;
  lessonPath: string;
  /** docs/decisions/0088 — the server's best score for this learner, or null. */
  previousBestPercent: number | null;
}) {
  return (
    <div className="pb-8">
      {header}
      <LessonPlayer
        document={document}
        attemptId={attemptId}
        practiceRenderer={practiceRenderer}
        courseSlug={courseSlug}
        nextLesson={nextLesson}
        lessonVersionId={lessonVersionId}
        isSignedIn={isSignedIn}
        lessonPath={lessonPath}
        previousBestPercent={previousBestPercent}
        renderProgress={(progress) => <LessonProgressStrip progress={progress} backLink={backLink} />}
      />
    </div>
  );
}
