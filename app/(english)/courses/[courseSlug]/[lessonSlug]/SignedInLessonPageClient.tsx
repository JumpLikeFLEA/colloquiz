"use client";

import { useMemo, useState, type ReactNode } from "react";
import { practiceRenderer } from "@/app/components/lesson-player";
import type { PracticeRendererProps } from "@/app/components/lesson-player/LessonPlayer";
import { AskTeacher } from "@/app/components/lesson-player/AskTeacher";
import type { AskTeacherConfig } from "@/lib/askTeacher/options";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";
import { LessonFrame, type LessonPageProps } from "./LessonFrame";

/**
 * The lesson page for a signed-in learner (PROG-022, docs/decisions/0246 + 0248), reached through
 * the lazy SignedInLesson stub, so a signed-out visitor downloads none of it. Without a teacher to
 * ask it is LessonPageClient plus the strip's notebook button; with one (TCH-006,
 * docs/decisions/0153) it also draws an "Ask the teacher" link on every exercise and voice-task
 * card. The admin preview and the demo keep LessonPageClient's siblings and get neither.
 *
 * Nothing in LessonPlayer changed to make room for the Ask links:
 *  - an exercise's link rides on the `practiceRenderer` function prop, which
 *    already receives the block and `onScore(result, response)`; wrapping it
 *    is how this component learns the latest response per block;
 *  - a voice task's link is drawn by the voice block's own chunk through
 *    `voiceTasks.renderAsk`.
 * The props type and the page frame are shared with LessonPageClient through
 * LessonFrame.tsx (PLAY-020).
 */
export function SignedInLessonPageClient({
  askTeacher,
  ...page
}: LessonPageProps & { askTeacher?: AskTeacherConfig }) {
  if (!askTeacher) return <LessonFrame {...page} practiceRenderer={practiceRenderer} />;
  return <AskLesson {...page} askTeacher={askTeacher} />;
}

/** The page with the "Ask the teacher" links (TCH-006, docs/decisions/0153). */
function AskLesson({
  askTeacher,
  voiceTasks,
  ...page
}: LessonPageProps & { askTeacher: AskTeacherConfig }) {
  const { document } = page;
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

  return <LessonFrame {...page} voiceTasks={voice} practiceRenderer={renderPracticeWithAsk} />;
}
