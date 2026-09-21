<!-- Scratch prompt for scoping the M1 board. Delete this file once the M1
     track (all M1 cards) reaches Done — it is staging, not a durable doc. -->

Superseded after Phase 3 by docs/decisions/0018 and backlog.mjs.

# Prompt — fill the board with M1 (content & authoring)

Paste into Claude Code in the Colloquiz repo, with the updated
`docs/handoff.md` committed.

**Checkpointed, four phases, three hard stops.** Do NOT run with
`--no-approval`. Phases 1 and 2 write nothing at all; phase 3 writes
`backlog.mjs`; phase 4 writes to the live board.

M1's bar, from `backlog.mjs`: **the partner can publish a lesson without
Gleb.** Every card is judged against that sentence.

Read `docs/handoff.md` first, in full. The product model is SETTLED there —
course and lesson shape, course-level entitlement, no locks, scoring and
progress rules, content ownership, the product thesis, and when visual work
happens. **Do not re-open any of it.** If a phase-1 finding contradicts it,
say so and stop; that is a conversation, not a card.

Six content-model decisions are deliberately unmade. Inventing them inside a
backlog file is the failure this staging exists to prevent.

---

## Phase 1 — audit the ground, then STOP

Report what EXISTS. Write nothing. Cite migration numbers and file paths for
every claim; an assertion with no pointer is an assumption and gets labelled
as one.

1. **The Colloquiz courses schema.** Read migration 028 and anything after it
   touching courses. For each table (`courses`, `course_stages`,
   `course_stage_theory`, `course_enrollments`, `course_stage_progress`,
   `course_variant_seen`, `course_check_attempts`) report columns, purpose,
   and **whether any row exists in it today, with counts and how you obtained
   them.** A schema nobody has used is a completely different reuse
   proposition from one carrying live Calculus data. If the database is
   unreachable, say so and do not estimate.
2. **`questions`.** The course columns (`course_stage_id`, `variant_group`,
   `variant_ordinal`, `authored_key`, the widened `visibility` CHECK), the
   `visibility` values actually in use, and how `lib/scoring.ts` scores a
   question today.
3. **The entitlement seam.** What `courses.access` and `course_enrollments`
   do today, what reads them, what RLS depends on them. Note that handoff now
   fixes entitlement at COURSE level — report whether the seam already
   matches that or assumes something finer.
4. **`scripts/import-course.ts` and `lib/courseContent.ts`** — do they exist?
   What format do they accept, what does `authored_key` idempotency key on,
   and what happens on re-import of a changed item?
5. **`TheoryBlock`** — the current union, where defined, what renders it,
   whether `RichText`/KaTeX is wired in.
6. **The M0 demo player (ITEM-010) and the `lib/items/` registry as built.**
   What exists, how the five renderers are structured, and how much of it is
   reusable for a real lesson player. M1's player inherits from this rather
   than starting over, so be concrete about what would have to be rewritten.
   Read decisions 0006–0015 and summarise what they constrain.
7. **Admin surfaces that already exist** — review queue, quiz builder. What
   can a non-Gleb admin do today without touching SQL? This sets the floor for
   how much authoring UI M1 must build.
8. **Design token state.** Confirm or correct the recorded numbers (461 hex
   literals / 48 values / 644 palette classes with no `dark:` variant) and the
   three known `.dark` bugs, and whether `--brand`/`--brand-subtle` are still
   absent from `.dark`. Counts come from printed output.
9. **Anything half-built** — planned, partially applied, or written and never
   run. Name it. Half-built is the most expensive thing to discover mid-card.

Then STOP.

## Phase 2 — the six decisions, options only, then STOP

For each: options with real costs grounded in phase 1, a recommendation, and
what would make us revisit it. **Decide nothing.** These come back to chat.

1. **Reuse or replace.** Does an English course reuse `courses` /
   `course_stages` / `course_enrollments`, or get its own tables? Colloquiz's
   schema was built for pool-drawn stage checks with variant groups and review
   slots; English lessons are fixed authored sequences with partial credit, no
   locks, and course-level entitlement. Name what reuse would force English to
   carry, and what replacement would duplicate — enrollment and progress being
   the obvious duplication.
2. **Where items live.** Five typed JSON payloads: extend `questions`, or a
   new table? Note the effect on Quick Play, `sampleQuestions()`,
   `get_subject_stats()` and the `visibility='shared'` filter — Quick Play
   stays untouched, that is a standing rule. **Also weigh exportability:**
   handoff commits to the content being the partner's and exportable as a
   readable document plus raw data. A storage shape only this player can
   render breaks that promise, and the cost lands here, not in M4.
3. **Import format.** She is not technical and PDF is her source. Options run
   from "PDF through an LLM pass into draft items" to "she writes in a defined
   Markdown shape" (which handoff rules out as a primary path). Be concrete
   about what a PDF with tables and images actually yields and what fails
   silently. The importer creates DRAFTS and never publishes — settled, do not
   re-open.
4. **Publish semantics.** What happens to a learner mid-lesson when a
   published lesson is edited? Immutable published versions, edit-in-place and
   accept the seam, or copy-on-write. State what a learner sees in the bad
   case for whichever you recommend.
5. **Bilingual content shape.** Russian is for lesson content, not chrome.
   Separate `*_ru` columns, a JSONB locale map, or freeform text the author
   writes in whichever language fits? Say which survives a second target
   language later, which does not, and whether that is worth paying for now
   given the product thesis.
6. **Minimum authoring UI.** Given phase 1 items 6 and 7, what is the smallest
   set of screens that clears the milestone bar? Must-have versus
   want-to-have. Say which item types are hardest to build an editor for
   (`matching` and `slots` are the likely answers) and what the preview
   requires from the M1 player.

Then STOP. Do not proceed without answers.

## Phase 3 — write the cards, then STOP

Only after the six come back answered.

Add M1 cards to `CARDS` in `scripts/board/backlog.mjs`, keeping the existing
shape (`key`, `title`, `milestone: 'M1'`, `epic`, `type`, `rank`, `dependsOn`,
`goal`, `acceptance`, optional `notes`).

- Epics: `CNT` (content model and importer), `AUTH` (authoring UI). **Propose
  adding `PLAY`** to `EPICS` for the lesson player — it is learner-facing and
  M2 inherits it, so it is neither content nor authoring. Token hygiene goes
  under `SHELL`.
- Ranks continue from M0's, spaced by 10. Do not renumber M0.
- `dependsOn` may reference M0 keys; several M1 cards genuinely depend on
  `ITEM-001`'s contract and `ITEM-009`'s explanation shape.
- Every unresolved judgement becomes a `type:decision` card rather than a
  guess inside a task card.
- Acceptance lines are checkable and produce evidence. House rules apply: a
  check that passes on an empty result is not evidence; counts are copied from
  printed output; a step touching `lib/` is verified by a test.
- Each phase-2 decision gets `docs/decisions/NNNN-<slug>.md` written in this
  phase, not deferred — the cards reference them.

M1 must contain, at minimum, cards covering:

- **Token hygiene (SHELL), ranked first in M1.** The CHEAP half only: add the
  missing `.dark` tokens, fix the three known `.dark` bugs, hold the line that
  new surfaces use tokens. **Explicitly NOT a migration of the existing 461
  literals** — say so in the card so a future session does not "finish the
  job".
- Schema + migration for whatever decision 1 and 2 settle.
- The importer, creating drafts only.
- The authoring UI, sized by decision 6.
- The lesson player, with real interaction design and deliberately mediocre
  aesthetics (handoff, "Visual work").
- Preview — the author seeing a lesson exactly as a learner would.
- One end-to-end card: **the finished course authored, imported, edited,
  previewed and published by the partner, not by Gleb.** This is the
  milestone's bar as a single verifiable card, and the evidence is her doing
  it, not a description of her being able to.

Then run the validation M0's data passed and show its output — duplicate keys,
duplicate ranks, dangling deps, M1 ordering, acceptance-line count.

Then STOP.

## Phase 4 — bootstrap the new cards

On approval: `--dry-run`, show it, then run for real.

**This is bootstrap's first incremental run.** Its previous runs created 14
from nothing and skipped 14 unchanged. This one must create M1 while leaving
every M0 card untouched — including M0 cards that have since moved to Done.

- Capture `board-status.mjs` output BEFORE bootstrapping. Without a before,
  "M0 unchanged" is unfalsifiable.
- The dry run names only M1 keys as created.
- The real run reports M1 created and M0 skipped, with counts.
- `board-status.mjs` afterwards shows every M0 card in the column it was in
  before.

## Stops that hold throughout

- Never push. Never apply a migration — M1 will produce at least one; it is
  written to `supabase/migrations/NNN_*.sql` and handed over.
- Do not contradict `docs/handoff.md`. If the audit suggests it is wrong, stop
  and say so.
- Do not edit M0 cards in `backlog.mjs` to make an M1 card fit.
- Do not decide any of the six, even where the audit makes one look obvious.
- Adding an npm dependency — a PDF parser, a Markdown parser, a rich-text
  editor — is a stop-and-ask, not a card-level choice.
