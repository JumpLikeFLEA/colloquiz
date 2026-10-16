import { cache } from "react";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStudioEditor } from "@/lib/studioEditor";
import { getUnreadMessageCount } from "@/lib/messages/messagesServer";

/**
 * SHELL-019 (docs/decisions/0086) — who, if anyone, is signed in, for the
 * English surface's account chip. Server-only: it reads the session cookies
 * through lib/supabase/server.ts, so nothing about it reaches the client
 * bundle, and an anonymous visitor pays no network call: with no session
 * cookie, getClaims() returns as soon as getSession() finds nothing, before
 * any JWKS fetch or getUser() (read in node_modules/@supabase/auth-js/dist/
 * main/GoTrueClient.js, `getClaims`).
 *
 * `authUserFrom` verifies the JWT locally (lib/auth.ts), the same
 * resolution the course page (lib/courseAttempts.ts) and the lesson page
 * (lib/publicLesson.ts) already do for their own reads. `cache()` makes a
 * second call in the same request free; it does not dedupe against those
 * two, which build their own clients.
 *
 * `email` is in the JWT, so it costs no profiles read. `isEditor` (SHELL-021,
 * docs/decisions/0109 Decision 4) drives the menu's "Studio" link: two
 * parallel reads (lib/studioEditor.ts), made only once a user is known, so
 * an anonymous visitor still pays nothing.
 *
 * `unreadMessages` (TCH-004, docs/decisions/0151) is the account chip's dot:
 * unread teacher replies, read in parallel with the editor check and
 * fail-soft (getUnreadMessageCount), so a signed-in learner pays one more
 * indexed read and the chrome can't break a page. /my/messages/[teacherId]
 * marks a thread read BEFORE it first calls this, because cache() would
 * otherwise keep the pre-read count for the rest of the request.
 */
export const getSignedInAccount = cache(
  async (): Promise<{ email: string | null; isEditor: boolean; unreadMessages: number } | null> => {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return null;
    const [isEditor, unreadMessages] = await Promise.all([
      isStudioEditor(supabase, user.id),
      getUnreadMessageCount(supabase),
    ]);
    return { email: user.email, isEditor, unreadMessages };
  },
);
