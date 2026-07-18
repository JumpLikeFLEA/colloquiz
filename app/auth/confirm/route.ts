import { NextResponse, type NextRequest } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Default-template links: Supabase's /auth/v1/verify confirms the email
  // server-side, then redirects here with ?code=. The exchange only succeeds
  // in the browser that initiated signup (PKCE code_verifier); on another
  // device the email is already confirmed, so send the user to sign in.
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
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
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${type === 'recovery' ? 'recovery_expired' : 'confirm_expired'}`
  )
}
