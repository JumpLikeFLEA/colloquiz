"use client";

import dynamic from "next/dynamic";

/**
 * TCH-006 (docs/decisions/0153) — the lesson page for a student who has a
 * teacher to ask, behind a client-side `dynamic()` so its code (the linked
 * client, the "Ask the teacher" link) is an async chunk that only that student
 * downloads. This stub is all page.tsx imports, and all a visitor who is not
 * linked pays for. Two cheaper-looking shapes were measured and rejected
 * (docs/decisions/0153, "Budget"): importing LinkedLessonPageClient into
 * page.tsx directly, and importing it through a dynamically imported Server
 * Component. In both, Turbopack placed the code in a chunk shared with the
 * ordinary lesson client, which every visitor then downloaded.
 */
export const LinkedLesson = dynamic(() =>
  import("./LinkedLessonPageClient").then((m) => m.LinkedLessonPageClient),
);
