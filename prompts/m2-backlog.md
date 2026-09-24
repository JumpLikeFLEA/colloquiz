<!-- Scratch prompt for scoping the M2 board. Delete this file once the M2
     track (all M2 cards) reaches Done — it is staging, not a durable doc. -->

# Prompt — fill the board with M2 (public surface)

Paste into Claude Code in the Colloquiz repo. Put this file at
`prompts/m2-backlog.md` and commit it first. Also commit the `docs/handoff.md`
deltas listed at the end, in their own commit.

**Checkpointed: four phases, three hard stops.** Do NOT run with
`--no-approval`. Phases 1 and 2 write nothing at all. Phase 3 writes
`backlog.mjs`. Phase 4 writes to the live board.

M2's bar, from `backlog.mjs`: **a reel viewer can play a free lesson with no
account.** Every card is judged against that sentence.

Read `docs/handoff.md` first, in full, then decisions 0018, 0019, 0024, 0029
and 0038. **Do not re-open anything they settle.** If a phase-1 finding
contradicts them, say so and stop. That is a conversation, not a card.

---

## Settled inputs (owner, 2026-09-24): not up for re-litigation

1. **The first one or two courses are entirely free.** All their lessons have
   `in_free_sample = true`. In M2 the "paid, not entitled" state is
   unreachable in the UI, so its preview screen moves to M3 (PAY). The RLS
   denial path is still tested in M2, on seeded data.
2. **Traffic arrives two ways:**
   - The Instagram **bio link**, a single static URL, which points to `/`.
   - **Posts in a Telegram channel**, which can link to a course or a lesson.
   Both open inside an in-app browser. Telegram renders rich link previews,
   so per-page OG metadata is a real feature here, not polish.
3. **Minimal funnel analytics are in M2.**
4. **The English surface has a Russian-language landing page.** It belongs to
   Alliengll only; there is no Colloquiz landing page. The learner-facing
   chrome of the English surface (landing, catalogue, course page, player
   buttons, completion screen, signup offer) is Russian.
   - This is not an i18n layer. It is one surface written in one language:
     a single strings module, and no locale switching or library.
   - Authoring chrome stays English (0018 Decision 5).
5. **Course progress in M2 is the minimal version:** the two numbers as
   text. The ring stays deferred.
6. **The catalogue is course cards:** a cover image, the title and a short
   description. Tapping the cover opens a course page with the detailed
   information and the lesson list.
   - This needs catalogue fields that don't exist yet: a cover image and a
     short summary distinct from `description`. Those need a schema change
     plus authoring UI.
7. **Colloquiz is reachable only through a footer link.** Main content and
   navigation belong entirely to Alliengll:
   - to avoid distracting newcomers;
   - to keep Alliengll as lightweight as possible.
   Signed-in users land on `/` after login, not on `/app`.

Side track, outside the milestones: **INFRA** (storage, egress and hosting
plan). See the INFRA cards below. Self-hosting Postgres on AWS is explicitly
NOT the starting point; measurement is.

---

## Phase 1 — audit the ground, then STOP

Report what EXISTS. Write nothing. Cite a file path, a migration number or
command output for every claim. Anything without a pointer is labelled as an
assumption.

1. **Root layout weight.** List everything `app/layout.tsx` puts on every
   route: `ThemeProvider`, `Analytics`, `SpeedInsights`, the global
   `katex/dist/katex.min.css` import, fonts, `lang="en"`. Also say where
   Sentry's client SDK initialises (e.g. `instrumentation-client.ts`) and
   whether that is per-route or global.
2. **First Load JS today.** Run `next build` and print the table. Name the
   smallest route that exists today; it is the floor any English route starts
   from. This build writes only `.next/`. If even that is not allowed in your
   mode, say so and stop.
3. **Can the English surface have its own root layout?** Next.js supports
   several root layouts through route groups, each with its own `<html>`.
   Report:
   - what `app/not-found.tsx`, `app/global-error.tsx`, `app/opengraph-image.tsx`
     and the icons would need in that setup;
   - which root layout `(auth)` and `(legal)` would sit under;
   - whether navigating between the two roots causes a full reload.
   Verify against the installed Next version's docs or source, not memory.
4. **`proxy.ts`.** Exact-match `publicRoutes` and the unauthenticated bounce
   to `/login`: which English paths would it bounce today? Where do login,
   signup, OAuth callback and email confirmation send a user afterwards
   (every redirect target, with file and line)?
5. **`courses` columns as applied (041–045).** Is there any cover or summary
   field? What does the authoring UI (AUTH-001) edit today?
6. **Auth in in-app browsers.** Which OAuth providers `AuthScreen` offers.
   Whether email confirmation is required (Supabase auth settings, if
   visible from the repo; otherwise say it is unknown).
7. **`app/robots.ts` and the root `robots` metadata.** They disallow and
   noindex everything. Report whether Telegram's and Instagram's link-preview
   fetchers honour `robots.txt`. Cite the source, or label it unknown and
   leave it for SHELL-009 to test empirically.
8. **`bootstrap-board.mjs`.** Does it accept a card with no milestone (for
   the INFRA track)? If not, what is the smallest change? Do NOT make it;
   report it.
9. **Account export and deletion.** Which user-FK tables do
   `lib/accountExport.ts` and `lib/accountDelete.ts` cover? That is the list
   a new `lesson_attempts` table has to join (see `docs/adr/0002`).

**STOP.** Post the audit and wait.

---

## Phase 2 — challenge the draft cards below, then STOP

For each draft card: keep, merge, split or drop, with one line why. Flag any
acceptance line that:
- passes on an empty result;
- cannot be verified by the printed output it asks for;
- quietly decides something marked as a decision card.
Propose ranks. **STOP.**

## Phase 3 — write `backlog.mjs`, then STOP

Add the agreed cards to `scripts/board/backlog.mjs` in its existing shape
(`key`, `title`, `milestone`, `epic`, `type`, `rank`, `dependsOn`, `goal`,
`acceptance[]`, `notes`). If INFRA needs an epic entry, add it too. Show the
diff. Run `npm run check`. **STOP.**

## Phase 4 — bootstrap the board (ASK FIRST)

`node scripts/board/bootstrap-board.mjs`, then `board-status.mjs`. Paste both
outputs verbatim.

---

## Draft cards

Budgets: every card that adds an English route states its First Load JS
budget and pastes the `next build` line (or the OPS-006 output) proving it.

### A — Decisions and baseline

**SHELL-005 · type:decision · English URL scheme and the public-path rule**
- deps: none
- Options: `/c/[course]/[lesson]` vs `/courses/[course]/[lesson]`; whether a
  lesson slug is unique per course (043).
- Proxy: replace exact-match `publicRoutes` with a prefix rule for English
  paths. Also decide whether anonymous English requests skip the Supabase
  session refresh (server latency; no client JS either way).
- Inputs:
  - the bio link is `/`;
  - Telegram posts link to courses and lessons, so URLs must be short and
    stable, and must never change when a lesson is reordered.

**SHELL-006 · type:decision · The English surface gets its own root layout (or doesn't)**
- deps: none
- Evidence required: `next build` First Load JS for a stub English route under
  (a) the shared root layout and (b) its own root layout. Print both.
- The case for (b):
  - `<html lang="ru">`;
  - no `ThemeProvider` or katex CSS unless the English surface wants them;
  - the only cost is a full reload when crossing to Colloquiz, which is a
    footer link (settled input 7).
- Must resolve: not-found, global-error, OG image and icons for each root,
  and which root `(auth)` sits under.
- Records budgets for each English route kind (landing, course page,
  lesson) as the output of this card.

**ANON-001 · type:decision · Attempt storage and the anonymous→account migration**
- deps: none
- The problem this decision must solve, not only name: progress lives in the
  in-app browser's localStorage (Instagram or Telegram). The
  email-confirmation link usually opens in the system browser, whose storage
  is empty. So "migrate after registration" can find nothing.
- Options to compare:
  - (a) upload local attempts when the signup form is submitted;
  - (b) a claim token carried in `emailRedirectTo`;
  - (c) Supabase anonymous users, created lazily at lesson end so they stay
    off the critical path.
- Also settles:
  - the attempt record shape, keyed `(lesson_version_id, block_id)` per 0018;
  - that client-computed scores are accepted (0018: answer keys ship to the
    client; there is no English leaderboard), with the server capping
    `earned` at `possible`;
  - how "best score" behaves across republished versions.

**OPS-006 · Route budget guard**
- deps: SHELL-006
- `npm run budget` (kept out of `npm run check`, because builds are slow).
  It fails when an English route exceeds its recorded budget, or when its
  chunks contain `recharts`, `katex`, `framer-motion` or `@supabase/ssr`.
- Demonstrated failing once on a deliberate violation, then passing. Print
  both outputs.

### B — Surface, catalogue data and read path

**SHELL-007 · English route group, layout and Russian strings module**
- deps: SHELL-005, SHELL-006
- `app/(english)/` exists with its layout. The proxy lets its paths through
  anonymously. It has an English-surface not-found page.
- All learner-facing chrome strings live in one module (e.g.
  `lib/alliengll/copy.ts`), in Russian. Nothing selects a locale.
- A route under it renders with no Supabase session and no `@supabase/ssr`
  in its client chunks. Budget printed.

**SHELL-012 · English is the default surface; Colloquiz behind a footer link**
- deps: SHELL-007
- The English surface has its own lightweight navigation. `AppSidebar`,
  `NotificationBell` and `DuelRealtime` never appear in any English route
  (checked with `rg` against the English route group's imports, and in the
  build chunks).
- A footer link is the only way from the English surface to `/app`.
- After login, signup, the OAuth callback and email confirmation, a user
  lands on `/`, or on a safe `next` path when one was given. Every redirect
  target found in the phase-1 audit is covered.
- Existing Colloquiz entry points (duel invites, notifications, share links)
  still go to `/app`.

**CNT-009 · Catalogue fields: course cover and short summary**
- deps: none
- A migration (written, not applied) adds a cover-image reference and a
  short summary to `courses`. `description` stays as the long text on the
  course page.
- Decide inside the card and record it in a decision file:
  - the column names;
  - whether a published course requires a cover (NOT NULL at publish, like
    `level` in 042) or falls back to a placeholder;
  - which bucket covers live in (reuse `lesson-images` or a new one).
- Anonymous read of the new columns is verified on a seeded published course,
  and a draft course's fields stay invisible to anon.

**AUTH-007 · Authoring: edit summary, description and cover**
- deps: CNT-009, AUTH-004
- The partner can set a course's summary, long description and cover from
  the authoring UI, and replace the cover.
- Upload reuses the AUTH-004 path, limits and deferred-deletion rule (0037).
- The editor shows the catalogue card as it will render.

**PLAY-006 · Public lesson page**
- deps: SHELL-007
- The server reads the published version with the anon key and no session.
  `attemptId` is generated on the server (0029).
- A free lesson opens the player. An unpublished lesson returns 404. An
  invalid stored document shows a visible author error, not a crash.
- A paid lesson without entitlement renders nothing playable. In M2 this is
  a plain "not available" state; the real preview screen is M3.
- **Full protocol**, because this is the first public read path. Seed a free
  lesson, a paid lesson, a draft lesson and one entitlement row, then check
  anon, signed-in and entitled callers against each. Every result is
  printed. A check against empty tables is a failure.
- Budget printed.

**PLAY-007 · Lesson completion screen**
- deps: PLAY-006
- Shows the lesson score and the explanation review, plus a link to the next
  lesson (by ordinal, never forced).
- Has a slot for the registration offer (ANON-004).
- Nothing on it blocks, and nothing says "failed" (handoff: scoring).
- Russian chrome.

**SHELL-008 · Course page (the target of a catalogue card)**
- deps: SHELL-007, CNT-009
- Shows the cover, title, level and long description.
- Lesson list: title, description, item count, `estimated_minutes`, and the
  learner's best score where one exists.
- One tap from this page to the first free lesson. No locks and no forced
  order.
- Course progress is the two numbers as text (lessons attempted / total;
  average over attempted lessons only), never blended into one.
- Budget printed.

### C — Anonymous play and accounts

**ANON-002 · localStorage attempt store (`lib/`)**
- deps: ANON-001
- A versioned schema, as decided in ANON-001.
- Keeps the best score and never lowers a visible number.
- Never throws: when storage is unavailable or full, it falls back to
  memory. Tested under `lib/`, including an unparseable and an old-version
  payload.

**ANON-003 · `lesson_attempts` table and record RPC**
- deps: ANON-001
- Migration written, not applied. The RPC is SECURITY DEFINER, checks
  `can_read_lesson` for each attempt, and caps `earned` at `possible`.
- The table is added to account export and account deletion. **Full
  protocol, on seeded rows:** export contains them, and deletion removes
  them.

**ANON-004 · Registration offer and progress migration**
- deps: ANON-002, ANON-003, PLAY-007, SHELL-012
- Shown after a completed lesson, never before one.
- The signup form on the English surface is in Russian and returns to the
  lesson.
- Local attempts reach the account via the mechanism ANON-001 chose.
  Demonstrated end to end in the cross-browser case: play in browser A,
  confirm the email in browser B, and the attempts are visible in B.
- OAuth buttons are hidden, or come with a warning, inside in-app browsers.
  Google rejects OAuth in embedded webviews; this is verified on a device in
  OPS-007, not assumed.

**ANON-005 · Signed-in learners record attempts directly**
- deps: ANON-003, PLAY-006
- A signed-in learner's completed lesson writes a `lesson_attempts` row, and
  the course page shows their best score from the server.

### D — Launch surface

**SHELL-009 · Per-page share metadata (OG) for Telegram**
- deps: SHELL-008, CNT-009
- Course and lesson pages carry a Russian title, a description and the
  course cover as the OG image.
- A real Telegram post of each URL type shows a rich preview (screenshot
  attached).
- If `robots.ts` blocks the preview fetcher, the card says so with
  evidence and proposes the smallest fix, as a separate card.

**OPS-008 · Minimal funnel events**
- deps: SHELL-007
- Record the choice inside the card: a first-party events table through a
  route handler, or Vercel custom events (check the plan they require).
- Four events: landing view, lesson start, lesson complete, signup. Each
  records its source (`utm_source` or referrer: instagram, telegram, direct).
- A privacy-page change goes in the same commit if the chosen route adds a
  processor or a new category of data.
- Shown firing once each on a preview deployment.

**OPS-007 · Spike: devices inside the Instagram and Telegram in-app browsers**
- deps: PLAY-006 (and ANON-004 for its last row)
- The matrix covers iOS and Android × Instagram and Telegram:
  - every item type, with dnd-kit drag against page scrolling;
  - inline inputs with the on-screen keyboard;
  - whether localStorage survives closing and reopening the in-app browser;
  - the signup → email-confirm round trip;
  - whether the OAuth buttons work.
- Recorded as a table in a decision file. Every failure becomes a proposed
  card.

**SHELL-010 · Russian landing page with the catalogue (built once, late)**
- deps: SHELL-008, AUTH-007, SHELL-009, and the partner's copy and visuals
  (a named external dependency)
- A hero section, then a catalogue of course cards (cover, title, summary).
  Tapping a card opens its course page.
- From the bio link to the first free lesson takes at most one tap after
  `/` loads.
- Budget printed. No placeholder version ships before this card (handoff:
  "Do not build a placeholder landing page").

**SHELL-011 · Visual polish pass on the English surface**
- deps: SHELL-010
- Typography, spacing and the player's look (handoff, Visual work §3).
- Every deliberate change has an entry in `ui-decisions.md`, and every
  colour is a token.

**OPS-009 · Legal copy changes**
- deps: ANON-003, OPS-008
- The privacy page covers lesson attempts, localStorage progress and the
  analytics events.
- Open question, recorded rather than decided: do the legal pages need a
  Russian version for this audience?

**OPS-010 · Launch rehearsal (M2 exit)**
- deps: everything above
- On production:
  - tap the bio link and a Telegram post on a real phone;
  - play a free lesson anonymously;
  - register and see the progress carried over.
- The production `next build` budget table is pasted. The first course is
  published and all its lessons are free (settled input 1), with counts
  printed.

---

## INFRA — outside the milestones

**INFRA-001 · Measure storage, egress and plan**
- Print the database size, each bucket's size, monthly egress, and the
  Supabase plan.
- On the free plan, record the inactivity-pause behaviour as a launch risk.
- Set trigger thresholds (e.g. 60% of any limit) that open INFRA-003.
- Must run before OPS-010.

**INFRA-002 · Resize and convert images at upload**
- Lesson images and covers are resized to a maximum width and converted to
  WebP on upload.
- Before/after byte sizes for the existing bucket contents are printed.
- New npm dependency (e.g. `sharp`), so stop and ask.

**INFRA-003 · type:decision · Storage and hosting when a threshold fires**
- Opened only by INFRA-001's trigger.
- Options, in order: upgrade the Supabase plan; move images to an
  egress-free object store; self-host.
- Self-hosting costs rebuilding auth, RLS roles (`auth.uid()`, `anon`,
  `authenticated`), PostgREST and Storage. That cost is stated with evidence.
- Local Docker Postgres already exists through the Supabase CLI
  (`supabase start`), so "easier local testing" is not an argument for it.

---

## `docs/handoff.md` deltas (commit before phase 1)

- Status line: M1 is closing, and M2 is being scoped.
- The English surface's learner-facing chrome is Russian, as one surface in
  one language, not a translated UI. This replaces "The interface chrome is
  not translated wholesale" for the English surface. Colloquiz and authoring
  chrome stay English.
- Open question answered: Colloquiz is reached only through a footer link,
  and signed-in users land on `/`.
- Open question answered: the first one or two courses are entirely free.
- Traffic: Instagram bio link → `/`; Telegram channel posts → courses and
  lessons.
- The catalogue shape: course cards (cover, title, summary) → course page.
- M2 includes minimal funnel analytics and minimal course progress (text).
