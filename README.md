# Colloquiz

A quiz platform for self-study and light tutoring. Learners take subject-based quizzes,
compose their own, track progress through XP, streaks, and achievements, and can report
bad questions. Tutors invite students, assign quizzes, and review their answers. Admins
moderate the shared question bank, which is grown by an AI generator with a human-review
pipeline.

---

## Stack

| Layer      | Choice                                                                     |
|------------|----------------------------------------------------------------------------|
| Framework  | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5               |
| Styling    | Tailwind CSS v4 · shadcn/ui · lucide-react · framer-motion · recharts       |
| Backend    | Supabase (Postgres + Auth + Row-Level Security) via `@supabase/ssr`         |
| LLM        | Anthropic SDK (`@anthropic-ai/sdk`) — question generator + critic           |
| Validation | zod                                                                        |
| Hosting    | Vercel (`vercel.json` pins region `dub1`)                                   |

The visual source of truth lives at `figma-export/` (the original Vite + React + Tailwind
export). The Next.js app is a faithful port; design fidelity is enforced by `CLAUDE.md`.
The one intentional deviation is the body font (Geist via `next/font`).

---

## Architecture overview

### Routing & auth
The `app/` directory uses two route groups:

- **`(auth)`** — `/login`, `/signup`, `/reset-password`. Public entry points.
- **`(main)`** — everything else (gated): home, advanced/custom quiz builders, quiz player,
  results, dashboard, achievements, my-quizzes, students, invite acceptance, and admin.

`proxy.ts` is this Next.js fork's middleware. It runs on every request, refreshes the
Supabase session, and redirects unauthenticated users to `/login` — preserving the intended
destination as `?next=` so invite links land correctly after sign-in. Authorization beyond
"is signed in" is **not** done here: admin- and author-only actions are enforced per route
handler and, ultimately, by Postgres Row-Level Security.

### Roles
Roles are two independent axes on `profiles`:

- **`role`** — `'user'` or `'admin'`. Only an admin (via the Supabase dashboard or the
  service-role key) can set it; a column-level `GRANT` prevents users from self-escalating.
  Admins moderate the shared question bank and reports.
- **`is_author`** — a self-serve boolean (the "become an author/tutor" card). Authors can
  create private questions and quizzes, invite students via a rotating link, assign quizzes,
  and review student results. Students are linked to a tutor by accepting an invite.

### Data layout
Two stores, each owning a different kind of state:

- **Static config (Git-tracked JSON):** `data/subjects.json` — the 19 subjects, their
  icons/colors, filterable tags, and display subtopics.
- **User and content data (Supabase):** `profiles`, `questions`, `quizzes`, `results`,
  `quiz_sessions`, `user_achievements`, `custom_quizzes`, `tutor_invites`, `tutor_students`,
  `assignments`, `question_reports`, `notifications`, `generation_batches`. RLS is enabled on
  every table.

`lib/questions.ts` is the data-access layer that bridges them: `getSubjects()` reads the JSON;
everything else hits Supabase (with `.range()` paging to survive PostgREST's 1000-row cap, and
a cached DB-side `get_subject_stats` RPC for the home grid).

### Quiz lifecycle
1. A learner picks a subject on the home page (**Quick Play**), tunes a filter in the
   **Deep Dive** wizard (`/advanced`), or composes a personal quiz (`/custom`).
2. `POST /api/quiz` resolves the filter, samples matching **approved + shared** questions,
   creates a quiz row, and returns its id.
3. The learner plays at `/quiz/[id]`. **Ordinary mode** reveals correctness + explanation
   after each answer; **Exam mode** stays silent until the end. Progress is persisted to a
   `quiz_sessions` row (one active session per user), so a quiz survives navigation and browser
   close and resumes at the exact spot — surfaced by `ActiveQuizBanner`.
4. Scores are computed by `lib/scoring.ts` and persisted via `POST /api/results`; the server
   re-derives correct answers rather than trusting the client.
5. The result awards XP, updates the streak, and unlocks achievements (idempotently). During or
   after a quiz, a learner can report a question (`POST /api/reports`).

### Question bank & review
Every question carries a `status` (`pending` / `approved` / `rejected`) and a `visibility`
(`shared` / `private`). Only **approved + shared** questions enter random-quiz sampling.

- **AI generation** (`lib/generator/`) — `generateBatch()` validates input, picks few-shot
  exemplars, calls the **generator** model (Sonnet) for a batch of questions, runs a **critic**
  model (Haiku) that attaches structured notes, and returns DB-ready rows with a content hash
  (exact-match dedup) at `status='pending'`. Driven today by the CLI at
  `scripts/seed-questions-ai.ts`; each run is logged in `generation_batches`.
- **Human review** — pending questions (AI-generated or externally authored) land in the admin
  review queue at `/admin/review`, where an admin approves or rejects them. The same page hosts
  the reported-questions moderation queue.

### Tutoring
An author generates a rotating invite link (`/api/invites`); a student accepts it at
`/invite/[token]`, creating a `tutor_students` link. The author assigns owned quizzes to linked
students (`assignments`), and can review each submission's answers at
`/students/review/[assignmentId]`. Key events (invite accepted, assignment created/completed,
question reviewed, achievement unlocked, report resolved) are written to `notifications` by
database triggers and surfaced by the `NotificationBell` center in the top bar.

---

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

---

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

---

## Project structure

```
colloquiz/
├── AGENTS.md                       Rules for AI coding agents (Next.js 16 caveats)
├── CLAUDE.md                       Design-fidelity rules + intentional deviations
├── PLAN.md                         Original MVP build plan (historical)
├── README.md                       This file
├── proxy.ts                        Middleware: session refresh + auth gating
├── next.config.ts · vercel.json · components.json · postcss.config.mjs · tsconfig.json
├── app/
│   ├── (auth)/                     login, signup, reset-password (+ AuthScreen)
│   ├── (main)/                     home, advanced, custom, quiz/[id], results/[id],
│   │                                  dashboard, achievements, my-quizzes(+builder),
│   │                                  students(+review), invite/[token], admin/*
│   ├── api/                        Route handlers (see below)
│   ├── auth/                       callback + confirm (OAuth / email confirmation)
│   ├── components/                 AppSidebar, Topbar, NotificationBell, SubjectGrid,
│   │                                  StartQuizProvider, ActiveQuizBanner, ReportQuestion,
│   │                                  BecomeAuthorCard, figma/, ui/ (shadcn primitives)
│   ├── globals.css                 Tailwind v4 + Figma theme tokens
│   └── layout.tsx                  Root shell (Geist font)
├── data/
│   ├── subjects.json               20 subjects × { id, name, icon, color, tags, subtopics }
│   └── seed-exemplars.json         Gold-standard few-shot examples for the generator
├── docs/
│   └── authoring-guide.md          How to write a question manually
├── figma-export/                   Vite Figma export — visual source of truth (read-only)
├── lib/
│   ├── generator/                  AI generation: index, llm, prompts, critic, dedup,
│   │                                  exemplars, schema, types
│   ├── supabase/                   server + browser clients, shared queries
│   ├── achievements.ts             Achievement catalog + unlock checks
│   ├── questions.ts                Data-access layer (Supabase + subjects.json)
│   ├── quizSession.ts              Active-session resume logic
│   ├── scoring.ts · streak.ts · reports.ts · author.ts · authorQuiz.ts
│   ├── options.ts · shuffleOptions.ts   Deterministic per-quiz option shuffling
│   ├── format.ts · use-mobile.ts · utils.ts
├── scripts/
│   ├── seed-questions.ts           Seed data/questions.json into Supabase
│   ├── seed-questions-ai.ts        AI generator CLI (writes pending questions)
│   └── import-authored-questions.ts  Import externally-authored JSON into the review queue
├── supabase/
│   └── migrations/                 001–013 (schema + RLS + RPCs + triggers)
└── types/
    └── index.ts                    All shared TypeScript types
```

### API routes
- **Quiz/results:** `POST /api/quiz`, `/api/quiz/session`, `/api/results`, `/api/reports`
- **Notifications:** `/api/notifications`
- **Author/tutor:** `/api/invites`, `/api/invites/accept`, `/api/assignments`(`/[id]`),
  `/api/students/[studentId]`, `/api/author/enroll`, `/api/author/quiz`(`/[id]`),
  `/api/author/questions/[id]/submit-to-pool`
- **Admin:** `/api/admin/quiz`, `/api/admin/questions/[id]`, `/api/admin/reports`

Every protected handler follows the same guard:

```ts
const supabase = await createClient();
const user = await authUserFrom(supabase); // lib/auth.ts
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// admin-only routes additionally:
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

`authUserFrom()` verifies the JWT locally against the project's JWKS instead of
calling `supabase.auth.getUser()`, which would spend a network round trip on
every request. Use it anywhere on the server; in Server Components prefer the
`cache()`d `getUser()` in `lib/supabase/queries.ts`. Note the proxy deliberately
does **not** run in front of `/api` — handlers return their own 401.

---

## Data model

### Subjects (`data/subjects.json`)
Each entry conforms to the `Subject` interface in `types/index.ts`:

```ts
interface Subject {
  id: string;           // slug, e.g. "data_analysis"
  name: string;         // display + value written to questions.subject, e.g. "Data Analysis"
  icon: string;         // lucide-react icon name, e.g. "BarChart3"
  color: string;        // hex accent — the subject's identity hue, same in both themes
  tags: string[];       // canonical filterable tags for sampleQuestions()
  subtopics?: string[]; // Title-Case display labels for the Deep Dive wizard
}
```

There is deliberately no stored background. A `bg` field held a hand-picked
near-white tint per subject, written straight into an inline style, where it
could not respond to the theme. The chip surface is now derived from `color` at
render by `chipStyle()` in `lib/categoricalColor.ts`, which washes the hue into
the live `--card`. The same helper backs the duel tiers (`lib/glicko2.ts`) and
the achievement category/rarity ramps.

`tags` (lowercase, the filter axis, stored verbatim on each question's `tags[]`) and
`subtopics` (Title Case, the UI label set) are intentionally separate.

### Questions (Supabase)
Selected fields from the `Question` type; see `types/index.ts` and
`supabase/migrations/001` + `002` + `006` for the full shape and RLS.

| Field                 | Type                    | Notes                                              |
|-----------------------|-------------------------|----------------------------------------------------|
| `id`                  | text (PK)               | Slug or UUID                                       |
| `type`                | text                    | `multiple_choice` (others deferred)                |
| `subject`             | text                    | Matches a `Subject.id`                             |
| `tags`                | text[]                  | Lowercase topic tags                               |
| `difficulty`          | text                    | `easy` \| `medium` \| `hard`                       |
| `question` / `options`/ `correct_answer` / `explanation` | text / text[4] / text / text | 4 options; answer matches one verbatim |
| `source`              | text                    | `manual` \| `ai_generated`                         |
| `status`              | text                    | `pending` \| `approved` \| `rejected`              |
| `visibility`          | text                    | `shared` \| `private`                              |
| `content_hash`        | text (nullable)         | Exact-match dedup key                              |
| `critic_notes`        | jsonb (nullable)        | AI critic's structured feedback                    |
| `created_by` / `reviewed_by` | uuid (nullable)  | FK `profiles.id`                                   |

### Migrations
`supabase/migrations/` is the DDL truth. In order:

| #   | Adds                                                                          |
|-----|-------------------------------------------------------------------------------|
| 001 | Core schema: profiles, questions, quizzes, results, achievements, custom_quizzes + RLS + signup trigger |
| 002 | Question review pipeline: status/critic_notes/content_hash + `generation_batches` |
| 003 | `profiles.full_name` + `city`                                                 |
| 004 | Signup city capture                                                            |
| 005 | Subject rename (games → sports)                                                |
| 006 | Author role, tutor invites/links, assignments, question/quiz `visibility`, assigned-content RLS |
| 007 | Subject rename (sports history)                                                |
| 008 | `get_subject_stats` RPC (DB-side counts for the home grid)                     |
| 009 | `quiz_sessions` — resumable, one-active-per-user                               |
| 010 | `question_reports` + notifications stub + `resolve_question_reports` RPC       |
| 011 | `results.excluded_question_ids` (reported-and-skipped questions)               |
| 012 | Result → quiz cascade fix                                                      |
| 013 | Notification triggers (invite/assignment/achievement/review events)           |

---

## Conventions

### Design fidelity (`CLAUDE.md`)
> `figma-export/` is the visual source of truth. Never change, simplify, or substitute Tailwind
> classes, spacing, colors, or DOM structure. Only Next.js-specific changes are allowed
> (`next/link`, `next/image`, app router, `'use client'`). Surfaces with no Figma source (auth
> logic, notification center, reset-password) are composed only from classes already used
> elsewhere. See `CLAUDE.md` for the full list of intentional deviations.

### Next.js 16 caveats (`AGENTS.md`)
This is **not** the Next.js most people remember — APIs, conventions, and file structure differ
(the middleware file is `proxy.ts`, dynamic-route `params` are async, etc.). Consult
`node_modules/next/dist/docs/` before writing route handlers, server components, or middleware.

### Tagging
`Subject.tags` and `Question.tags` are lowercase; `Subject.subtopics` are Title Case. The Deep
Dive wizard shows `subtopics` and writes the selection into `QuizFilter.tags`. Automated tagging
(AI generator, authored import) derives the tag from the subtopic via `slugifyForTag`.

---

## Scripts

```bash
npm run dev      # local dev server (Turbopack) with hot reload
npm run build    # production build
npm run start    # serve the production build

# One-off CLIs (tsx does not auto-load .env — pass --env-file):
npx tsx --env-file=.env.local scripts/seed-questions.ts
npx tsx --env-file=.env.local scripts/seed-questions-ai.ts \
  --subject "Data Analysis" --difficulty easy \
  --subtopics "Pandas,Descriptive Statistics" --count 5 --notes "real-world scenarios"
npx tsx --env-file=.env.local scripts/import-authored-questions.ts <file.json> [--sync]
```

There is no `lint` script or ESLint config; the production build runs the TypeScript type-check.

---

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

---

## Roadmap

### Built
19 subjects; Quick Play / Deep Dive / custom quiz builders; ordinary + exam modes; resumable
quiz sessions; results with grades, tag breakdowns, XP, streaks, and achievements; question
reporting; admin review + moderation queues; the AI generator (Sonnet + Haiku critic) with a
CLI and human-review pipeline; the author/tutor system (invites, assignments, student review);
and a trigger-driven notification center. Phase 1's original checklist is in `PLAN.md`.

### Planned
- Move generation behind an API route with a job queue (no serverless timeout risk).
- Embedding-based dedup once a `(subject, difficulty)` bucket grows past exact-match's usefulness.
- Let the critic selectively auto-reject once its calibration is trusted.
- Dynamic in-subject exemplars drawn from the approved bank.

---

## Useful references

- `CLAUDE.md` — design-fidelity rules and intentional deviations.
- `AGENTS.md` — Next.js 16 agent rules.
- `PLAN.md` — original Phase 1 build log.
- `docs/authoring-guide.md` — manual question authoring conventions.
- `supabase/migrations/` — DDL, RLS, RPC, and trigger truth.
- `types/index.ts` — all shared TypeScript types.
