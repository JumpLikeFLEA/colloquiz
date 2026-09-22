"use client";

import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * A Server Component (page.tsx) cannot pass a function prop across the RSC
 * boundary to a Client Component — `practiceRenderer` is a function, so it
 * has to be wired up on this side of the boundary instead. `document` is
 * plain JSON, safe to pass down from the server.
 */
export function LessonPlayerDemoClient({ document }: { document: unknown }) {
  return <LessonPlayer document={document} practiceRenderer={practiceRenderer} />;
}
