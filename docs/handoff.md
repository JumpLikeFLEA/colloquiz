# Handoff — purpose, audience, scope

Read this before any design decision. It holds why both surfaces exist, who
they are for, what is deliberately out of scope, and the failure modes this
project has already identified.

Status: written 2026-09-20 at the start of the English-courses planning. The
Colloquiz half is established and shipping; the English half is planned and
not yet built. Update this file in the same commit as any work that
contradicts it.

## The two surfaces

**Colloquiz** — a general quiz platform. 16 subjects, Quick Play / Deep Dive /
My Quizzes / Groups / Duels / Leaderboard / Achievements, XP progression, an
AI question-generation pipeline behind an admin review queue. Public signup,
free, no payment. This surface is established; its conventions are in
`CLAUDE.md` and `docs/ui-decisions.md`.

**English mini-courses** — a catalogue of short English courses for a
Russian-speaking audience at A2–B1–B2, built with a partner who authors the
content and promotes it through her social media. Its own landing page, its
own domain, free content readable without registration, paid content behind a
merchant-of-record checkout.

One Next.js app, one Supabase project, one account per person. The English
surface is reached by hostname rewrite in `proxy.ts`, not a path prefix.
Colloquiz remains available but becomes the secondary surface on the English
domain.

## Audience and language

- Learners at A2–B1–B2 who want to study English with minimal effort.
- Russian-speaking, and **mostly resident outside Russia**. Some are inside.
- **Russian is for course CONTENT — explanations, instructions, theory.** The
  interface chrome is not translated wholesale; only what the learner reads
  as part of a lesson. Do not build a full i18n layer on this basis alone.
- They arrive from an Instagram reel. The path from that tap to a playable
  lesson must have no extra clicks: no signup wall, no interstitial, no
  "choose your level" gate before anything happens.

## Principles

- **The first lesson is playable anonymously.** Progress lives in
  localStorage until the person registers, then migrates into the account.
  Registration is offered AFTER a completed lesson, never before one.
  Consequence: free content cannot live behind enrollment-gated RLS — it
  needs a genuinely public read path.
- **Nothing demotivates the learner.** 8 of 10 correct is 80%, counted as
  progress — not a failed item. Every mistake gets an explanation.
- **The database is canonical, never the PDF.** The partner's PDFs are an
  IMPORT format. The importer creates drafts; a human publishes.
- **Entitlement is decided in one place** — a single SQL function that both
  RLS and the UI call. See `CLAUDE.md`, standing rules.
- **Author intent is frozen into data, not recomputed.** Free/paid is an
  explicit per-lesson flag; `free_lesson_count` is a convenience default
  applied at publish time, never evaluated live against lesson ordinals.
- Ship free before paid. M2 (public surface) precedes M3 (monetisation) so a
  launch does not depend on a payment provider approving a Serbian entity.

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

## Deliberately out of scope for v1

- Spaced repetition and mistake-based review. Wanted, deferred to v1.x/v2.
- LLM grading of free writing.
- XP, leaderboards or achievements for English courses — English gets its own
  progression (stages complete + percentage), separate from Colloquiz XP.
- Full interface translation.
- A payment rail reaching Russia-resident learners.
- Account deletion redesign (the six-FK problem — see `docs/adr/0002`).

## Failure modes identified

- **Ordinal-derived free lessons.** If "free" means "first N by position",
  reordering or inserting a lesson silently flips a lesson from free to paid
  and revokes access someone was mid-way through. Explicit flags do not have
  this problem; ordinals do.
- **UI and RLS deciding entitlement separately.** They will disagree, and the
  direction they disagree in is paid content served for free.
- **Per-sub-response explanations are an authoring burden, not a code one.** A
  10-row inline True/False needs 10 explanations. The partner must know this
  before she designs around the item type.
- **PDF treated as the source of truth.** Anything that reads content from a
  file at runtime instead of from the database re-introduces this.
- **A check that passes on an empty result.** Particularly the anonymous read
  path and the entitlement function: a policy test against an empty table
  proves nothing.
- **No forcing function.** This project starts without hard commitments. The
  partner's audience is the nearest thing to a deadline; the board is the
  nearest thing to a plan.

## Open questions

- Domain for the English surface (not yet purchased; Colloquiz is
  colloquiz.app, bought at Porkbun).
- The partner's role beyond content and promotion — revenue split, capital,
  whether this stays one codebase under one owner. Named as valid, not yet
  answered.
- Polar vs Paddle (M3 `type:decision`).
- Whether Colloquiz collapses into a tab, a link, or a separate nav entry on
  the English domain.
- Pricing model: per-course purchase, bundle, or subscription.
