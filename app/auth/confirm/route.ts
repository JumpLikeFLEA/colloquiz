import { NextResponse, type NextRequest } from 'next/server'
import { type EmailOtpType, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { hashClaimToken } from '@/lib/pendingClaims'
import { safeNext } from '@/lib/safeNext'

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
export function unwrapNext(rawNext: string, rawClaim: string | null): { next: string; claim: string | null } {
  try {
    const parsed = new URL(rawNext)
    const innerNext = parsed.searchParams.get('next')
    return { next: innerNext ?? rawNext, claim: rawClaim ?? parsed.searchParams.get('claim') }
  } catch {
    return { next: rawNext, claim: rawClaim }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const unwrapped = unwrapNext(searchParams.get('next') ?? '/', searchParams.get('claim'))
  // safeNext, not the raw unwrapped value: pre-push review (ANON-004) found
  // next="@evil.com" makes `${origin}${next}` parse as host "evil.com" (the
  // WHATWG URL parser reads it as userinfo before the @) — see lib/safeNext.ts.
  const next = safeNext(unwrapped.next, origin)
  const claim = unwrapped.claim

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
      ? NextResponse.redirect(`${origin}/login?error=recovery_expired`)
      : NextResponse.redirect(`${origin}/login?notice=confirmed_sign_in`)
  }

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      await claimPendingAttempts(supabase, claim)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${type === 'recovery' ? 'recovery_expired' : 'confirm_expired'}`
  )
}
