# 0051 — OPS-013: guarding against cross-route commons-chunk leaks

## Context

OPS-012 (issue #118) found, while re-measuring the SHELL-006 English stub,
that `lucide-react`'s shared `Icon` base component (~5.17 KB compressed, no
actual icon SVGs) shipped on the stub route even though neither the stub page
nor its layout imported anything from `lucide-react` — Turbopack's own
commons-chunk splitting sharing a popular-enough piece of a dependency across
the whole build, not an explicit import `eslint.config.mjs`'s
`no-restricted-imports` rule could catch (that rule only sees an import
statement inside `app/(english)/**` or `app/components/lesson-player/**`, not
a chunk the bundler assembled independently of what a route's own code asks
for). This card was ranked after SHELL-007 because the real chunk graph
changes once the English route group exists for real instead of being
measured against a one-page stub.

## Decision 1 — is the lucide-react leak still real after SHELL-007?

Checked first, per this card's own acceptance line: does anything a real
English route renders already import `lucide-react`, which would make the
base `Icon` component's presence expected rather than a leak?

`app/components/lesson-player/**` does import `lucide-react` (8 files:
`CalloutBlock.tsx`, `MatchingRenderer.tsx`, `SlotsRenderer.tsx`,
`OrderingRenderer.tsx`, `SelectionGridRenderer.tsx`, `SelectionRenderer.tsx`,
`LessonPlayerError.tsx`, `VideoBlock.tsx`) — but the only route that exists
under `app/(english)/**` today, `courses/[courseSlug]/[lessonSlug]/page.tsx`,
is still SHELL-007's placeholder: it imports only `alliengllCopy` and renders
none of the lesson player. **The leak is still real, not expected weight** —
confirmed by content, not inferred: `npm run budget` on the current build
reports `/courses/x/y` at 159.4–162.0 KB with no forbidden-signature hit
(lucide-react not being in that list — see Decision 2), leaving the leak
un-flagged by design until PLAY-006 wires the real lesson player in, at which
point `lucide-react` becomes an expected, not leaked, dependency and this
question should be re-asked.

## Decision 2 — guard design

Extended `scripts/budget.ts` (OPS-006) rather than writing a separate script,
since it already drives a cold `next start` load through CDP per configured
route and is the natural place to inspect what a route actually downloaded.

- **Signature list mirrors `eslint.config.mjs`'s `no-restricted-imports`
  exactly**: `recharts`, `katex`, `framer-motion`, `@supabase/ssr`.
  `lucide-react` is deliberately NOT added — it isn't forbidden (Colloquiz
  and the eventual lesson player both need it), only leaking into a route
  that doesn't yet use it, which Decision 1 already covers by inspection
  rather than by a permanent guard rule.
- **Detection is content-based**: each downloaded script chunk's response
  body (fetched via `Network.getResponseBody` while the CDP session still has
  it buffered, not a re-fetch over the network) is grepped case-insensitively
  for each signature string. This is the same method decision 0046's
  addendum used to isolate Sentry's chunk
  (`grep -l -i sentry .next/static/chunks/*.js`) — confirmed by content, not
  inferred from a KB delta, which is why this catches a leak the KB-only
  budget check cannot: a route can gain a few KB from ordinary dependency
  drift for reasons that have nothing to do with a forbidden package.
- **Scoped per route, not applied blindly to every configured route.** The
  first version of this guard flagged `/login` for containing
  `@supabase/ssr` — correctly finding the string, but a false positive as a
  "leak": `/login` is a Colloquiz route and is *supposed* to ship
  `@supabase/ssr`. Added `guardForbiddenSignatures: boolean` to
  `RouteBudget`, `true` only for English-surface routes, mirroring the
  ESLint rule's own file-scope restriction rather than a path-string
  heuristic. `/login` no longer runs the signature scan at all (its body
  fetches are skipped, not merely its results ignored, so the false-positive
  route also costs nothing extra to measure).

**Demonstrated both ways** (both runs' full output kept in issue #120's
evidence comment): a temporary `import { LineChart } from "recharts"` added
to the `/courses/x/y` placeholder page produced
`⚠ FORBIDDEN-PACKAGE SIGNATURE FOUND: ... contains "recharts"` and an
over-budget KB figure (233.4 KB vs 210 KB); reverting it and rebuilding from
clean (`rm -rf .next`) passed at 162.0 KB with no signature hit.

## Decision 3 — re-measurement after SHELL-007

`/courses/x/y` now measures 159.4–162.0 KB across repeated clean-build runs,
against the 210 KB budget carried over from decision 0046's addendum
(159.6 KB floor + 47 KB headroom = 210 KB, "not a promise" starting point for
whichever card built the real route). SHELL-007 landing did not move this
route's floor in any direction worth chasing — the ~2.6 KB spread between
runs is ordinary build-to-build noise, not drift, and nowhere near the 23.7 KB
of unrelated-commit drift decision 0046's addendum already documented as the
reference precedent for what real drift looks like. No budget number needs
correcting here.

## What would make us revisit it

- When PLAY-006 wires the real lesson player into `app/(english)/**`,
  `lucide-react` becomes an expected dependency of that route — re-check
  whether its shared `Icon` base chunk is still isolable from the rest of
  lucide-react's surface, and decide then whether it's worth adding to
  `FORBIDDEN_SIGNATURES` (it would only ever fire on other, non-lucide
  Colloquiz-only chunk content, which is not what this leak is).
- If a future English route legitimately needs one of the four forbidden
  packages (unlikely per docs/handoff.md's performance boundary, but not
  impossible), `guardForbiddenSignatures` is the flag to flip to `false` for
  that specific route entry — same pattern as `/login` — rather than
  loosening the signature list itself.
- If Turbopack's chunk-splitting strategy changes in a future Next upgrade,
  re-run the guard against a clean build before trusting its pass/fail —
  content-based detection is only as good as what actually lands in
  `.next/static/chunks`.
