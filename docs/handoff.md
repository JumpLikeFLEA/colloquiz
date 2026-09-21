# Handoff — purpose, audience, scope

Read this before any design decision. It holds why both surfaces exist, who
they are for, what is deliberately out of scope, and the failure modes this
project has already identified.

Status: M0 (foundations & item engine) complete — the five item types score
under test, `/app` carries Colloquiz (decision 0005), and a demo player
exists. M1 is being scoped. Update this file in the same commit as any work
that contradicts it.

## Product thesis

**The goal is to entertain learners with language, not to teach them the
language as a whole.** This is a positioning statement, not a scope cut, and
it settles a class of arguments before they start: no spaced repetition, no
placement test, no comprehensive curriculum, no long-term retention model.
A learner who finishes a course in a week and never returns is a SUCCESS, not
churn. Completion is the product; retention is not.

The consequence is a content treadmill: revenue tracks new courses shipped
rather than accumulated users. Be deliberate about that rather than surprised
by it.

Anything proposed on the grounds that "a real language-learning app would…"
is out of scope by definition. This is not one.

## The two surfaces

**Colloquiz** — a general quiz platform. 16 subjects, Quick Play / Deep Dive /
My Quizzes / Groups / Duels / Leaderboard / Achievements, XP progression, an
AI question-generation pipeline behind an admin review queue. Public signup,
free, no payment. This surface is established; its conventions are in
`CLAUDE.md` and `docs/ui-decisions.md`.

**English mini-courses** — a catalogue of short English courses for a
Russian-speaking audience at A2–B1–B2, built with a partner who authors the
content and promotes it through her social media. Its own landing page, free
content readable without registration, paid content behind a merchant-of-record
checkout.

**One domain: colloquiz.app, already owned.** There is no second hostname and
no hostname rewrite — an earlier plan assumed one and is superseded. The
English platform is the PRIMARY surface on that domain. Colloquiz is secondary,
reached through a toggle, and is not what a first-time visitor sees.

One Next.js app, one Supabase project, one account per person.

`/` is the English landing. Colloquiz lives under `/app` (SHELL-001, decision
0005), so the English surface owns the clean URLs.

## Course and lesson shape

- A course is **3–8 lessons**. 5–8 is the norm; 3–4 exists so a learner is not
  faced with a month of work.
- A lesson is **10–15 minutes**. Not 5 — that is too short to teach anything.
- A whole course is **roughly an hour of work, finished within a week**.
- Structure inside a lesson is **short theory block, then a couple of
  exercises, repeated** — not all theory then all practice.
- Subject matter **varies by course**: some mix grammar, vocabulary, phrases
  and listening; some are vocabulary + listening only; some are pure grammar.
  Nothing may assume a fixed lesson composition.
- **Video is decorative in v1** — a YouTube block inside theory, never
  required to score an item. A lesson must be completable without watching it.
- Course → lesson. **Two levels, nothing between them.**

**Launch bar: one finished course.** One exists today, two more are coming.
The catalogue does not need to look full before the first learners arrive.

## Entitlement and access

**Entitlement is course-level.** Buying a course opens all of its lessons
immediately. There is no per-lesson purchase and no drip release.

- **No locks and no forced order.** A learner may start at the last lesson,
  jump around, and skip. The reel that brought them may have been about lesson
  4; sending them to lesson 1 loses them.
- The per-lesson `access` flag has exactly ONE job: **is this lesson part of
  the free sample?** It is not a general-purpose lock. Name it so nobody
  mistakes it for one.
- **Preview, precisely:** title, description and item count are visible for
  every lesson, including paid ones. Free-sample lessons are fully playable.
  Everything else opens on purchase. Partial play of a paid lesson is
  deliberately NOT built — it costs more and weakens the sample.
- **Author intent is frozen into data, not recomputed.** Which lessons are in
  the free sample is an explicit flag set at publish time, never derived live
  from lesson ordinals.
- **Entitlement is decided in one place** — a single SQL function that both
  RLS and the UI call. See `CLAUDE.md`, standing rules.

## Scoring and progress

- **Nothing demotivates the learner.** 8 of 10 correct is 80%, counted as
  progress — not a failed item. Every mistake gets an explanation.
- **One attempt is sufficient.** Retakes are optional, never required. A
  learner may get an item wrong, see why, and move on. Nothing blocks progress
  on a wrong answer.
- **Display the best score, always.** Every attempt is stored; the best is
  what is shown. A retake can never lower a visible number.
- **Course progress is TWO numbers, never blended into one:** lessons
  attempted out of total, and the average score across ATTEMPTED lessons only.
  A single blended percentage punishes a learner for lessons they have not
  reached yet, which contradicts the principle above.
  - Candidate presentation, postponed to the catalogue-card work: a ring for
    completion with the average inside it. Recorded, not decided.
- **Completion** = every lesson attempted at least once. Not "every lesson
  passed" — there is no passing score.

## Performance boundary

**A visitor arriving on the English surface must not download Colloquiz.**
This is a hard requirement, not an optimisation to revisit — the audience
arrives from a phone, from a social video, on whatever connection they have,
and the first lesson has to start before they lose interest.

What it means concretely:

- The root layout stays minimal. Anything belonging to the signed-in Colloquiz
  shell — `AppSidebar`, `NotificationBell`, `DuelRealtime` and its realtime
  subscription, the duel action-needed badge — lives in the Colloquiz route
  group's layout, never above it. `DuelRealtime` is already scoped this way;
  do not lift it.
- Heavy Colloquiz dependencies must not appear in an English route's bundle:
  Recharts (Progress charts), KaTeX (course maths), and any Framer Motion the
  English surface doesn't itself use. KaTeX in particular is for Colloquiz
  Calculus, not for English.
- The landing and the free lesson render WITHOUT an authenticated Supabase
  session, so an anonymous visitor pays for no auth round trip and no
  `@supabase/ssr` client JS on the critical path.
- **This is enforced as an acceptance criterion, with a number.** Every M2
  card that adds an English route states the First Load JS budget for that
  route and shows the `next build` output proving it. A budget with no
  printed figure behind it is not evidence.
- One Tailwind build serves both surfaces, so the stylesheet is shared and
  that is accepted — CSS is small next to JS. Do not split the build to chase
  it.

## Audience and language

- Learners at A2–B1–B2 who want to study English with minimal effort.
- Russian-speaking, and **mostly resident outside Russia**. Some are inside.
- **Russian is for course CONTENT — explanations, instructions, theory.** The
  interface chrome is not translated wholesale; only what the learner reads
  as part of a lesson. Do not build a full i18n layer on this basis alone.
- They arrive from an Instagram reel. The path from that tap to a playable
  lesson must have no extra clicks: no signup wall, no interstitial, no
  "choose your level" gate before anything happens.
- **Anonymous play is a launch requirement, not a later addition.** The first
  lesson is playable with no account; progress lives in localStorage until
  registration, then migrates. Registration is offered AFTER a completed
  lesson, never before one. Consequence: free content cannot live behind
  enrollment-gated RLS — it needs a genuinely public read path.

## Authoring

- **The partner is not technical. PDF is her source format.** She cannot be
  expected to write JSON or Markdown in a defined shape, so a comfortable
  editing UI is not optional — without it the milestone bar ("the partner can
  publish a lesson without Gleb") is not met and Gleb becomes the bottleneck.
- **The database is canonical, never the PDF.** PDFs are an IMPORT format.
  The importer creates DRAFTS; a human publishes. Nothing reads content from a
  file at runtime.
- **Preview is must-have.** An author who cannot see the learner's view will
  publish broken lessons. This is why a player lands in M1 rather than M2 —
  see "Milestones".
- **One author today, but content carries an author id from day one.** It is
  one column and it is free now; retrofitting ownership later is not.

## Content ownership

- **The content is the partner's.** This is agreed, and it constrains the
  schema now rather than at export time: items stored in a shape that only
  this player can render are not exportable in any useful sense. Export means
  a readable document PLUS the raw data — decided in M1 when the storage shape
  is chosen, delivered in M4.
- **Anyone who has paid keeps access to what they bought, indefinitely**,
  regardless of what happens to the partnership. This is a promise to
  customers, not an internal arrangement, and it must survive any separation.
- Content derived from her material — LLM-drafted items she then edited — is
  hers on the same terms.

## Item types

Five primitives, one registry (`lib/items/`), one scoring contract:

| type | shape | notes |
|---|---|---|
| `selection` | one response | MCQ single, MCQ multi, True/False |
| `selection_grid` | N statements, one choice each | inline True/False |
| `ordering` | permutation of N elements | sequencing; drag is the affordance |
| `matching` | set of pairs | image matching is the same type, image renderer |
| `slots` | N gaps, each with accepted answers | cloze, word insertion; `input: 'typed' \| 'drag'` |

Drag-and-drop is an INPUT AFFORDANCE, not a type. Dragging a chip into a gap
and typing into it score identically.

Every item returns `{ earned, possible, subResults[] }`. Lesson score is
`Σearned / Σpossible`. The denominator is constant because English lessons are
fixed authored sequences — the same items in the same order for every learner.
This is what distinguishes them from Colloquiz course stage checks, which draw
from a pool and therefore fix the denominator in config instead.

Video and images are THEORY BLOCKS, not item types; they extend the existing
`TheoryBlock` union.

`free_text` is deferred. It cannot be auto-scored; it enters as a sixth type
implementing the same interface once LLM grading is built. If accommodating it
requires changing the interface, the abstraction was wrong.

Per-type scoring and normalisation decisions are settled in
`docs/decisions/0008`–`0015`. Read those before changing any scoring
behaviour.

## Visual work — when it happens

"Visuals" is three different things with three different right-times. Lumping
them is what makes the question hard.

1. **Token hygiene — deprioritised, not dropped (decided with the M1 card set,
   2026-09-21).** The Phase 1 M1 audit re-derived the hex-literal count from
   `rg` and got a different number than the one previously recorded here
   (see SHELL-003, which replaces any figure in this file or CLAUDE.md with
   the exact command that produced it), and found no citation anywhere for
   the "three known `.dark` bugs" claim. Un-cited claims do not get ranked
   first in a milestone. Two cards carry this instead: SHELL-003 holds the
   line at normal M1 priority — CI fails on a new hex literal under `app/` or
   `lib/` outside an explicit allow-list, so the debt stops growing without a
   big-bang migration of the existing literals. SHELL-004 is a low-priority
   spike, blocking nothing, that finds and fixes any genuine `.dark` token
   gap and either substantiates the "three bugs" claim (filing real ones as
   their own cards) or strikes it. **Do NOT migrate the existing hex
   literals** as a batch — that is a big-bang commit with no user-visible
   payoff; the goal is to stop the debt growing, not to pay it off.
2. **Item interaction design — inside M1, with the player.** How a matching
   item lays out, how a drag target behaves on a phone, what a wrong slot
   looks like. This is whether the item WORKS, not how it looks; an unusably
   cramped matching grid is broken, not ugly. Deferring it means building the
   player twice. The M1 player gets real interaction design and deliberately
   mediocre aesthetics.
3. **Brand and aesthetic polish — end of M2.** Typography, illustration, the
   look of the thing. Nothing about it gets cheaper by happening early.

**The landing page is the exception inside (3) and is built once, late in M2.**
It is the one page where visual quality IS the function — it exists solely to
convert a stranger arriving from a reel. A plain placeholder shipped early
would meet the first cohort of reel traffic, which is the traffic that matters
most. Do not build a placeholder landing page.

## Payments

- **Stripe does not support businesses in Serbia.** This is settled, not worth
  re-researching.
- The route is a **merchant of record** — the MoR is the seller, so Stripe
  Payments need not be available here; payouts reach Serbia through Stripe
  Connect Express. Polar and Paddle are the two candidates; the choice is an
  M3 `type:decision` card.
- An MoR also absorbs EU VAT liability, which matters for an audience spread
  across the EU.
- **Russia-resident learners cannot pay through this rail at all** — every MoR
  blocks sanctioned countries. This is a known gap, deliberately unsolved in
  v1, and must not be papered over with a half-built alternative rail.
- Ship free before paid. M2 precedes M3 so a launch does not depend on a
  payment provider approving a Serbian entity.

## Milestones

- **M0 — foundations & item engine.** Complete.
- **M1 — content & authoring.** Bar: the partner can publish a lesson without
  Gleb. **Includes a lesson player**, because preview is must-have and an
  author cannot publish what she cannot see. M2 therefore WRAPS a player
  rather than building one.
- **M2 — public surface.** Anonymous play, the reel-to-lesson path, the
  landing page, the performance budgets. **Anonymous play is required for
  launch** — an earlier proposal to split M2 and ship first to known students
  without it was considered and rejected.
- **M3 — monetisation.**
- **M4 — progression & polish**, including content export.

## Deliberately out of scope for v1

- **Spaced repetition and mistake-based review.** Not a deferral for capacity
  reasons — it does not fit. A course is ~1 hour of work finished in a week;
  SRS only earns its keep in long-term comprehensive learning. Adding it would
  turn this into a language-learning app, which it is not. See "Product
  thesis".
- LLM grading of free writing.
- XP, leaderboards or achievements for English courses — English gets its own
  progression, separate from Colloquiz XP.
- Full interface translation.
- Partial play of paid lessons.
- A payment rail reaching Russia-resident learners.
- Account deletion redesign (the six-FK problem — see `docs/adr/0002`).

## Failure modes identified

- **Ordinal-derived free samples.** If "free" means "first N by position",
  reordering or inserting a lesson silently flips a lesson out of the sample
  and revokes access someone was mid-way through. Explicit flags do not have
  this problem; ordinals do.
- **UI and RLS deciding entitlement separately.** They will disagree, and the
  direction they disagree in is paid content served for free.
- **Per-sub-response explanations are an authoring burden, not a code one.** A
  10-row inline True/False needs 10 explanations. The partner must know this
  before she designs around the item type.
- **PDF treated as the source of truth.** Anything that reads content from a
  file at runtime instead of from the database re-introduces this.
- **Content stored in a shape only this player can render.** It makes the
  ownership agreement unhonourable at export time, and the cost lands in M1's
  schema choices, not in M4.
- **A check that passes on an empty result.** Particularly the anonymous read
  path and the entitlement function: a policy test against an empty table
  proves nothing.
- **No forcing function.** This project starts without hard commitments. The
  partner's audience is the nearest thing to a deadline; the board is the
  nearest thing to a plan.

## Open questions

- Branding: **for now the English platform is simply Colloquiz.** Whether it
  eventually carries a sub-brand or its own name on the same domain is
  deliberately deferred — it is a naming decision, not a blocker, and nothing
  in the build should assume a rename is coming.
- How Colloquiz is reached from the English surface — a toggle, a footer link,
  a nav entry — and whether a signed-in Colloquiz user lands on `/` or on
  their Colloquiz home.
- The partner's role beyond content and promotion — revenue split, capital,
  whether this stays one codebase under one owner. Named as valid, not yet
  answered. Content ownership and purchaser access ARE settled; the commercial
  split is not.
- Polar vs Paddle (M3 `type:decision`).
- Pricing model: per-course purchase, bundle, or subscription.
- The six M1 content-model decisions — reuse or replace the Colloquiz course
  schema, where items live, import format, publish semantics, bilingual
  content shape, minimum authoring UI. Blocked on the M1 audit; see
  `prompts/m1-backlog.md`.