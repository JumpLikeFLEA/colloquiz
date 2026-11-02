"use client";

import type { ReactNode } from "react";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import type { NextLessonLink } from "@/lib/publicLesson";
import type { LessonCourseContext } from "@/lib/courseCompletion";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";
import type { EarlierAttempt } from "@/lib/lessonPlayer/answeredBefore";
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
  course,
  lessonVersionId,
  isSignedIn,
  lessonPath,
  previousBestPercent,
  earlierAttempts,
  voiceTasks,
  lessonTitle,
}: {
  header: ReactNode;
  backLink: ReactNode;
  document: unknown[];
  /** PLAY-014 */
  lessonTitle: string;
  attemptId: string;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
  /** PROG-008 (docs/decisions/0209): the course, for the completion card. */
  course?: LessonCourseContext;
  lessonVersionId: string;
  isSignedIn: boolean;
  lessonPath: string;
  /** docs/decisions/0088 — the server's best score for this learner, or null. */
  previousBestPercent: number | null;
  /** PLAY-019 (docs/decisions/0210) — this version's earlier attempts (signed in). */
  earlierAttempts?: EarlierAttempt[];
  /** VOICE-005 — set when the lesson has a voice task (docs/decisions/0111). */
  voiceTasks?: VoiceTasksContext;
}) {
  return (
    <div className="grid-paper flex-1 pb-8">
      {header}
      <LessonPlayer
        document={document}
        lessonTitle={lessonTitle}
        attemptId={attemptId}
        practiceRenderer={practiceRenderer}
        courseSlug={courseSlug}
        nextLesson={nextLesson}
        course={course}
        lessonVersionId={lessonVersionId}
        isSignedIn={isSignedIn}
        lessonPath={lessonPath}
        previousBestPercent={previousBestPercent}
        earlierAttempts={earlierAttempts}
        voiceTasks={voiceTasks}
        renderProgress={(progress) => <LessonProgressStrip progress={progress} backLink={backLink} />}
      />
    </div>
  );
}
