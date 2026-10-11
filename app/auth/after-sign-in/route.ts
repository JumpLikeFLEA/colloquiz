import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authUserFrom } from '@/lib/auth'
import { safeNext } from '@/lib/safeNext'
import { postSignInDest, signInDestDependsOnRole } from '@/lib/postSignInDest'
import { isStudioEditor } from '@/lib/studioEditor'

// SHELL-021 (docs/decisions/0109 Decision 4, entry point 3) — the password
// sign-in's landing hop. AuthScreen signs in from the browser, where it has
// no server-side way to ask "is this an editor?", so when its `next` is one
// postSignInDest could change (the root) it navigates here instead, and this
// applies the same rule /auth/callback applies to an OAuth sign-in: one
// server-side check (lib/studioEditor.ts), one pure rule (lib/
// postSignInDest.ts). A deeper `next` never comes through here.
//
// Not in proxy.ts's authRoutes: those bounce a signed-in user away, and a
// signed-in user is exactly who this is for. A signed-out request is
// harmless: no user, no editor check, redirected to `next` as-is.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = safeNext(searchParams.get('next') ?? '/', origin)

  let isEditor = false
  if (signInDestDependsOnRole(next)) {
    const supabase = await createClient()
    const user = await authUserFrom(supabase)
    if (user) isEditor = await isStudioEditor(supabase, user.id)
  }

  return NextResponse.redirect(`${origin}${postSignInDest(next, isEditor)}`, 303)
}
