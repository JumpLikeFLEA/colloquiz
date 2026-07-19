# Colloquiz

A personal quiz platform for self-study. Users take subject-based quizzes, compose custom ones from a curated question bank, and track progress through XP and achievements. Designed to grow into an AI-augmented question authoring system where the bulk of the bank is LLM-generated and human-reviewed.

---

## Stack

| Layer        | Choice                                                                 |
|--------------|------------------------------------------------------------------------|
| Framework    | Next.js 16 (App Router) · React 19 · TypeScript                        |
| Styling      | Tailwind CSS v4 · shadcn/ui · lucide-react · framer-motion             |
| Backend      | Supabase (Postgres + Auth + RLS) via `@supabase/ssr`                   |
| LLM          | Anthropic SDK (`@anthropic-ai/sdk`) — Phase 2 generator service        |
| Hosting      | Vercel (planned)                                                       |

The visual source of truth lives at `figma-export/` (the original Vite + React + Tailwind export). The Next.js app is a faithful port; design fidelity is enforced by `CLAUDE.md`.

---

## Architecture overview

### Routing & auth
The `app/` directory uses two route groups:

- `(auth)` — `/login`, `/signup`. Public.
- `(main)` — everything else: home, build, custom, quiz, results, dashboard, achievements, admin. All gated.

`proxy.ts` runs on every request: it refreshes the Supabase session and redirects unauthenticated users to `/login`. Admin-only routes additionally verify `profiles.role === 'admin'` server-side inside the route handler — never trust client-side role claims.

### Data layout
Two stores, each owning a different kind of state:

- **Static config (Git-tracked JSON):** `data/subjects.json`. The canonical list of subjects, their icons/colors, their filterable tags, and their display subtopics.
- **User and content data (Supabase):** `profiles`, `questions`, `quizzes`, `results`, `user_achievements`, `custom_quizzes`. Row-level security is enabled on every table.

`lib/questions.ts` is the data-access layer that bridges them: `getSubjects()` reads the JSON, everything else hits Supabase.

### Quiz lifecycle
1. User picks a subject on the home page or builds a filter via `/build`.
2. `POST /api/quiz` resolves the filter, samples matching questions, creates a quiz row, returns the id.
3. User plays at `/quiz/[id]`. **Ordinary mode** reveals correctness + explanation after each answer. **Exam mode** stays silent until the end.
4. Scores are computed client-side by `lib/scoring.ts`, persisted via `POST /api/results`.
5. The results page mounts `XPAwarder`, which awards XP and unlocks achievements once per result (idempotent via localStorage flag).

### Admin manual authoring
`/admin/quiz-builder` (role-gated) lets an admin compose a quiz with hand-written questions. `POST /api/admin/quiz` inserts them with `source: "manual"`. See `docs/authoring-guide.md` for the field-by-field conventions.

---

## Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free tier is fine)
- An Anthropic API key (only needed for the Phase 2 generator service)

### First-time setup

```bash
git clone https://github.com/JumpLikeFLEA/colloquiz.git
cd colloquiz
npm install
cp .env.example .env.local
```

Fill in `.env.local` with values from Supabase (Project → Settings → API) and Anthropic (Console → API Keys).

### Apply database migrations

Paste each file in `supabase/migrations/` into the Supabase SQL Editor in order, or use the Supabase CLI (`npx supabase db push`).

### Seed any existing questions

If `data/questions.json` is present:

```bash
npx tsx scripts/seed-questions.ts
```

### Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` — sign up an account, then optionally promote yourself to admin in the Supabase dashboard by setting `profiles.role = 'admin'` for your user.

---

## Environment variables

| Variable                          | Purpose                                                                                                          | Exposed to browser? |
|-----------------------------------|------------------------------------------------------------------------------------------------------------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL                                                                                              | Yes                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anon key (RLS-bounded)                                                                                   | Yes                 |
| `SUPABASE_SERVICE_ROLE_KEY`       | Service role key — bypasses RLS. Only used by seed scripts and the generator CLI.                                 | **No** — server only |
| `ANTHROPIC_API_KEY`               | Anthropic API key for the question generator service.                                                              | **No** — server only |
| `ANTHROPIC_MODEL_GENERATOR`       | Model id for generation, e.g. `claude-sonnet-4-6`.                                                                 | **No** — server only |
| `ANTHROPIC_MODEL_CRITIC`          | Model id for critique, e.g. `claude-haiku-4-5-20251001`.                                                           | **No** — server only |

`.env.local` is in `.gitignore`. Never commit real keys.

---

## Project structure

```
colloquiz/
├── AGENTS.md                       Rules for AI coding agents (Next.js 16 caveats)
├── CLAUDE.md                       Design-fidelity rules: Figma export is the visual truth
├── PLAN.md                         Original MVP build plan (10 steps, ✅ complete)
├── README.md                       This file
├── app/
│   ├── (auth)/                     Public — login, signup
│   ├── (main)/                     Gated — home, build, custom, quiz, results,
│   │                                  dashboard, achievements, admin/quiz-builder
│   ├── api/                        Route handlers — /quiz, /results, /admin/quiz
│   ├── auth/callback/              Supabase OAuth callback
│   ├── components/                 AppSidebar, Topbar, SubjectGrid, XPAwarder,
│   │                                  PageTransition, figma/, ui/ (48 shadcn components)
│   ├── globals.css                 Tailwind v4 + Figma theme tokens
│   └── layout.tsx                  Root shell
├── data/
│   ├── subjects.json               15 subjects × { id, name, icon, color, bg, tags, subtopics }
│   └── seed-exemplars.json         (Phase 2) Gold-standard few-shot examples for the generator
├── docs/
│   └── authoring-guide.md          How to write a question manually
├── figma-export/                   Vite-based Figma export — visual source of truth (read-only)
├── lib/
│   ├── achievements.ts             XP formulas + achievement unlock checks
│   ├── questions.ts                Data-access layer (Supabase + subjects.json)
│   ├── scoring.ts                  scoreQuiz(), isCorrect()
│   ├── supabase/                   SSR client + browser client
│   ├── use-mobile.ts               useIsMobile() hook
│   └── utils.ts                    cn() helper (clsx + tailwind-merge)
├── proxy.ts                        Session refresh + auth gating
├── public/                         Static assets
├── scripts/
│   └── seed-questions.ts           One-off CLI seeder (data/questions.json → Supabase)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  Initial schema (profiles, questions, quizzes, results,
│       │                                          user_achievements, custom_quizzes + RLS)
│       └── 002_question_review_pipeline.sql  (Phase 2 — adds status/critic_notes/hash to
│                                              questions, generation_batches audit table)
├── types/
│   └── index.ts                    Question, Quiz, Result, Subject, Difficulty, QuizFilter, ...
├── package.json
└── tsconfig.json
```

---

## Data model

### Subjects (`data/subjects.json`)
Each entry conforms to the `Subject` interface in `types/index.ts`:

```ts
interface Subject {
  id: string;          // slug, e.g. "data_analysis"
  name: string;        // display + value written to questions.subject, e.g. "Data Analysis"
  icon: string;        // lucide-react icon name, e.g. "BarChart3"
  color: string;       // hex, e.g. "#0ea5e9"
  bg: string;          // hex, e.g. "#f0f9ff"
  tags: string[];      // canonical filterable tags for sampleQuestions()
  subtopics?: string[]; // Title-Case display labels for the wizard
}
```

`tags` and `subtopics` serve different roles: `tags` is the filter axis (used by `sampleQuestions` and stored verbatim on each question's `tags[]`), `subtopics` is the UI label set (shown in the build wizard's subtopic picker). They are intentionally separate.

### Questions
Stored in Supabase. Required fields:

| Field            | Type                              | Notes                                                       |
|------------------|-----------------------------------|-------------------------------------------------------------|
| `id`             | text (PK)                         | Slug or UUID                                                |
| `type`           | text                              | Always `"multiple_choice"` in Phase 1                        |
| `subject`        | text                              | Matches `Subject.name` exactly                              |
| `tags`           | text[]                            | 1–3 lowercase topic tags                                    |
| `difficulty`     | text                              | `easy` \| `medium` \| `hard`                                |
| `question`       | text                              | Single clear question, ends in `?`                          |
| `options`        | text[4]                           | Exactly 4 options                                            |
| `correct_answer` | text                              | Must match one of `options` verbatim                        |
| `explanation`    | text                              | 2–4 sentences explaining the correct answer                 |
| `created_at`     | timestamptz                       | ISO 8601                                                    |
| `source`         | text                              | `manual` \| `ai_generated`                                  |
| `created_by`     | uuid (FK profiles.id, nullable)   | Set by the admin route                                       |

See `docs/authoring-guide.md` for the manual-entry conventions.

### Quizzes, results, profiles, achievements
See `supabase/migrations/001_initial_schema.sql` for the full DDL. RLS is enabled on every table; the policies are owner-read/write with admin overrides where appropriate.

---

## Conventions

### Design fidelity (from `CLAUDE.md`)
> `figma-export/` is the visual source of truth. We are porting it to Next.js, preserving visual output exactly. **Never change, simplify, or substitute Tailwind classes, spacing, colors, or DOM structure.** Only Next.js-specific changes are allowed (`next/link`, `next/image`, app router, `'use client'` directives).
>
> Intentional deviation: body font is Geist via `next/font` (the Figma export had no font loaded).

### Next.js 16 caveats (from `AGENTS.md`)
This is **not** the Next.js most people remember. APIs, conventions, and file structure differ. Before writing route handlers, server components, or middleware, consult `node_modules/next/dist/docs/` or the official Next.js 16 docs. Notable changes include async `params` in dynamic route pages.

### Tagging
- **`Subject.tags`** and **`Question.tags`** are lowercase (`pandas`, `sql`, `statistics`).
- **`Subject.subtopics`** are Title Case (`Pandas`, `Descriptive Statistics`).
- The build wizard renders `subtopics` to the user and writes their selection into `QuizFilter.tags`. When automating tagging (e.g. from the AI generator), convert the subtopic to its lowercase tag form before writing.

### Auth in route handlers
Every protected API route follows the same pattern:

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// For admin-only routes:
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

---

## Available scripts

```bash
npm run dev      # local dev server with hot reload
npm run build    # production build
npm run start    # serve the production build

# One-off
npx tsx scripts/seed-questions.ts    # upsert data/questions.json into Supabase
```

---

## Roadmap

### Phase 1 — MVP ✅
Foundations are in place: 15 subjects, manual question bank, quiz player (ordinary + exam modes), results with grade letters and breakdowns, dashboard, XP/achievements, role-gated admin quiz builder. The detailed checklist is in `PLAN.md`.

### Phase 2 — AI question generator (in progress)
LLM-powered question generation with a human-review pipeline. The architecture (decided in design conversations):

- **Tiered models** — Sonnet for generation, Haiku for critique.
- **Batch of 5** questions per LLM call.
- **Generation inputs** — `subject`, `difficulty`, `subtopics[]`, free-form notes, count.
- **Few-shot exemplars** — three hand-curated gold examples in `data/seed-exemplars.json`. Once the approved bank is populated, the exemplars module swaps these for in-bank examples.
- **Dedup** — exact-match content hash. Will move to embedding similarity once any (subject, difficulty) bucket exceeds ~100 approved questions.
- **Review queue** — generated questions land with `status='pending'`. The critic adds structured `critic_notes` (correctness, ambiguity, distractor quality) shown alongside the question in the admin review UI. The critic does not auto-reject.
- **Where the code lives** — `lib/generator/` as a pure TypeScript module, wrapped first by a CLI script (`scripts/seed-questions-ai.ts`) and later by an API route.

Current status:
- ✅ SDK + env scaffolding
- ✅ `data/subjects.json` updated with Data Analysis (test subject) + 6 subtopics
- ⏳ `data/seed-exemplars.json`
- ⏳ `supabase/migrations/002_question_review_pipeline.sql` (file pending commit; DB may already be migrated)
- ⏳ `lib/generator/` module
- ⏳ Admin generation form + review queue UI

### Phase 3 — Scale (planned)
- Move generator behind an API route with a job-queue (no Vercel timeout risk).
- Embedding-based dedup once the bank grows.
- Upgrade the critic to selectively auto-reject once we trust its calibration.
- Generator-prompt evolution: dynamic in-subject exemplars drawn from the approved bank.

---

## Useful references

- `CLAUDE.md` — design-fidelity rules.
- `AGENTS.md` — Next.js 16 agent rules.
- `PLAN.md` — Phase 1 build log.
- `docs/authoring-guide.md` — manual question authoring conventions.
- `supabase/migrations/` — DDL truth.
- `types/index.ts` — all shared TypeScript types.