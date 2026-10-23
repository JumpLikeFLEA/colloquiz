"use client";

import { useMemo, useState, type ReactNode } from "react";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import type { PracticeRendererProps } from "@/app/components/lesson-player/LessonPlayer";
import { AskTeacher } from "@/app/components/lesson-player/AskTeacher";
import type { AskTeacherConfig } from "@/lib/askTeacher/options";
import type { NextLessonLink } from "@/lib/publicLesson";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";
import { LessonProgressStrip } from "./LessonProgressStrip";

/**
 * TCH-006 (docs/decisions/0153) — LessonPageClient for a signed-in student who
 * has a teacher to ask: the same page, plus an "Ask the teacher" link on every
 * exercise and voice-task card. page.tsx renders THIS component only when
 * ask_teacher_options (081) found a teacher; everyone else, the admin preview
 * and the demo keep LessonPageClient, which is untouched, so a visitor who is
 * not linked downloads none of this (docs/decisions/0153, "Budget": the only
 * cost to them is the +0.2 KB loader stub in LinkedLesson.tsx). That is why
 * this is a sibling of LessonPageClient and not a prop on it or on
 * LessonPlayer.
 *
 * Nothing in LessonPlayer changed to make room for it:
 *  - an exercise's link rides on the `practiceRenderer` function prop, which
 *    already receives the block and `onScore(result, response)`; wrapping it
 *    is how this component learns the latest response per block;
 *  - a voice task's link is drawn by the voice block's own chunk through
 *    `voiceTasks.renderAsk`.
 * Keep the rest of this file in step with LessonPageClient.
 */
export function LinkedLessonPageClient({
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
  voiceTasks,
  lessonTitle,
  askTeacher,
}: {
  header: ReactNode;
  backLink: ReactNode;
  document: unknown[];
  lessonTitle: string;
  attemptId: string;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
  lessonVersionId: string;
  isSignedIn: boolean;
  lessonPath: string;
  previousBestPercent: number | null;
  voiceTasks?: VoiceTasksContext;
  askTeacher: AskTeacherConfig;
}) {
  // The latest checked response per block. State, because the link's dialog
  // reads it when it opens (a new answer must reach the link).
  const [responses, setResponses] = useState<Record<string, unknown>>({});

  // Called by LessonPlayer as a plain function, not mounted as a component, so
  // its identity changing with `responses` remounts nothing.
  function renderPracticeWithAsk(props: PracticeRendererProps): ReactNode {
    const blockId = props.block.id;
    return (
      <>
        {practiceRenderer({
          ...props,
          onScore: (result, response) => {
            setResponses((prev) => ({ ...prev, [blockId]: response }));
            props.onScore(result, response);
          },
        })}
        <AskTeacher config={askTeacher} document={document} blockId={blockId} response={responses[blockId]} />
      </>
    );
  }

  const voice = useMemo<VoiceTasksContext | undefined>(
    () =>
      voiceTasks && {
        ...voiceTasks,
        renderAsk: (blockId: string) => <AskTeacher config={askTeacher} document={document} blockId={blockId} />,
      },
    [voiceTasks, askTeacher, document],
  );

  return (
    <div className="grid-paper flex-1 pb-8">
      {header}
      <LessonPlayer
        document={document}
        lessonTitle={lessonTitle}
        attemptId={attemptId}
        practiceRenderer={renderPracticeWithAsk}
        courseSlug={courseSlug}
        nextLesson={nextLesson}
        lessonVersionId={lessonVersionId}
        isSignedIn={isSignedIn}
        lessonPath={lessonPath}
        previousBestPercent={previousBestPercent}
        voiceTasks={voice}
        renderProgress={(progress) => <LessonProgressStrip progress={progress} backLink={backLink} />}
      />
    </div>
  );
}
