import { NextResponse, type NextRequest } from 'next/server'
import { type EmailOtpType, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractClientIp, hashClaimToken } from '@/lib/pendingClaims'
import { safeNext } from '@/lib/safeNext'
import { recordServerFunnelEvent } from '@/lib/funnelEventServer'
import { isFunnelSource } from '@/lib/funnelSource'
import { recordSignupAcquisition } from '@/lib/signupAcquisitionServer'

/**
 * ANON-004 — after a successful verification establishes a session, claim
 * any `pending_claims` row this signup stashed (ANON-006) before redirecting.
 * Best-effort: a claim failure (expired/already-claimed/not-found) is logged
 * and does NOT block the redirect — the account is still confirmed and
 * signed in either way, only the attempt migration is lost. See
 * docs/decisions/0068 Decision 4.
 */
async function claimPendingAttempts(supabase: SupabaseClient, claim: string | null): Promise<void> {
  if (!claim) return
  const { error } = await supabase.rpc('claim_pending_claim', { p_token_hash: hashClaimToken(claim) })
  if (error) {
    console.error('claim_pending_claim failed', error)
  }
}

/**
 * ANON-004 — GoTrue's own mail templates always render `{{ .RedirectTo }}`
 * as the ENTIRE `emailRedirectTo` string we passed to `signUp`/etc, verbatim
 * and correctly percent-encoded — never just its path. For the default
 * GoTrue-hosted `/verify` -> redirect flow (recovery, and any other flow
 * without a customized template) that string IS already a bare path like
 * "/reset-password", because that's literally what was passed as
 * `emailRedirectTo`'s value there. But this project's own "confirmation"
 * template (supabase/templates/confirmation.html) points directly at THIS
 * route with `next={{ .RedirectTo }}`, and `RegistrationOffer`'s
 * `emailRedirectTo` for that flow is itself a full `/auth/confirm?next=...
 * &claim=...` URL — so `next` here arrives as that WHOLE absolute URL, one
 * level of encoding deeper than the bare-path case. Confirmed empirically
 * against a local Supabase stack (Mailpit) rather than assumed — see
 * docs/decisions/0068's "what would make us revisit this". `new URL()`
 * throws on a bare path (not absolute), which is exactly the signal used to
 * tell the two shapes apart without a flag.
 */
export function unwrapNext(
  rawNext: string,
  rawClaim: string | null,
  rawSource: string | null = null,
): { next: string; claim: string | null; source: string | null } {
  try {
    const parsed = new URL(rawNext)
    const innerNext = parsed.searchParams.get('next')
    return {
      next: innerNext ?? rawNext,
      claim: rawClaim ?? parsed.searchParams.get('claim'),
      source: rawSource ?? parsed.searchParams.get('source'),
    }
  } catch {
    return { next: rawNext, claim: rawClaim, source: rawSource }
  }
}

/**
 * ANON-016 — a failed verification still lands on /login, and /login sends a
 * successful sign-in to its own `next`. Dropping `next` here is what turned a
 * cross-browser confirmation into "log in, then land on /". `next` is the
 * already-`safeNext`ed value; the root path is omitted (it is /login's own
 * default) and so is /reset-password, which would send a learner who forgot
 * their password to a page that needs the session they don't have.
 */
export function loginRedirect(origin: string, param: 'error' | 'notice', value: string, next: string): string {
  const params = new URLSearchParams({ [param]: value })
  if (next !== '/' && next !== '/reset-password') params.set('next', next)
  return `${origin}/login?${params.toString()}`
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const unwrapped = unwrapNext(searchParams.get('next') ?? '/', searchParams.get('claim'), searchParams.get('source'))
  // safeNext, not the raw unwrapped value: pre-push review (ANON-004) found
  // next="@evil.com" makes `${origin}${next}` parse as host "evil.com" (the
  // WHATWG URL parser reads it as userinfo before the @) — see lib/safeNext.ts.
  const next = safeNext(unwrapped.next, origin)
  const claim = unwrapped.claim
  const source = unwrapped.source && isFunnelSource(unwrapped.source) ? unwrapped.source : null

  // Default-template links: Supabase's /auth/v1/verify confirms the email
  // server-side, then redirects here with ?code=. The exchange only succeeds
  // in the browser that initiated signup (PKCE code_verifier); on another
  // device the email is already confirmed, so send the user to sign in.
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await claimPendingAttempts(supabase, claim)
      return NextResponse.redirect(`${origin}${next}`)
    }
    // For a recovery link (signalled by its destination) "sign in with your
    // password" would be wrong advice — the user forgot it.
    return next === '/reset-password'
      ? NextResponse.redirect(loginRedirect(origin, 'error', 'recovery_expired', next))
      : NextResponse.redirect(loginRedirect(origin, 'notice', 'confirmed_sign_in', next))
  }

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      await claimPendingAttempts(supabase, claim)
      // OPS-008 (docs/decisions/0069) — this branch is only ever reached via
      // this project's own custom confirmation.html template (type=email),
      // which is issued exclusively for new-account signup confirmation, so
      // every success here is a genuine signup, not a login. The default-
      // template `code` branch above is a different flow (recovery, or an
      // existing user confirming on a second device) and does NOT fire this.
      void recordServerFunnelEvent('signup', {
        source,
        path: next,
        ip: extractClientIp(request.headers) ?? '127.0.0.1',
      })
      // ANON-009 (docs/decisions/0081) — same genuine-signup moment, tied to
      // the account this time. Awaited (0081 Decision 4), never throws.
      await recordSignupAcquisition(supabase, { source, next })
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    loginRedirect(origin, 'error', type === 'recovery' ? 'recovery_expired' : 'confirm_expired', next)
  )
}
