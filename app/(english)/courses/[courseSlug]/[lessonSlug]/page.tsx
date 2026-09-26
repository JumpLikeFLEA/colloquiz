import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * Placeholder at the URL shape SHELL-005 decided
 * (docs/decisions/0044 Decision 1: /courses/[course-slug]/[lesson-slug]).
 * This card (SHELL-007) only needs a real, reachable route to prove the
 * route group, layout and proxy.ts prefix rule — PLAY-006 ("Public lesson
 * page") replaces this body with the actual anon-key, no-session read of the
 * published lesson via can_read_lesson (migration 041). Deliberately reads
 * no data and imports no Supabase client, so it also serves as this card's
 * "no session, no @supabase/ssr in its client chunks" evidence.
 */
export default function LessonPlaceholderPage() {
  return (
    <main className="min-h-svh flex items-center justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">{alliengllCopy.comingSoon.lesson}</p>
    </main>
  );
}
