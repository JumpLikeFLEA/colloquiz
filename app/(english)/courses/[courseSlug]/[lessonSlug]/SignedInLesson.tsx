"use client";

import dynamic from "next/dynamic";

/**
 * The lesson page for a signed-in learner (PROG-022, docs/decisions/0246 + 0248; first built for
 * TCH-006, docs/decisions/0153, as `LinkedLesson`), behind a client-side `dynamic()` so its code
 * (the strip's notebook button, and the "Ask the teacher" link for a student who has a teacher) is
 * an async chunk that only a signed-in learner downloads. This stub is all page.tsx imports, and
 * all a signed-out visitor pays for. Two cheaper-looking shapes were measured and rejected
 * (docs/decisions/0153, "Budget"): importing SignedInLessonPageClient into page.tsx directly, and
 * importing it through a dynamically imported Server Component. In both, Turbopack placed the code
 * in a chunk shared with the ordinary lesson client, which every visitor then downloaded.
 */
export const SignedInLesson = dynamic(() =>
  import("./SignedInLessonPageClient").then((m) => m.SignedInLessonPageClient),
);
