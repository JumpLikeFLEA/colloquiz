# 0026 — CNT-005: conversion marker lives on the block, not the item envelope

**Note (2026-09-22, `docs/decisions/0028`):** `scripts/draft-lesson.ts`, the
code this decision describes, was later deleted — drafting moved to a chat
session (0028). The `convertedFrom` field on `LessonPracticeBlock`
(`lib/lessons/parseLessonDocument.ts`) and the double-marking rule are
UNCHANGED and still enforced by `parseLessonDocument`; only the producer of
`document` blocks (script vs. chat session) changed. This decision's
reasoning stays accurate for the code it touched; read 0028 for the current
shape of CNT-005.

## Context

`docs/decisions/0022` Decision 6 requires drafting to "mark each converted
block for the partner's review, because it changes her exercise design."
`scripts/draft-lesson.ts` only ever wrote that mark into `qaNotes`, which
lands in the `authored/courses/<slug>.qa.md` sidecar — a file the importer
never reads and the database never stores. The block itself, in the JSON
that gets imported and that any future editor would open, carried no marker,
so a converted exercise was indistinguishable from an unconverted one at the
one place the partner actually reviews content.

Three options were laid out (a: keep the sidecar only; b: an optional field
on the block, either at the item-envelope layer or the lesson-document block
layer; c: a separate keyed sidecar the editor loads alongside the document).

Decided by the owner on 2026-09-22: option (b), scoped to the lesson-document
block layer.

## Decision — `convertedFrom` on `LessonPracticeBlock`, not on `ItemEnvelopeSchema`

`lib/lessons/parseLessonDocument.ts` gains an optional `convertedFrom?:
string` on `LessonPracticeBlock`, read directly off the raw block and
validated (non-empty string when present) one layer above `parseItem`.
`ItemEnvelopeSchema`, the `Item` type, and all five item type modules'
`parse()` reconstructions (`lib/items/{selection,selectionGrid,ordering,
matching,slots}.ts`) are untouched.

**Why the block layer and not the item envelope:** conversion provenance is
an authoring fact about how the block came to be, not a fact the scoring
contract needs. Widening `ItemEnvelopeSchema` would have required touching
all five type modules' `parse()` (each currently reconstructs exactly `{id,
type, payload}`, nothing more) to thread the field through, putting an
authoring-only concern inside the interface `docs/handoff.md` protects for
exactly this reason: "if accommodating it requires changing the interface,
the abstraction was wrong" (said there of `free_text`, the same shape of
argument applies here). The block layer already distinguishes theory from
practice for reasons unrelated to scoring (`kind`), so it is the natural
place for a second authoring-only fact to live without touching the item
contract at all.

**Why theory blocks are unaffected:** all three conversions 0022 Decision 6
names (sentence-selection, spot-the-error, correct-the-paragraph) produce
practice items (`selection`, `selection_grid`/multi-select, `slots`). Theory
blocks stay `z.strictObject` with no new field, so none of the nine theory
schemas needed touching.

**Why capture is one-shot.** The field is set only by `draft-lesson.ts` at
drafting time and carried through unchanged by `parseLessonDocument` and
`import-lesson.ts` (which persists `parseLessonDocument`'s returned document
verbatim into `lesson_versions.document` — see `validateDocuments()` and the
insert call at `document: documents.get(lesson.slug)`). Nothing recomputes
or re-derives it, and nothing currently lets the partner edit a block in
place — once she saves over the imported draft through some future editor
(`source: 'editor'` per `docs/decisions/0018`'s `lesson_versions` design),
whatever that save path writes back is authoritative and there is no
mechanism proposed here to preserve or regenerate `convertedFrom` across
that edit. If the block is materially rewritten, the marker may no longer
describe what's on screen. This is accepted for now because the alternative
— deriving or re-checking it — has no design yet and isn't this card's job.

**Why no editor renders it yet.** AUTH-001 as it exists today
(`app/(main)/app/admin/courses/**`) is course/lesson-list and metadata only;
there is no block-level lesson-document editor. `convertedFrom` is the
durable record surviving in `lesson_versions.document`; a UI that reads it
is separate, future work — see "Proposed cards" below. Do not treat the
absence of a renderer as a reason to skip storing the field: the field is
what makes rendering it possible later without re-deriving it from prose.

`draft-lesson.ts`'s `SCHEMA_PROMPT` now requires both marks on a conversion,
not one in place of the other: `convertedFrom` on the block (for a future
editor, on the exact block) **and** the existing `qaNotes` line (for the
standalone QA report, which carries the fuller "what changed" explanation
`convertedFrom` doesn't need to repeat). `qaNotes`' other job — flagging
unsourced explanations — is untouched; 0022 Decision 6 doesn't cover it and
it wasn't moved.

## A latent trap noted, not fixed, by this card

`ItemEnvelopeSchema` (`lib/items/types.ts`) is a plain `z.object`, not a
`z.strictObject`. An unrecognized key on a practice block's envelope (a
typo, a stray field from a future drafting change) parses successfully today
and is silently dropped at `parse()`'s `{id, type, payload}` reconstruction
— it never reaches `Item`, never surfaces as a validation error, and nothing
would tell an author their field was ignored. This is independent of
`convertedFrom` (which deliberately reads the raw block *before* that
reconstruction, so it isn't subject to the drop) but was found while
tracing exactly this mechanism. Not fixed here — it touches the same five
type modules `convertedFrom` was designed to avoid touching, and deciding
whether to make the envelope strict is its own question (does anything
rely on today's silently-permissive behavior?).

**Proposed card:** `ITEM-0xx` — decide whether `ItemEnvelopeSchema` should be
`z.strictObject`, or document why a loose envelope is intentional. Acceptance:
either the envelope rejects an unrecognized top-level key with a field-named
error, or a comment on `ItemEnvelopeSchema` records why not, citing what
depends on the current behavior.

**Proposed card:** `AUTH-0xx` — the future lesson-document block editor
renders a `convertedFrom` badge/affordance on any practice block that has
it. Acceptance: opening a lesson with a converted block in the editor shows
the original paper instruction inline on that block, without opening any
other file.

## What would make us revisit this

- A second conversion-worthy field emerges that also belongs on the block
  (not the item) — generalize to a small, explicitly-optional
  "authoring-provenance" group on `LessonPracticeBlock` rather than adding
  ad hoc fields one at a time.
- The future block editor's save path needs to preserve `convertedFrom`
  across an in-place edit — decide then whether that's "keep it until the
  practice payload changes" or something else; not decided here.
