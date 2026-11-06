"use client";

import { practiceRenderer } from "@/app/components/lesson-player";
import { LessonFrame, type LessonPageProps } from "./LessonFrame";

/**
 * PLAY-006's client half of the RSC boundary. `practiceRenderer` is a
 * function prop — it has to be imported here, not passed down from the
 * server page.tsx, per docs/decisions/0029 Decision 5 — same shape as
 * PreviewClient.tsx and LessonPlayerDemoClient.tsx. Everything else is plain
 * JSON or server-rendered nodes, forwarded unchanged to `LessonFrame`, which
 * owns the props' documentation (PLAY-020) and the page frame: the grid
 * paper, the band `header` and the sticky progress strip (docs/decisions/0079
 * D5). Invalid-document handling (an author error, not a crash) lives inside
 * LessonPlayer itself.
 */
export function LessonPageClient(props: LessonPageProps) {
  return <LessonFrame {...props} practiceRenderer={practiceRenderer} />;
}
