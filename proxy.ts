import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authUserFrom } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // Resolve the caller and refresh the session — must happen before any response
  // is returned. authUserFrom verifies the JWT locally, but it still calls
  // getSession() underneath, so a near-expiry token is refreshed and the new
  // cookies are written through setAll above exactly as before.
  const user = await authUserFrom(supabase)

  const { pathname } = request.nextUrl

  const authRoutes = ['/login', '/signup', '/auth/callback', '/auth/confirm']
  const isAuthRoute = authRoutes.includes(pathname)

  if (!user && !isAuthRoute && request.nextUrl.searchParams.has('code')) {
    // A Supabase OAuth/PKCE code landed on a non-callback path (e.g. Supabase
    // fell back to the Site URL root because redirectTo wasn't allow-listed).
    // Forward it to the callback handler — keeping the query intact so
    // code/state/next survive — so the code is exchanged instead of lost to
    // the /login bounce below.
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve where the user was headed (e.g. an invite link) so they land
    // there after signing in. Only relative, single-slash paths are kept.
    url.search = ''
    const dest = request.nextUrl.pathname + request.nextUrl.search
    if (dest !== '/' && dest.startsWith('/') && !dest.startsWith('//')) {
      url.searchParams.set('next', dest)
    }
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    const next = request.nextUrl.searchParams.get('next')
    url.pathname = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Legacy paths merged into the Progress route. Canonicalize them HERE rather
  // than with a redirecting page under (main): a redirect() from a Server
  // Component cannot stream, so it pays the full authenticated shell render + its
  // DB round trips before it can emit the 307 (measured ~415ms in prod vs ~210ms
  // for real streamed pages). Doing it in the proxy returns an instant redirect
  // with no rendering and no queries. Placed after the unauth->login bounce, so a
  // stale bookmark hit while signed out still lands on /login with `next`
  // preserved before it is canonicalized.
  const legacyRedirects: Record<string, string> = {
    '/dashboard': '/progress?tab=stats',
    '/achievements': '/progress?tab=achievements',
  }
  const legacyTarget = legacyRedirects[pathname]
  if (user && legacyTarget) {
    const url = request.nextUrl.clone()
    const [targetPath, targetQuery] = legacyTarget.split('?')
    url.pathname = targetPath
    url.search = targetQuery ? `?${targetQuery}` : ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// /api is excluded deliberately. Route handlers authenticate themselves and
// return 401 JSON; running the proxy in front of them added a second auth pass
// per request AND meant an unauthenticated fetch() got a 307 to /login and an
// HTML login page instead of that 401. Handlers can write cookies, so session
// refresh still happens there.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
