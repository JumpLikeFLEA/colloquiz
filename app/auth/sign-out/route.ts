import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/safeNext'

/**
 * SHELL-019 (docs/decisions/0086) — sign-out for the English surface. The
 * account menu posts a plain HTML form here (`next` = the page it sits on),
 * so signing out needs no client JS and no @supabase/ssr browser client on
 * an English route (docs/handoff.md, "Performance boundary").
 *
 * POST only: a GET that ends a session can be triggered by a prefetch or an
 * <img>. Next answers any other method with 405 by itself. A cross-site
 * form POST here carries no session to end: @supabase/ssr writes its auth
 * cookies SameSite=Lax (node_modules/@supabase/ssr/dist/main/utils/
 * constants.js, DEFAULT_COOKIE_OPTIONS), and Lax cookies are not sent on a
 * cross-site POST.
 *
 * The 303 makes the browser GET `next` as a full page load, so the page
 * re-renders signed out from scratch. On a lesson page that also means a
 * fresh `attemptId` with a fresh player, rather than the new id arriving as
 * a prop into a player that still holds the old answers (0086 Decision 3).
 *
 * `signOut()` with its default scope, the same call AppSidebar's sign-out
 * makes, so "Sign out" means the same thing on both surfaces. If Supabase
 * rejects it, the learner is still sent back; the page then shows them
 * signed in, which is the truthful result.
 */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url)
  let next = '/'
  try {
    const raw = (await request.formData()).get('next')
    if (typeof raw === 'string') next = safeNext(raw, origin)
  } catch {
    // Not a form body: fall back to "/".
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) console.error('sign-out failed', error.message)

  return NextResponse.redirect(`${origin}${next}`, 303)
}
