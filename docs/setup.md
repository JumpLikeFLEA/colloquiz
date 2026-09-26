# Setup and operations

Moved out of the README on 2026-09-26. How to run Colloquiz locally, the
environment it needs, the npm scripts and the latency benchmark.

## Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free tier is fine)
- An Anthropic API key (only needed to run the question generator)

### First-time setup

```bash
git clone https://github.com/JumpLikeFLEA/colloquiz.git
cd colloquiz
npm install
cp .env.example .env.local
```

Fill in `.env.local` with values from Supabase (Project → Settings → API) and Anthropic
(Console → API Keys).

### Apply database migrations

Paste each file in `supabase/migrations/` into the Supabase SQL Editor **in numeric order**,
or use the Supabase CLI (`npx supabase db push`). All migrations are idempotent and safe to
re-apply.

### Configure auth

Email/password, Google OAuth and Discord OAuth are supported. The social providers and the
email-confirmation / password-recovery templates are configured in the Supabase dashboard
(Authentication → Providers / Email Templates); point the confirmation link at
`/auth/confirm`. Both OAuth providers return to `/auth/callback`, so add that URL (plus the
`?next=` variant) to the allowed redirect list; no extra migration is needed — the
`handle_new_user` trigger already reads `full_name`/`name` from the provider metadata.

### Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` — sign up an account, then
optionally promote yourself to admin in the Supabase dashboard by setting `profiles.role =
'admin'` for your user.

## Environment variables

| Variable                        | Purpose                                                          | Exposed to browser?  |
|---------------------------------|-----------------------------------------------------------------|----------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                            | Yes                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS-bounded)                                 | Yes                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service role key — bypasses RLS. Used only by seed/import CLIs. | **No** — server only |
| `ANTHROPIC_API_KEY`             | Anthropic key for the generator + critic.                       | **No** — server only |
| `ANTHROPIC_MODEL_GENERATOR`     | Generator model id (default `claude-sonnet-4-6`).               | **No** — server only |
| `ANTHROPIC_MODEL_CRITIC`        | Critic model id (default `claude-haiku-4-5-20251001`).          | **No** — server only |

`.env.local` is in `.gitignore`. Never commit real keys.

## Scripts

```bash
npm run dev          # local dev server
npm run build        # production build
npm run start        # serve the production build
npm run check        # type-check + lint + hex-literal guard (the pre-commit gate)
npm run lint         # eslint only (lint:fix to auto-fix)
npm test             # unit tests (vitest; test:watch to watch)
npm run bench        # latency benchmark, see below
npm run budget       # cold-load JavaScript budget per route
npm run seed:local   # seed local fixtures

# One-off CLIs (tsx does not auto-load .env — pass --env-file):
npx tsx --env-file=.env.local scripts/seed-questions.ts
npx tsx --env-file=.env.local scripts/seed-questions-ai.ts \
  --subject "Data Analysis" --difficulty easy \
  --subtopics "Pandas,Descriptive Statistics" --count 5 --notes "real-world scenarios"
npx tsx --env-file=.env.local scripts/import-authored-questions.ts <file.json> [--sync]
```

Course content has its own CLIs (`scripts/validate-course-file.ts`,
`scripts/import-lesson.ts`); see `CLAUDE.md`, "Repo map".

## Benchmarking

`scripts/bench.ts` is an on-demand latency harness — the project has no RUM,
Vercel Analytics or OTel, so this is how "is it slower, and where?" gets
answered. It measures the app in two layers: per-route TTFB via HTTP fetch, and
direct hot-RPC timing via `@supabase/supabase-js`. Full rationale in
[`docs/adr/0001-performance-benchmark.md`](docs/adr/0001-performance-benchmark.md).

### One-time setup

Add a throwaway benchmark account to whichever Supabase project you plan to
target (sign up through `/signup` like any other user), then set in `.env.local`:

```bash
BENCH_EMAIL=bench@example.com
BENCH_PASSWORD=…
BENCH_PROD_URL=https://your-app.vercel.app   # only needed for --target=prod
```

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are reused as-is.

### Run

```bash
# Local: needs `next dev` (or `next build && next start`) running on :3000.
npm run bench -- --target=local
# Or the equivalent tsx form used by the other scripts:
npx tsx --env-file=.env.local scripts/bench.ts --target=local

# Production (read-only by construction):
npm run bench -- --target=prod

# Narrow down a single route or bump the sample size:
npm run bench -- --target=local --route=/duels --iters=50

# Include the one write RPC (expire_duels). Refused unless the target is
# localhost/127.0.0.1 — no flag combination writes to prod.
npm run bench -- --target=local --include-writes

# Tune the report's problem budgets (defaults: route p50 400ms, RPC p50 150ms,
# variance p95/p50 2×). --threshold is the regression cutoff, default +15%.
npm run bench -- --target=prod --route-budget=350 --rpc-budget=120
```

### Reading the output

The script prints one table per layer — route TTFB, route total, then direct
RPC timing — with p50/p95/min/max/ok%. If a prior run of the same target exists
at `.perf/<target>-latest.json`, a **Δ p50 vs baseline** column appears; any
p50 that regressed beyond +15% is tagged with `⚠` and summarised at the bottom.
Every run also writes a timestamped JSON blob to `.perf/`, which is git-ignored.

If Layer A shows a route regression but the RPCs on that page did not move, the
work moved elsewhere on the page (proxy, RSC, cache, network). If a RPC in
Layer B moved, the plan document and ADR list the call sites that back it.

### The Markdown report

Every run also writes a human-readable report to `.perf/<target>-report.md`
(built by [`lib/perfReport.ts`](lib/perfReport.ts)). It contains a summary, a
**Problems** section, the two data tables, and a fenced **Paste-ready problem
digest**. A row is flagged as a problem when any of these hold:

- route TTFB p50 over the route budget (default 400ms), or RPC p50 over the RPC
  budget (default 150ms);
- `okRate < 100%` (a request failed);
- `p95 / p50` over the variance ratio (default 2×) — an unstable tail;
- p50 regressed beyond the `--threshold` (default +15%) vs the baseline.

Because it flags on absolute budgets as well as regressions, a first run with no
baseline still surfaces problems. The report is **evidence-only** — it states
the flagged metric, its numbers, and the correlated backing-RPC timings, but
does not guess a cause or point at a file. The **paste-ready digest** block is
meant to be copied whole into a fixing prompt as context. Budgets are tunable
via `--route-budget`, `--rpc-budget`, `--variance-ratio`.
