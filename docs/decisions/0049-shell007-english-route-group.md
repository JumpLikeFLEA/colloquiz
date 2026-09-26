# 0049 — SHELL-007: English route group, layout and Russian strings module

## Context

SHELL-007 (issue #92) builds the route group docs/decisions/0044 (SHELL-005)
and docs/decisions/0046 (SHELL-006) decided, for real. Three things came up
during implementation that weren't fully settled by either prior decision and
needed a call to proceed under `--no-approval`; none of them change the shape
of the deliverable (no schema change, no new dependency, no new item type, no
entitlement-rule change), so they're recorded here rather than stopped on.

## Decision 1 — `/courses` dropped from `next.config.ts`'s legacy `movedSegments`

SHELL-001 (0044's precursor work) added a `movedSegments` list to
`next.config.ts`'s `redirects()` that 308s a top-level segment to its
`/app/...` equivalent — enumerated at the time from the real route tree.
`"courses"` was in that list, but `find "app/(colloquiz)/(main)/app" -iname
courses` finds nothing: there is no `/app/courses` route and (as far as the
git history for this file shows) never was one under this scheme — the
redirect target was already dead. Left in place, it would have 308'd every
`/courses/[course-slug]/[lesson-slug]` request (SHELL-005's decided URL
shape, Decision 1) to a 404 under `/app`, since `redirects()` runs before
`proxy.ts` — silently making the entire English course/lesson surface
unreachable in production.

Removed the entry. **Revisit when:** never expected to; if a future card
needs a real `/app/courses` Colloquiz route, it would need its own explicit
redirect entry, not a restored one for a path that was never real.

## Decision 2 — the placeholder route's URL

SHELL-007's own acceptance needs "a route under it renders" to gather the
no-Supabase-session / no-`@supabase/ssr` / cold-load-budget evidence, but the
real course page (SHELL-008) and lesson page (PLAY-006) are separate cards
that haven't landed. Rather than invent a throwaway path, the placeholder was
put at the exact URL shape SHELL-005 decided —
`app/(english)/courses/[courseSlug]/[lessonSlug]/page.tsx` — reading no data
and rendering one string from the new copy module. PLAY-006 replaces this
file's body with the real anon-key read; the file and its route don't move.

`scripts/budget.ts`'s `ROUTES` entry for it (`/courses/x/y`, 210 KB) reuses
docs/decisions/0046's addendum-corrected course-page/landing figure as a
starting budget, since no lesson-specific content exists yet to measure
against; PLAY-006 re-measures for real and raises it with a printed run if
it needs to, per OPS-006's own rule. Measured today: 159.4 KB — see the issue
comment for the full `npm run budget` output.

## Decision 3 — `proxy.ts`'s unauthenticated bounce narrowed to `/app`

Discovered while checking that `app/global-not-found.tsx` (this card's other
acceptance line) is actually reachable by an anonymous visitor, which is the
audience it exists for (docs/handoff.md, "Anonymous play is a launch
requirement"): it wasn't. `proxy.ts`'s `!user && !isAuthRoute` guard 307'd
**any** unmatched path to `/login` before Next's own router ever ran, so an
anonymous request to a mistyped or stale URL never reached
`global-not-found.tsx` at all — it silently got a login page instead of a
404. Verified with a local `next start`, curling an arbitrary unknown path
before and after this fix (307-to-login before, 404-with-Russian-copy
after).

This isn't a scoping bug in this card's own new `/courses` prefix — it's
pre-existing and broader: `curl`ing `/icon` and `/opengraph-image`
unauthenticated 307'd to `/login` too, on the tree exactly as it stood before
this commit. Both are metadata routes with no auth requirement of their own;
this was never exercised because nothing anonymous existed to hit them until
this card.

Root cause: the bounce protected "everything not explicitly listed public",
when SHELL-001 had already namespaced every actual protected Colloquiz route
under `/app`. Fix: the bounce (and the stray-OAuth-code forward ahead of it)
now only fires when the path is `/app` or starts with `/app/`
(`proxy.ts:76`). Verified after the change: `/app` and `/app/settings` still
307 to `/login` unauthenticated; `/login`, `/terms`, `/icon`,
`/opengraph-image` and `/courses/x/y` all render directly; an unknown path
now 404s with `app/global-not-found.tsx`'s Russian copy; a stray
`?code=...` landing on `/` still forwards through `/app` → `/auth/callback`
(traced with `curl -L`, since `/` itself 307s to `/app` first per SHELL-013,
preserving the query string).

**Revisit when:** a protected Colloquiz route is ever added outside `/app`
(none exist today — every real page lives under `/app`, `(auth)`, `(legal)`,
or now `(english)`) — such a route would need its own explicit guard rather
than relying on the old blanket bounce.

### Full-protocol audit (requested before push, since Decision 3 moves an auth boundary)

**1. Every route outside `/app`, enumerated:**

- `app/api/**` — 51 `route.ts` files (listed by `find app/api -name route.ts`).
  Excluded from `proxy.ts`'s matcher entirely (`config.matcher` at
  `proxy.ts:120-124` negative-lookahead-excludes `api`) — before and after
  Decision 3, `/api` was never gated by `proxy.ts` at all. This audit exists
  to confirm that independently, not because Decision 3 could have touched it.
- `app/auth/callback/route.ts`, `app/auth/confirm/route.ts` — in the
  `authRoutes` exact-match list (`proxy.ts:61`), so `isAuthRoute` is `true`
  for both; Decision 3's `isProtectedRoute` guard never applied to them
  either before or after (the guard only ever wraps `!isAuthRoute` branches).
- Metadata: `app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`,
  `app/robots.ts` (`/robots.txt`), `app/favicon.ico` (excluded by the matcher
  by literal name).
- Auth pages: `/login`, `/signup` (in `authRoutes`); `/reset-password`
  (NOT in `authRoutes` — see finding below).
- Legal pages: `/terms`, `/privacy`, `/subprocessors` (in the exact-match
  `publicRoutes` list, `proxy.ts:47`).
- English surface: `app/(english)/courses/[courseSlug]/[lessonSlug]`
  (admitted by the new `/courses` prefix rule).
- `app/global-error.tsx`, `app/global-not-found.tsx` — not routes; rendering
  fallbacks Next invokes directly, never reached through `proxy.ts` routing.

**2. Every `/api` handler's own auth check**, by file:line (grep-verified,
not asserted):

- 41 files call `authUserFrom` directly and return `{error: "Unauthorized"}, 401`
  on a null user, inline in the handler (e.g. `app/api/account/delete/route.ts:16-18`,
  `app/api/results/route.ts:15-16, 29-30`, `app/api/quiz/session/route.ts:15-16,
  32-33, 58-59, 82` — the full per-file list is in this card's evidence comment
  on issue #92).
- The remaining files route through one of three shared guards, each of which
  itself calls `authUserFrom` and returns the same `{error}, 401` shape before
  doing anything else:
  - `requireAuthor` (`lib/authorQuiz.ts:53-65`) — `app/api/assignments/route.ts`,
    `app/api/author/quiz/route.ts`, `app/api/author/quiz/[id]/route.ts`,
    `app/api/author/questions/[id]/submit-to-pool/route.ts`,
    `app/api/invites/route.ts`. Adds an `is_author`/`role === 'admin'` check
    (403 if neither) after the 401 check.
  - `requireGroupMember` / `requireGroupOwner` (`lib/groups.ts:15-45`) — every
    `app/api/groups/[gid]/**` route. Adds a `group_members` row lookup after
    the 401 check; a non-member gets 404 (deliberately, not 403 — "whether a
    given group id exists is not information a stranger needs",
    `lib/groups.ts:29-31`), and `requireGroupOwner` additionally 403s a
    member who isn't the group's owner.
- **Service-role client (`lib/supabase/admin.ts`) usage**: exactly one file,
  `app/api/account/delete/route.ts`. `authUserFrom` (line 16) runs and returns
  401 on failure BEFORE `createAdminClient()` is ever called (line 47); every
  admin-client call after that (`admin.storage.from("avatars")...`,
  `admin.auth.admin.updateUserById`) is scoped to `user.id` from that
  authenticated caller, not to caller-supplied input. No route was found
  using the admin client without a preceding identity check.

**3. Unauthenticated curl sweep** (`next start` on a clean build matching
this commit, zero cookies, each route's real HTTP method) — full script and
raw output kept for this audit, not committed:

- All 63 `/api` method+path combinations enumerated from every `route.ts`
  export → **401** (`{"error":"Unauthorized"}` or the route's equivalent),
  with no 200, no 403-before-401, and no 500.
- `/auth/callback`, `/auth/confirm` (no `code` param) → 307 to
  `/login?error=oauth` / `/login?error=confirm_expired` — no data.
- `/icon`, `/apple-icon`, `/opengraph-image`, `/robots.txt`, `/login`,
  `/signup`, `/terms`, `/privacy`, `/subprocessors`, `/courses/x/y` → 200,
  all intentionally public.
- `/courses/x`, bare `/courses`, `/courses/x/y/z` → 404 (no route matches
  those shapes; SHELL-008 owns the course-only page).
- An arbitrary unmatched path → 404, rendering `global-not-found.tsx`.

**Finding: `/reset-password` is reachable anonymously post-fix, where it
previously wasn't** — it's not in `authRoutes` and isn't under `/app`, so
before Decision 3 an anonymous request (no session cookie) was 307'd to
`/login`; after, it falls through and renders the form directly (curl:
200, body contains the "Update password" form). **Not a security finding**:
`ResetPasswordScreen.tsx` performs no server-side read or write of its own —
its only action is a client-side `supabase.auth.updateUser({ password })`
call (`ResetPasswordScreen.tsx:30`), which requires a live Supabase session
token to succeed at all. An anonymous visitor with no recovery session sees
the form and gets a Supabase auth error on submit; no data is read, shown,
or written. This is a UX regression (an anonymous visitor now sees a form
that will fail, instead of being bounced to `/login`), not an auth-boundary
break — recorded rather than fixed inline here, since fixing display
behavior for a client-only page is outside this card's scope. **Proposed
follow-up (not filed as an issue yet):** `ResetPasswordScreen` checks for a
live session on mount and shows an explicit "this link has expired" state
instead of a form that will error, for the case of an anonymous visitor or a
stale recovery link.

## Note — `<SpeedInsights/>` was missed on the first pass

The layout was first written without `<SpeedInsights/>`, against
docs/decisions/0046's explicit "What the English root carries" list. Caught
before ticking any acceptance box, added to `app/(english)/layout.tsx`, and
re-verified: `npm run check`, `npm test`, and `npm run budget` all re-run
clean afterward, and the measured figure is unchanged (159.4 KB) — consistent
with 0046's own finding that `<SpeedInsights/>`'s script tag 404s under local
`next start` and contributes no measurable bytes there.

## What this card does not decide

Fixing `/icon`/`/opengraph-image` was a side effect of Decision 3's fix, not
separately scoped work — no new card proposed for it, since nothing about it
needed anything beyond what Decision 3 already changed.
