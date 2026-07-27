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
