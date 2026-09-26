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
way — see "katex CSS" below). The stub deliberately omits `<SpeedInsights/>`
too, even though the real English root keeps it (see below) — 253.0 KB is a
floor, not the final number; the real English root's budget is this floor
plus SpeedInsights' bytes, to be re-measured when SHELL-007 builds it for
real.

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
`proxy.ts`'s `publicRoutes` and in `scripts/budget.ts`'s `ROUTES` for a single
`npm run budget` run, then all three changes were reverted (`git checkout --
proxy.ts scripts/budget.ts` + deleting the stub directory) before this card's
close — confirmed clean via `git status`. Nothing from the stub ships; the
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
