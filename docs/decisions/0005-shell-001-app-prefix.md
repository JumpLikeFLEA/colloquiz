# 0005 — Colloquiz moved under /app; root-redirect and legacy-helper decisions

## Context

SHELL-001 required Colloquiz to move wholesale under a single path prefix so
the planned English surface (M2) can own `/` and the other clean top-level
URLs. The issue flagged one open choice that had to be confirmed before any
file moved — the segment name — and left several smaller, unflagged choices
to whoever implemented it: what `/` itself should do in the interim (English
landing is M2, not yet built), how far the internal-link sweep should reach
beyond simple `href=`/`router.push` calls, and what to do with two dev-only
tools (`scripts/bench.ts`, `lib/perfReport.ts`) that independently hardcode
route paths for production perf measurement.

## Options considered (segment name)

- `/app` (the issue's on-record recommendation) — no collision with the
  existing `/quiz/[id]`; reads naturally as "the app" next to the English
  marketing surface.
- `/play` — also collision-free, but narrower than what the segment actually
  covers (settings, admin, groups — not just play).
- `/learn` — risks reading as the English *lessons* surface, which is the
  opposite of what it would host.

## Decision (segment name)

`/app`, confirmed with the user via AskUserQuestion before any file moved —
per the issue's explicit "Do not proceed on the recommendation alone," this
one choice was treated as a hard stop even though the card was worked under
`--no-approval`.

## Decision (root path)

`/` now issues the same 308 → `/app` as every other moved route, rather than
being special-cased. The English landing doesn't exist yet (M2), so there is
nothing else for `/` to serve; a visitor or bookmark hitting `/` today gets
exactly the redirect-then-render behaviour they'd have hit hitting any other
moved path. When M2 lands, this one redirect entry in `next.config.ts` is
what gets replaced with the real English landing page.

Internal navigation that used to target `/` directly (sidebar "Quick Play",
post-login/post-password-reset landing, quiz-session "back to menu", several
"Go home"/"Browse subjects" empty-state links) was repointed straight at
`/app` rather than left pointing at `/` — this avoids adding a redirect hop
to interactions that previously went straight to the page, and keeps the
`href="/"` grep the acceptance line calls for meaningful (a real external
link there would now be a bug).

## Decision (sweep scope)

The acceptance line calls out `href=` and `router.push("/` specifically, but
the actual sweep also had to cover: `router.replace`, `redirect()`,
`permanentRedirect` (none found), `window.open`, ternary/array-literal href
expressions, absolute share/invite URLs built with `window.location.origin`,
and — found only by reading each component, not by grep — three route-name
*comparisons* that don't look like navigation at all:

- `app/components/DuelRealtime.tsx`: a guard against refreshing the page
  while the user is mid-quiz, keyed on `pathname.startsWith("/quiz/")`.
- `app/components/ActiveQuizBanner.tsx`: the same "am I on a quiz screen"
  guard, keyed the same way.
- `app/components/AppSidebar.tsx`: the sidebar's active-nav-item detection.
  Before this move, "/" was special-cased for exact match because every
  other route is a prefix match and "/" is a prefix of everything. After the
  move, `/app` has exactly the same problem — it's now the ancestor of every
  other nav href — so it needed the same special case, not just a search-
  and-replace of the string.
- `app/components/Topbar.tsx`: the breadcrumb's route-label lookup takes its
  key from `pathname.split("/")[0]`, which is now always `"app"` instead of
  the actual route segment; left unfixed, every Colloquiz page would have
  shown "Colloquiz" as its breadcrumb label and the "top-level pages get no
  breadcrumb" depth check would have fired on every nested route instead of
  none.

None of these four would show up in a grep for quoted path strings — they're
why the sweep was done by reading each file that imports `usePathname` or
`router`, not by pattern-matching alone.

## Decision (bench.ts / perfReport.ts)

`scripts/bench.ts`'s `DEFAULT_ROUTES` and `lib/perfReport.ts`'s
`ROUTE_BACKING_RPCS` both hardcode the pre-move paths. Left alone, the
bench script would still run (it isn't guarded by anything this card
touches) but would either measure the 308 redirect instead of the real page,
or silently lose the "backing RPCs" annotation on every flagged route,
depending on how the harness follows redirects — a quiet, hard-to-notice
regression in a tool whose whole job is trustworthy numbers. Both were
re-keyed onto the `/app`-prefixed paths, and the one test
(`lib/perfReport.test.ts`) that asserted against the `"/"` key was updated
to `"/app"` so the assertion still exercises the real mapping instead of a
route that no longer means anything.

## What would make us revisit this

- M2 landing the English surface at `/` — replaces the `/` → `/app` redirect
  entry in `next.config.ts` with the real page; no other part of this
  decision changes.
- A second dev-only tool found hardcoding a pre-move path after this card
  closed — same fix as bench.ts/perfReport.ts.
