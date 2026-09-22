"use client";

import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * A Server Component (page.tsx) cannot pass a function prop across the RSC
 * boundary to a Client Component — `practiceRenderer` is a function, so it
 * has to be wired up on this side of the boundary instead. `document` and
 * `attemptId` are both plain JSON, safe to pass down from the server —
 * `attemptId` is generated per request on the server side (page.tsx) and
 * simply forwarded here; see docs/decisions/0029 Decision 1.
 */
export function LessonPlayerDemoClient({ document, attemptId }: { document: unknown; attemptId: string }) {
  return <LessonPlayer document={document} attemptId={attemptId} practiceRenderer={practiceRenderer} />;
}
