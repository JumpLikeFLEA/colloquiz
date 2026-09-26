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
