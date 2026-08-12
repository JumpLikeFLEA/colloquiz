# ADR 0001 — On-demand performance benchmark

**Status:** Accepted, 2026-08-12
**Owner:** perf tooling

## Context

The project has no latency measurement of its own — no web-vitals, no Vercel
Analytics, no OTel, no request logging. When a production-wide slowdown surfaced
recently (serial round-trips plus an `expire_duels` write-sweep on every
authenticated navigation), the diagnosis had to be reconstructed from git
history and code reading. "Is it slower, and where?" could not be answered
directly.

We want that number available on demand, before and after any change, against
local or production, without turning the app into a telemetry platform.

## Decision

Ship a developer-only benchmark script, [`scripts/bench.ts`](../../scripts/bench.ts),
run as `npm run bench -- --target=local|prod` (or `npx tsx --env-file=.env.local
scripts/bench.ts …`). It follows the existing `scripts/*` convention (tsx,
explicit `--env-file`) and produces a console table plus a JSON baseline on
disk. Later runs diff against `.perf/<target>-latest.json` and flag any p50 that
regressed beyond a threshold (default +15%).

The following sub-decisions are locked:

### A script, not RUM / not a profiler / not a load test
- **RUM** would need SDK integration, cookie-consent copy, storage, and a
  dashboard for numbers we do not yet know we want to keep. Deferred until we
  have a specific product question that requires it.
- **A profiler** (V8/CPU flamegraphs) answers "which function is slow", not "did
  a change move user-facing p50". We want the second question first — the first
  question follows from the second.
- **A load test** measures throughput under concurrency. Our current bottlenecks
  have all been serial round-trips visible at n=1, so parallel load would only
  obscure them. Add later if we hit a concurrency limit.

### Two measurement layers
- **Layer A — per-route TTFB.** Black-box HTTP fetch against `/`, `/dashboard`,
  `/progress`, `/leaderboard`, `/duels`, `/groups`, `/achievements`,
  `/settings`. Reflects the whole stack (proxy, RSC, data fetching, cache) — the
  number a real user would experience. `redirect:"manual"` is load-bearing: a
  307 → `/login` means auth failed, and must be flagged rather than silently
  timing the login page.
- **Layer B — direct hot-RPC timing.** A raw `@supabase/supabase-js` client
  authed with the bench user's JWT, calling each RPC by name. Bypasses the Next
  `unstable_cache` wrappers, so a number that moves here reflects the database
  path, not a cache miss. This is the "why" layer — when Layer A regresses,
  Layer B says which RPC changed.

Reporting only one layer would leave every diagnosis half-blind: TTFB alone
cannot tell cache from database; RPC timing alone cannot tell whether the app
still exercises the RPC on the path a user actually takes.

### Auth via a dedicated bench account, not a service-role token
- The service-role key bypasses RLS and would not exercise the same code paths
  the app takes. A real signed-in user is the honest baseline.
- The `sb-*` cookie format is NOT hand-rolled: the script builds a
  `@supabase/ssr` `createServerClient` with an in-memory cookie-jar adapter and
  reuses the exact encoder [`proxy.ts:13-14`](../../proxy.ts) reads. Any change
  to that encoding stays in one place.

### Read-only against prod, writes only locally
- `--include-writes` is refused unless the resolved target host is
  `localhost`/`127.0.0.1`. No flag combination writes to prod. The only write
  RPC in scope today is `expire_duels` (moved off the render path onto pg_cron
  in migration 033); benchmarking it locally is fine, invoking it against prod
  from a developer machine would race the cron.

### Sampling: ~20 iters, 1 warmup discarded, p50/p95/min/max
- 20 iters is enough to stabilise p50 for a single-user benchmark while keeping
  the whole run under a minute.
- The first iteration pays TLS setup + JIT costs unrelated to steady-state and
  is discarded.
- p50 is the headline (typical experience); p95 catches tail regressions; min
  reveals the physical floor of the request; max flags outliers worth a look.

### Output: console table + `.perf/<target>-latest.json`
- The console table is the human view; the JSON is the diff substrate. Both are
  produced every run.
- `.perf/` is git-ignored — baselines are local to whoever ran the script.
- Regressions beyond +15% p50 are flagged with `⚠`. The threshold is a rough
  "worth a look" line, not a pass/fail gate.

## Consequences

- Any change with a plausible perf impact can be measured before and after with
  one command, and the diff is visible in the same terminal window.
- The bench user must exist in whichever project is targeted; onboarding a new
  target now includes creating that account. That is a small tax paid once.
- Because it is a developer tool, it collects no anonymised user data and needs
  no consent flow — but it also cannot answer questions about real-user devices
  or networks. If we later need that, a separate RUM decision revisits this
  file.

## Amendment — Markdown report (2026-08-12)

The raw JSON is machine-shaped and the console tables scroll away, so neither is
a good artifact to read at a glance or hand to a fixing agent. Each run now also
writes `.perf/<target>-report.md`, built by the pure, unit-tested
[`lib/perfReport.ts`](../../lib/perfReport.ts): a summary, a **Problems** section,
the two data tables, and a fenced **paste-ready digest** copyable into a fixing
prompt.

Two decisions locked with the user:

- **Absolute budgets AND regression.** A row is a problem when a p50 exceeds an
  absolute budget (route 400ms / RPC 150ms, tunable), when `okRate < 1`, when
  `p95/p50` exceeds the variance ratio, OR when p50 regressed beyond the
  existing `--threshold` vs baseline. The regression rule reuses the exact
  comparison the console Δ column already uses, so the two never disagree.
  Absolute budgets mean a first run with no baseline still surfaces problems —
  the regression-only design would report nothing on a cold target.
- **Evidence-only.** Each flagged item states its numbers plus the correlated
  backing-RPC timings (via a conservative route→RPC map) so a reader can see
  whether the cost is DB-bound. It deliberately does NOT guess a root cause or
  name a file — the fixing agent investigates from the facts, and a wrong guess
  in a paste-in prompt is worse than none.

## Glossary

- **TTFB (time to first byte)** — from the client sending the request to the
  first byte of the response arriving. Under Node's `fetch`, the returned
  promise resolves when headers are in; the script measures TTFB at that
  resolution and "total" after the body is drained.
- **p50 / p95** — the 50th and 95th percentile of the sample. p50 is the
  typical case; p95 catches the slow-but-not-rare tail.
- **Warmup** — an initial iteration whose timing is discarded because it pays
  one-time costs (TLS handshake, JIT compilation, cold connection pool) that a
  steady-state benchmark should not attribute to the request under test.
- **Baseline** — a prior run's JSON blob (`.perf/<target>-latest.json` by
  default). The current run's p50 is compared against it to produce the Δ
  column.
- **Hot path** — the code path exercised by a common request under normal load
  (an authenticated page render, an RPC that backs a home-page card).
  "Hot-RPC timing" measures each RPC on that path directly.
- **Cold vs warm cache** — a cold cache has no populated entries and pays the
  underlying data cost; a warm cache serves entries in memory. Layer B
  deliberately bypasses the Next `unstable_cache` wrappers so its numbers
  reflect the cold-cache path, which is what changes when a DB query changes.
