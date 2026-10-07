import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/safeNext'
import { extractClientIp } from '@/lib/pendingClaims'
import { recordServerFunnelEvent } from '@/lib/funnelEventServer'
import { isFunnelSource } from '@/lib/funnelSource'
import { recordSignupAcquisition } from '@/lib/signupAcquisitionServer'

// OPS-008 (docs/decisions/0069) — how fresh `created_at` must be to count an
// OAuth sign-in as a new signup rather than an existing user re-authenticating.
// GoTrue gives no separate "was this a new user" flag from exchangeCodeForSession,
// so recency of account creation is the only signal available here.
const NEW_ACCOUNT_WINDOW_MS = 60_000

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // safeNext: same open-redirect shape as /auth/confirm (pre-push review,
  // ANON-004) — see lib/safeNext.ts.
  const next = safeNext(searchParams.get('next') ?? '/', origin)
  const rawSource = searchParams.get('source')
  const source = rawSource && isFunnelSource(rawSource) ? rawSource : null

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const createdAgoMs = Date.now() - new Date(user.created_at).getTime()
        if (createdAgoMs >= 0 && createdAgoMs < NEW_ACCOUNT_WINDOW_MS) {
          void recordServerFunnelEvent('signup', {
            source,
            path: next,
            ip: extractClientIp(request.headers) ?? '127.0.0.1',
          })
          // ANON-009 (docs/decisions/0081) — awaited, never throws.
          await recordSignupAcquisition(supabase, { source, next })
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
