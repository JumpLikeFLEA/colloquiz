# 0042 — OPS-006: cold-load JS budget guard

## Context

Next 16 removed `next build`'s `First Load JS`/size columns ("we found these
to be inaccurate in server-driven architectures using React Server
Components... both our Turbopack and Webpack implementations had issues" —
`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`), so
every M2 English-route byte budget in `docs/handoff.md`'s Performance
boundary had nothing to cite. This card built the replacement before any card
needs it, and baselined the smallest route that exists today (`/login`) since
no route currently prints any size.

## Options considered

- **`next build` output parsing / bundle analyzer** — rejected: the number
  Next 16 removed was exactly this, for the "inaccurate in a server-driven
  architecture" reason quoted above. Parsing a bundle analyzer's static graph
  also can't distinguish what a real browser actually fetches (route-level
  code-splitting, conditional dynamic imports) from what's merely reachable.
- **Lighthouse CI** — rejected as the sole mechanism: it reports a
  performance *score*, not a portable "compressed script bytes transferred"
  number this repo can gate a per-route budget on without re-deriving one
  from Lighthouse's own weighting.
- **Headless-Chromium cold load via Playwright, summing CDP
  `Network.loadingFinished`'s `encodedDataLength` for `Script`-typed
  requests** — chosen. It measures exactly what docs/handoff.md's Performance
  boundary is about: real bytes over the wire, post-compression, for a real
  browser navigation. `encodedDataLength` (not `Content-Length`) was chosen
  specifically because it is accurate for chunked/streamed responses, which a
  header-based measurement is not.

## Decision

`scripts/budget.ts` (`npm run budget`) builds (if needed) and starts a local
`next start`, or targets `--url=<origin>` / `BUDGET_BASE_URL` for an
already-running server (needed by OPS-010's launch rehearsal against the
deployed production URL). For each configured route it opens a fresh,
cache-disabled browser context, sums compressed script bytes actually
transferred, and prints `route | KB | budget`. A non-2xx response, a
navigation timeout, or an uncaught page error is a hard failure for that
route (verified against `/api/<nonexistent>`, which 404s — see the OPS-006
evidence comment), not a 0 KB pass. Exits non-zero on any failure or
over-budget route.

`/login`'s cold-load size was measured at ~371.6 KB (`npm run budget`, this
session) — the floor recorded in `ROUTES`, budgeted at 380 KB. This is the
number a future English-route budget in an M2 card starts from; re-derive it
with a fresh `npm run budget` run rather than reusing this figure once the
app changes underneath it.

The forbidden-heavy-import check (recharts, katex, framer-motion,
`@supabase/ssr`) is a separate mechanism: an ESLint `no-restricted-imports`
override in `eslint.config.mjs`, scoped via `files` to `app/(english)/**`
and `app/components/lesson-player/**`, running inside `npm run check`. It
catches the import at review time; the byte budget catches the regression
it would have caused, after the fact. Neither replaces the other — the byte
budget is not scoped to the English surface and would not by itself explain
*why* a route grew.

`@playwright/test` was added as a new devDependency for this card — approved
by the owner, 2026-09-24.

## What would make us revisit it

- If `next build` ever restores an accurate per-route size number, this
  script's local-server-boot path becomes redundant (the `--url` /
  already-deployed-server path would still matter for OPS-010).
- If CDP's `Network.loadingFinished` semantics change in a future Chromium
  release such that `encodedDataLength` no longer reflects wire bytes.
- If a route needs a budget that varies by viewport (mobile vs desktop) —
  not modelled today; every route is measured with Playwright's default
  desktop viewport.
