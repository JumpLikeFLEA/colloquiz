# Architecture (quiz platform)

Moved out of the README on 2026-09-26. It describes the Colloquiz quiz
platform and was written before the English mini-courses surface existed.

> **Partly out of date.** Known drift at the time of the move:
> - Colloquiz now lives under `/app` inside the `app/(colloquiz)/` route group
>   (decision 0005); `/` belongs to the English surface. The route paths below
>   predate that.
> - The migrations table stops at 013; `supabase/migrations/` now goes to 047.
> - `data/subjects.json` holds 20 subjects, not 19, and `PLAN.md` no longer exists.
> - The English surface (lesson player, course authoring, `lib/items`,
>   `lib/lessons`) is not covered here; see `docs/handoff.md` and
>   `docs/decisions/`.
>
> The folder-by-folder map is generated in the README by codemap.

## Stack

| Layer      | Choice                                                                     |
|------------|----------------------------------------------------------------------------|
| Framework  | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5               |
| Styling    | Tailwind CSS v4 · shadcn/ui · lucide-react · framer-motion · recharts       |
| Backend    | Supabase (Postgres + Auth + Row-Level Security) via `@supabase/ssr`         |
| LLM        | Anthropic SDK (`@anthropic-ai/sdk`) — question generator + critic           |
| Validation | zod                                                                        |
| Hosting    | Vercel (`vercel.json` pins region `dub1`)                                   |

The running app is the visual source of truth (the original `figma-export/` Vite + React +
Tailwind bundle was retired 2026-09-20; see `docs/ui-decisions.md`). New UI composes from
components and Tailwind classes already used elsewhere in the app, and colours come from
tokens in `app/globals.css`, never new hex literals. The one intentional deviation from the
original port is the body font (Geist via `next/font`).

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

## API routes

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

## Conventions

### Design fidelity (`CLAUDE.md`)
> The running app is the visual source of truth. New UI composes from components and Tailwind
> classes already used elsewhere in the app; colours come from tokens (`app/globals.css`),
> never new hex literals. A deliberate visual change to an existing surface is recorded in
> `docs/ui-decisions.md` in the same commit. See `CLAUDE.md` for the full list of decisions.

### Next.js 16 caveats (`AGENTS.md`)
This is **not** the Next.js most people remember — APIs, conventions, and file structure differ
(the middleware file is `proxy.ts`, dynamic-route `params` are async, etc.). Consult
`node_modules/next/dist/docs/` before writing route handlers, server components, or middleware.

### Tagging
`Subject.tags` and `Question.tags` are lowercase; `Subject.subtopics` are Title Case. The Deep
Dive wizard shows `subtopics` and writes the selection into `QuizFilter.tags`. Automated tagging
(AI generator, authored import) derives the tag from the subtopic via `slugifyForTag`.

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
