# 0046 — SHELL-006: the English surface gets its own root layout

## Context

SHELL-006 (issue #89, `type:decision`) had to settle whether the English
surface shares `app/layout.tsx` with Colloquiz or gets its own root layout,
before SHELL-007 builds the real route group on top of whichever answer wins.
Next.js route groups can each define a root layout with its own `<html>`
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:112-146`,
confirmed against the installed docs, not memory), and a top-level
`app/layout.js` is optional once multiple root layouts exist (same file,
line 142: "Omitting `app/layout.js` so layouts in subdirectories... each
become root layouts for their respective directories"). This card is
decision-only per the working agreement; the actual restructuring ships in
the cards proposed below.

## Decision — own root layout

The English surface gets its own root layout. `docs/handoff.md`'s
Performance boundary is a hard requirement ("a visitor arriving on the
English surface must not download Colloquiz"), and a shared root layout
cannot honor it: `app/layout.tsx` today unconditionally renders
`ThemeProvider`, `Geist_Mono`, `<Analytics/>`, `<SpeedInsights/>` and imports
`katex/dist/katex.min.css` (`app/layout.tsx:1-8, 91-97`) for every route under
it, English included.

**Measured evidence** (`npm run budget`, stub route added and removed for
this card only — see "Method" below):

| route | root layout | script KB |
|---|---|---|
| `/login` | shared `app/layout.tsx` | 371.9 KB |
| `/stub` (own root: `<html lang="ru">`, Geist Sans only, no ThemeProvider/Analytics/SpeedInsights/katex CSS) | own | 253.0 KB |

118.9 KB of the shared root's script weight comes from pieces the English
surface doesn't need (next-themes' `ThemeProvider`, `Geist_Mono`,
`<Analytics/>`, `<SpeedInsights/>`; katex CSS is a stylesheet, not counted in
this script-only measurement, but it's dead weight on English routes either
way — see "katex CSS" below).

**`<SpeedInsights/>`'s bytes could not actually be measured, checked not
assumed.** The stub was re-run with `<SpeedInsights/>` added
(`@vercel/speed-insights/next`) and produced the *identical* 253.0 KB —
tracing why (`node_modules/@vercel/speed-insights/dist/next/index.mjs:73-152`)
shows it injects a `<script src="/_vercel/speed-insights/script.js">` tag
client-side, a path served by Vercel's platform at deploy time, not by `next
start`; the request 404s locally and no script bytes ever transfer. This is
not a gap specific to this card's stub — the exact same is true of the
already-accepted `/login` baseline (OPS-006), which also renders
`<SpeedInsights/>` under the shared root and shows no sign of its cost either.
So "include its bytes in the budget" can only be honored against a deployed
URL (`npm run budget --url=<production>`, OPS-010's launch rehearsal), not
against local `next start` — recorded here rather than fabricating a number.
253.0 KB is therefore a floor measured against what local `npm run budget`
can see at all, not specifically "everything except SpeedInsights".

**Per-route-kind budgets, as measured stub + stated headroom** (per this
card's acceptance; SHELL-007/PLAY-006/SHELL-008 re-measure each for real once
built, since course/lesson data and images will change the actual figure):

| route kind | basis | budget |
|---|---|---|
| landing (SHELL-010) | stub floor (253.0 KB) + a catalogue's worth of interactive cards | 300 KB |
| course page (SHELL-008) | stub floor + a lesson list, no scoring logic | 300 KB |
| lesson player (PLAY-006) | stub floor + the item-type renderers (`lib/items/` registry, all five types) | 350 KB |

These are starting budgets to catch a regression, not a promise that the
final figure lands there — each building card measures its real route and
either fits under this number or raises it with a printed `npm run budget`
run as justification, per OPS-006's "re-derive from a real run before
raising it" rule.

**Known cost, accepted:** navigating between two root layouts forces a full
page reload instead of a client-side transition (`route-groups.md:30`). This
is accepted per settled input 7 (`docs/handoff.md`) — Colloquiz is reached
from the English surface only through a footer link, so this is a rare,
deliberate boundary crossing, not a mid-session navigation.

### What the English root carries

- `<html lang="ru">`.
- Geist Sans (0021's Cyrillic-coverage finding is about the font file itself,
  not which layout loads it — still applies).
- `app/globals.css` — the one shared Tailwind build is accepted
  (`docs/handoff.md`, Performance boundary: "CSS is small next to JS. Do not
  split the build to chase it").
- `<SpeedInsights/>` — kept, not dropped. It's the only source of field Web
  Vitals, which is the evidence the Performance boundary's own budget
  requirement asks for; OPS-008 (funnel analytics) is a separate, still-open
  decision about whether `<Analytics/>` (pageview counting) also belongs
  here. Its bytes are included in whatever budget number the real English
  root card reports.

### What it does NOT carry

- `ThemeProvider` / any dark-mode toggle. Dark mode still applies — a small
  inline script (no bundle cost; same technique next-themes itself uses to
  avoid a flash) sets `.dark` from `prefers-color-scheme`, with no user
  override control on this surface.
- `Geist_Mono` — used only by Colloquiz's admin/quiz components
  (`app/layout.tsx:29-38`); nothing in `lib/lessons/` or the player renders
  monospace text.
- katex CSS.

### katex CSS

Checked, not assumed: every runtime KaTeX consumer (`RichText.tsx`,
`MathHtml.tsx`, and their callers) lives under `app/(main)/app/**` — i.e.
inside Colloquiz — confirmed by `rg`:

```
app\(main)\app\results\[id]\page.tsx
app\(main)\app\admin\review\ReviewQueue.tsx
app\(main)\app\quiz\[id]\QuizSession.tsx
app\(main)\app\quiz\[id]\page.tsx
app\(main)\app\groups\[id]\review\GroupReviewView.tsx
```

`lib/lessons/` (the English content pipeline) is separately proven KaTeX-free
by `lib/lessons/katexFree.test.ts`, which walks its real first-party module
graph and fails if any import specifier or resolved file path names a katex
package. So katex CSS belongs on the Colloquiz root only — it was never a
candidate for the English root, and nothing needs to be removed from the
dependency tree; `katex` the npm package is still used server-side by
`lib/richText.ts` (`renderToString`, not shipped to any client bundle).

### `not-found`

`app/not-found.tsx` and the experimental `global-not-found.js` are both
app-root-singular (`not-found.md:45-56, 72`), so multiple root layouts force
a choice. Decision: enable `experimental.globalNotFound` and add
`app/global-not-found.tsx` as a Russian-first 404 with a link to `/` — this
is exactly the case the Next docs name for adopting it ("multiple root
layouts, so there's no single layout to compose a global 404 from",
`not-found.md:53-55`). Each root layout additionally gets its own
`not-found.tsx` for in-segment `notFound()` calls (e.g. an unpublished
lesson) — those aren't app-root-singular, they render inside whichever
layout is active per `not-found.md:43`.

**Experimental-flag risk, recorded:** `global-not-found.js` shipped in Next
15.4.0 as experimental (`not-found.md:233`) and is not yet a stable API — a
future Next upgrade could change or remove it. **Revisit when:** a Next
major/minor release note changes `experimental.globalNotFound`'s status, or
when a stable non-experimental replacement for a global 404 across multiple
root layouts ships.

### `global-error.tsx`

Stays a single shared file regardless — it has no per-root-layout
equivalent and "replaces the root layout... when active"
(`node_modules/next/dist/docs/.../error.md`, cited already in
`docs/ui-decisions.md`'s Ops & resilience entry). Decision: it stays neutral
and bilingual (a one-line message that reads in both English and Russian,
matching its existing inline-styled, dependency-free construction — see
`app/global-error.tsx`) and does not call Sentry, consistent with Sentry's
removal (see "Cards proposed" below) making that call dead code anyway.

### `opengraph-image.tsx` / icon files

Confirmed per-route-segment, not tied to the app root or to a root layout's
presence (`opengraph-image.md:6-34`: "allow you to set... images for a route
segment"; "Add... to any route segment"). Each root group can carry its own;
no constraint from this decision flows into SHELL-009, which refines the
English surface's own OG image.

### `(auth)` and `(legal)`

Both stay under the Colloquiz root. Neither serves the anonymous
English-surface visitor the Performance boundary is protecting — `(auth)` is
Colloquiz's own login/signup, and `(legal)` (Terms/Privacy/Subprocessors) is
reached from Colloquiz's clickwrap and footer, not from the English surface's
funnel. Nothing in `docs/handoff.md` asks for Russian-language legal pages.

### Sentry

`instrumentation-client.ts` is a genuinely global Next instrumentation hook
(loaded by `instrumentation.ts`'s `register()`, not by any layout choosing to
import it) — giving English its own root layout does not scope Sentry away
from it by itself, and the issue is explicit that this must be decided here,
not assumed solved. Decision: **propose removing Sentry entirely** (see
OPS-012 below) rather than trying to scope it. Reasoning: Sentry has never
been wired to a paid plan or an alerting destination anyone monitors per the
existing docs (no reference to a dashboard, an on-call rotation, or an
incident this data has ever been used for), so its ongoing cost — bundle
bytes on every route including every future English route, a CSP
`connect-src` allowance, a PII-scrubbing surface (`lib/sentryScrub.ts`) that
itself has to be kept correct — is currently paid for zero realized benefit.
This is an owner-approved dependency removal (see OPS-012's acceptance), not
a unilateral call made inside this decision doc.

## Method (for the measured evidence above)

A throwaway route group `app/(shell006-stub)/` with a minimal root layout
(`<html lang="ru">`, Geist Sans, `globals.css`, no other imports) and a
one-line `/stub` page was added, `/stub` was allow-listed in
`proxy.ts`'s `publicRoutes` and in `scripts/budget.ts`'s `ROUTES`, and
`npm run budget` was run twice — once without `<SpeedInsights/>` in the stub
layout, once with it added, to isolate whether it contributes measurable
script bytes locally (it doesn't; see above). All three changes were reverted
each time (`git checkout -- proxy.ts scripts/budget.ts` + deleting the stub
directory) before this card's close — confirmed clean via `git status`. Nothing from the stub ships; the
real English root layout is SHELL-014/SHELL-007's job.

## What this card does not decide

The actual file moves (Colloquiz into its own root group, Sentry's removal,
the real English root layout) — left to the cards proposed below. This
avoids doing the "own root layout" restructuring twice under a rushed
type:decision card and lets each move be reviewed and verified on its own.

## Cards proposed

1. **OPS-012 — Remove Sentry.** M2, ranked before SHELL-014, no deps.
2. **SHELL-014 — Colloquiz gets its own root layout.** M2, depends on
   OPS-012.
3. **SHELL-007 gains a dependency on SHELL-014**, plus this decision's
   English-root specifics (own root layout, `global-not-found.tsx`, no
   ThemeProvider/Geist_Mono/katex CSS, inline dark-mode script,
   `<SpeedInsights/>` kept).

**Revisit when:** the experimental-flag risk above fires, or if Sentry
removal (OPS-012) is not approved — in which case this decision's "propose
removing" resolution for the Sentry cost needs a different answer (most
likely: accept the client-init cost on English routes as an unavoidable
global hook, and say so explicitly rather than re-opening this card).

## Addendum (2026-09-26, after OPS-012 — the stub floor re-derived)

OPS-012 (issue #118) removed Sentry per this card's proposal. The 253.0 KB
stub floor above was measured *with* Sentry's global client init present
(the whole reason removal was proposed here rather than "scope it away" —
`instrumentation-client.ts` isn't something a layout opts into), so it
overstated the true floor once Sentry was gone, and the per-route-kind
budgets built on top of it (300/300/350 KB) were carrying that gap as unused
slack. Re-measured rather than left stale, per OPS-006's "re-derive from a
real run before raising [or lowering] it" rule — the same rule this card's
own budgets cite.

**Method.** Sentry's removal (OPS-012) already touched `next.config.ts` and
deleted the global instrumentation files, so reproducing the original
stub-under-its-own-root scenario now requires *removing* the top-level
`app/layout.tsx` (Next only lets a route group define its own root when
nothing sits above it — `layout.md:142`), which would otherwise break
`(main)`/`(auth)`/`(legal)`, none of which have a root layout of their own
yet (that split is SHELL-014's job, still open). Rather than risk the working
tree, the whole experiment ran in a throwaway `git worktree`, deleted after:
the same `(shell006-stub)` route (`<html lang="ru">`, Geist Sans only,
`globals.css`, no other imports) was recreated, `app/layout.tsx` was removed,
and `(main)`/`(auth)`/`(legal)` each got a bare temporary `<html>/<body>`
wrapper around their unchanged existing content purely so the build stayed
valid (never merged — the worktree was removed with `git worktree remove
--force` once the measurement was captured, and `git status` on the main
tree was confirmed clean before and after). `/stub` was allow-listed in that
worktree's `proxy.ts`, the app was built and started with `next start`, and
a headless-Chromium CDP session recorded every script resource's
`Network.loadingFinished` `encodedDataLength` — same wire-byte methodology
`scripts/budget.ts` uses, itemized per chunk instead of only summed, to show
where the bytes go:

```
Script chunks for /stub (post-Sentry-removal, 2026-09-26):
   72.12 KB  /_next/static/chunks/02b8n0jyfwrqz.js
   37.65 KB  /_next/static/chunks/0d-o1gc95ma1r.js
   13.70 KB  /_next/static/chunks/0e~vbafj-cof3.js
   10.18 KB  /_next/static/chunks/0i_mddebjo41u.js
    9.77 KB  /_next/static/chunks/0heymb0~4to1s.js
    5.19 KB  /_next/static/chunks/turbopack-05kap75p04_eg.js
    5.17 KB  /_next/static/chunks/0so17x9nnf0b1.js
    2.54 KB  /_next/static/chunks/01xlw8hd842-c.js
    1.84 KB  /_next/static/chunks/14_18q1zpom_g.js
    1.41 KB  /_next/static/chunks/0fldi-4fgo6om.js

Total: 159.58 KB (163,406 B)
```

| route | root layout | script KB |
|---|---|---|
| `/stub`, with Sentry (2026-09-23 spike, above) | own | 253.0 KB |
| `/stub`, without Sentry (this addendum) | own | 159.6 KB |

**159.6 KB is today's re-derived floor.** The naive "93.4 KB below the
original" comparison (253.0 → 159.6) is **wrong and was corrected on issue
#118** rather than left standing: 253.0 KB doesn't reproduce today —
rebuilding the identical with-Sentry stub scenario now gives **229.28 KB**,
a 23.7 KB gap that has nothing to do with Sentry (ordinary dependency drift
between 2026-09-23 and today, not chased further). Measured like-for-like —
both sides built today, only Sentry differing — the real drop is
**229.28 → 159.58 KB = 69.70 KB**, matching `/login`'s 69.33 KB
(371.6 → 302.3 KB, issue #118) to within 0.37 KB. This was confirmed by
content, not inferred from totals: `grep -l -i sentry .next/static/chunks/*.js`
finds exactly one chunk on each with-Sentry build — 142.29 KB on `/login`,
142.31 KB on `/stub` — so Sentry's own bundle is a fixed, route-independent
blob, as expected for a globally-loaded instrumentation hook. That chunk is
not 100% Sentry, though: after removal, a *new* ~72 KB chunk of ordinary
Next.js/React runtime bootstrap code (confirmed by reading its contents)
appears standalone on both routes (72.19 KB / 72.12 KB) where it didn't
before — Turbopack had been co-bundling it with Sentry's init into one
physical chunk. Sentry's real isolable cost is the difference,
142.3 − 72.15 ≈ 70.1 KB, which is why both routes land at ~69.3–69.7 KB
regardless of route size, not a fraction-of-bundle effect.

**Per-route-kind budgets, corrected** (same headroom-over-floor this card
originally stated, floor swapped in; still starting points per this card's
own "not a promise" rule above — SHELL-007/PLAY-006/SHELL-008 re-measure
their real routes and can raise these with a printed run, same as before):

| route kind | old budget (stale floor) | headroom (unchanged) | new budget |
|---|---|---|---|
| landing (SHELL-010) | 300 KB | 47 KB | **210 KB** |
| course page (SHELL-008) | 300 KB | 47 KB | **210 KB** |
| lesson player (PLAY-006) | 350 KB | 97 KB | **260 KB** |

Until SHELL-007/SHELL-008/PLAY-006 land and re-measure their real routes,
`scripts/budget.ts`'s `ROUTES` list still only configures `/login` — this
addendum's job is to correct the reference numbers those cards will read,
not to add unbuilt routes to the guard early. A future session picking up
one of those cards should cite 210/210/260 KB, not 300/300/350.

**Side finding, not this card's to fix:** grepping the stub's own 10 script
chunks for anything besides the React/Next runtime found one leak —
`lucide-react`'s shared `Icon` base component (~5.17 KB compressed, no actual
icon SVGs, confirmed by content) ships on `/stub` even though neither the
stub page nor its layout imports anything from `lucide-react`. This isn't an
explicit-import problem OPS-006's `no-restricted-imports` rule would catch —
it's Turbopack's own commons-chunk splitting sharing a piece of a
Colloquiz-heavy dependency across the whole build regardless of per-route
need. Proposed as its own card (OPS-013, issue #118 comment) rather than
folded in here.
