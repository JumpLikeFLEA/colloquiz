"use client";

import type { ReactNode } from "react";
import { LessonPlayer } from "@/app/components/lesson-player";
import type { PracticeRendererProps } from "@/app/components/lesson-player/LessonPlayer";
import type { NextLessonLink } from "@/lib/publicLesson";
import type { LessonCourseContext } from "@/lib/courseCompletion";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";
import type { EarlierAttempt } from "@/lib/lessonPlayer/answeredBefore";
import { LessonProgressStrip } from "./LessonProgressStrip";

/**
 * PLAY-020 — what page.tsx hands either lesson client. One type, so a prop
 * added here reaches LessonPageClient and LinkedLessonPageClient together.
 * `practiceRenderer` is a function prop and cannot come from the server
 * page.tsx (docs/decisions/0029 Decision 5), so it is not in this type: each
 * client imports it itself.
 */
export type LessonPageProps = {
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
};

/**
 * The frame both lesson clients draw: the grid-paper wrapper (`flex-1` so the
 * paper reaches the footer, 2026-10-24), the server-rendered `header` band,
 * and the player with its sticky progress strip (docs/decisions/0079 D5; the
 * wrapper is the strip's sticky containing block). The two clients differ only
 * in the `practiceRenderer` and `voiceTasks` they pass, which is why this is
 * a frame and not a third copy of the page.
 */
export function LessonFrame({
  header,
  backLink,
  practiceRenderer,
  ...player
}: LessonPageProps & { practiceRenderer: (props: PracticeRendererProps) => ReactNode }) {
  return (
    <div className="grid-paper flex-1 pb-8">
      {header}
      <LessonPlayer
        {...player}
        practiceRenderer={practiceRenderer}
        renderProgress={(progress) => <LessonProgressStrip progress={progress} backLink={backLink} />}
      />
    </div>
  );
}
