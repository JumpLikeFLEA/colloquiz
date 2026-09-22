# 0020 — CNT-003: lesson document block shapes

## Context

CNT-002 (issue #67, docs/decisions/0018-alliengll-content-model.md Decision
2) says a lesson document is an ordered array of blocks, each a theory block
or a practice block, but explicitly defers the theory-block field shapes to
"the validator card's decision, recorded in its own file" — this card,
CNT-003 (issue #68). This file is that decision, plus the "zero practice
blocks" call CNT-003's acceptance list asks to be decided and recorded.
Implemented in `lib/lessons/`.

## Decision 1 — the discriminator is `kind` (theory/practice), sub-typed by `type`

Every block carries `id` (required, unique within the document — CNT-003
acceptance) and `kind: 'theory' | 'practice'`. A theory block additionally
carries `type` naming which of the seven theory shapes it is; a practice
block's `type`/`payload` are exactly `lib/items`' own item envelope
(`ItemEnvelopeSchema`, `lib/items/types.ts`) — `id`, `type`, `payload`, with
`kind: 'practice'` as the one extra field. This means a practice block
literally IS an item envelope plus a tag: `parseLessonDocument` hands the
raw block straight to `parseItem` and lets `lib/items` own its entire
contract (payload shape, scoring, explanation coverage — CNT-003 acceptance:
"practice blocks are accepted only if `parseItem` accepts them"). No second,
lesson-specific schema for practice payloads was written, and none should
be — that would be exactly the "content stored in a shape only this player
can render" failure mode `docs/handoff.md` warns against, duplicated one
layer up.

## Decision 2 — inline markup: a flat `marks` array, not a `kind` union or nested nodes

0018 Decision 2: "Prose-bearing fields support a minimal inline markup:
emphasis and an English-span... represented structurally (not a Markdown
string)." A discriminated-union run (`{kind:'plain'} | {kind:'emphasis'} |
{kind:'english'}`) cannot express a run that is BOTH emphasized AND an
English term without nesting, which the "no nesting" spirit of "minimal"
argues against. `InlineRun = { text: string; marks?: ('emphasis' |
'english')[] }` (`lib/lessons/inline.ts`) expresses both at once with one
run, still cannot express anything beyond these two marks (the schema's
enum is closed), and needs no recursive/nested-node parser.

**What would make us revisit it:** 0018 widening "minimal" to a third mark,
or a requirement for a mark to apply to only PART of a run's text (this
design's `marks` apply to the whole run — splitting overlapping mark spans
would need either nesting or a "run" that is itself a smaller granularity).

## Decision 3 — the seven theory block types, minimum field shapes

CNT-003's acceptance line requires "at least heading, prose, example,
callout, list, image and video" — implemented as exactly these seven, no
more, in `lib/lessons/theoryBlocks.ts`:

| type | fields beyond `id`/`kind`/`type` |
|---|---|
| `heading` | `level: 1 \| 2` (default 1), `text: InlineContent` |
| `prose` | `text: InlineContent` (one paragraph; a second paragraph is a second block) |
| `example` | `label?: string` (optional heading over the example), `text: InlineContent` |
| `callout` | `variant: 'tip' \| 'note' \| 'warning'`, `text: InlineContent` |
| `list` | `ordered: boolean`, `items: InlineContent[]` (each item its own run sequence) |
| `image` | `url: string` (a URL, not a bare storage path — see below), `alt: string` (required), `caption?: InlineContent` |
| `video` | `youtubeId: string` (11-char YouTube id, see Decision 4), `caption?: InlineContent` |

Every schema is a `z.strictObject`: an authoring typo that adds an
unrecognized field is a parse error, matching every existing `lib/items`
payload schema's convention (e.g. `selection.ts`'s `SelectionPayloadSchema`).

**Heading levels capped at two, not the usual six.** A lesson is 10-15
minutes (`docs/handoff.md`); a document needing a deep heading outline is
already the wrong shape for this product.

**Image stores a resolved URL, not a bucket-relative path.** The
`lesson-images` bucket (migration 041) is public, so the resolved URL is
directly usable with no extra lookup at render time — the same choice
`profiles.avatar_url` already makes for avatars. The schema does not
restrict the URL to that bucket's hostname: doing so would bake a specific
environment's Supabase URL (local vs. hosted differ) into a content-shape
validator, which is the wrong layer for that constraint.

## Decision 4 — video accepts only a YouTube video id (11 chars), never a URL

CNT-003's acceptance line states this outright: "the video block accepts
only a YouTube video id, not an arbitrary URL." Validated with
`/^[A-Za-z0-9_-]{11}$/` — YouTube's actual id alphabet and length. Pasting
`https://youtube.com/watch?v=...` is a parse error, not a silently-broken
embed; the renderer (a future PLAY-001 concern) builds the embed URL itself
from the bare id.

## Decision 5 — a lesson with zero practice blocks is VALID (accepted, not rejected)

CNT-003's acceptance list asks this to be decided and recorded. **Decided:
accepted.** Concrete evidence, not just an inference from prose:
`lib/items/lessonScore.ts`'s `aggregateLessonScore` (ITEM-008,
docs/decisions/0016) already has a first-class `status: "unscored"` outcome
specifically for "Σpossible is 0, which happens for a lesson with no items"
— the aggregation layer was already built to expect and handle a
zero-practice-item lesson, not treat it as an error state. Rejecting it at
the validator layer would contradict machinery that already exists one
layer up. This also matches `docs/handoff.md`'s "subject matter varies by
course: some are vocabulary + listening only... nothing may assume a fixed
lesson composition" — a pure-listening lesson built entirely from `video`/
`prose`/`example` theory blocks, with comprehension checked only informally
by the content itself, is a real, anticipated composition, not a
degenerate one.

A fully empty document (zero blocks of ANY kind, not just zero practice
blocks) is also accepted at the parser level — the validator's job is
"is this document structurally well-formed", not "is this a publishable
lesson"; a future authoring-UI rule against publishing an empty lesson is a
workflow concern for AUTH-002/AUTH-005, not a structural-validity one for
this card.

**What would make us revisit it:** an authoring or product requirement that
every lesson contain at least one scored item, discovered once real lesson
content exists. If so, that constraint belongs in the publish workflow
(`publish_lesson`'s caller, or the CNT-003 validator's caller), not in
`parseLessonDocument` itself — the document that will eventually gain
practice blocks in a later save is still a structurally valid DRAFT today.

## What would make us revisit this file as a whole

A real authored lesson PDF (0018's open drafting-prompt item) turning out
not to fit these seven block types, or needing a richer inline-markup need
than emphasis/English-span. Either reopens the relevant decision above
individually — this file is not a single atomic commitment.
