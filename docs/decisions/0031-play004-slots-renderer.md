# 0031 — PLAY-004: slots renderer (typed and drag)

## Context

PLAY-004 (issue #75) builds the `slots` interactive item renderer behind
`LessonPlayer`'s `practiceRenderer` slot — the same slot PLAY-002/0029 and
PLAY-003/0030 wired the other four types into. `slots.ts`'s own header
explicitly leaves one thing open: "How a gap's position within the prompt
text is conveyed to a renderer is a rendering-layer concern this card does
not decide." This card decides it, plus the interaction design for
`input: 'drag'` the acceptance line asks for (touch screen usability, target
size, mid-drag-on-scroll). Decided unattended under `work on next
--no-approval`.

## Decision 1 — the prompt carries one literal `"___"` per gap, in gap order

`splitPromptOnGaps(prompt, gapCount)` (lib/lessonPlayer/slotsResponse.ts)
splits the authored `prompt` string on the literal three-underscore marker
and returns the resulting segments only when there are exactly `gapCount`
of them — i.e. exactly one marker per gap, matched positionally to
`payload.gaps` in authored order. The renderer interleaves each gap's
control between the text segments, producing an inline cloze sentence
("I have a **[cat]**. I **[ran]** yesterday.") rather than a prompt followed
by a detached list of inputs.

This is the natural reading of "cloze, word insertion" from
`docs/handoff.md`'s item-type table, and it is what the existing test
fixture in `lib/items/slots.test.ts` already writes
(`"I have a ___. I ___ yesterday. I ___ care."`) — the convention was
already implicit in the one fixture that exists, this decision just names it
and encodes it in a parser instead of leaving every renderer to invent its
own.

**Nothing in `SlotGapSchema`/`SlotsPayloadSchema` validates this** — `prompt`
is a plain `authoredString`, so an author (or a malformed import) could ship
a prompt with the wrong number of markers. `splitPromptOnGaps` returns `null`
in that case rather than guessing a placement, and both `TypedSlots` and
`DragSlots` fall back to the full prompt text followed by a labeled
"Gap 1/2/…" list — the same "renders something for every authored block"
discipline `PracticeBlockPlaceholder` already documents, applied one level
down. This is a rendering fallback for bad authoring, not a new
`ItemResponseError` — the response shape is still whatever the learner
typed/placed, valid or not.

## Decision 2 — `drag` is tap-to-place, not a pointer-drag gesture

Same reasoning as docs/decisions/0030 Decisions 1-2 (`ordering`/`matching`):
a hand-rolled native-pointer-event drag has real touch-scroll conflicts on a
360px screen that this session has no on-device/Playwright pass to verify
cleanly, and `slotsModule.rendererNeeds.inputs` is `["typed", "drag"]` —
the type itself already treats a discrete, non-continuous-gesture input as a
first-class alternative to `drag`, the same latitude 0030 read `matching`'s
tap-to-pair design into despite `matchingModule.rendererNeeds.inputs` being
`["drag"]` only.

Tapping a gap makes it "active"; a chip pool appears below the prompt;
tapping a chip places it at the active gap. Unlike `MatchingRenderer`'s
per-row expand-in-place panel, `DragSlots` uses ONE SHARED pool panel below
the whole prompt paragraph, not one per gap — gaps here sit inline inside a
single running sentence, not as separate full-width rows, so there is no
per-gap block region to expand into without breaking the sentence's line
flow.

`@dnd-kit/core`/`@dnd-kit/sortable` remain pre-installed and unused (0030
already noted this); this decision does not reach for them either, per the
acceptance line's "native pointer events are the default assumption, a drag
library is a new dependency — stop and ask."

## Decision 3 — the drag chip pool is CONSUMED, not reusable (unlike matching's)

`matchingResponse.ts`'s right-side pool is deliberately reusable (0013
Decision 2: many-to-one is legal, so a chip must stay tappable after one
use). `slots`' chip pool is the opposite: each gap is authored with its own
`acceptedAnswers` list and there are exactly as many chips as gaps (one per
gap, chip text = `acceptedAnswers[0]`) — a 1:1 assignment problem, not
many-to-one. `placeChip`/`clearChip` (lib/lessonPlayer/slotsResponse.ts) key
a chip by the id of the gap it ORIGINATED from, and the renderer's pool
filters out every chip id already present in `placedChip`'s values, so a
placed chip disappears from the pool until its gap is explicitly cleared.

This is a data-model fact, not a UX preference: `SlotGapSchema` has no
separate "distractor chip" concept, so there is no basis for a pool larger
than `gaps.length`, and nothing in `slots.ts` gives two different gaps a
shared "canonical" chip the way `matching.ts` lets two lefts share one
right. If a future card wants distractor chips or lets one word fill
multiple gaps, that is a new authored field, not a change to this
renderer's consumption rule.

## Decision 4 — typed and drag share one response CONTRACT, not one code path

`buildSlotsResponse` (typed, `Map<gapId, text>`) and
`buildSlotsResponseFromChips` (drag, `Map<gapId, chipId>` resolved through
`chipTextById`) are two different pure functions because the underlying
STATE shapes are genuinely different (free text vs. a chip placement) — but
both produce the identical `SlotsResponse` array shape and both feed the
same `scoreItem` call, which is `slots.ts`'s own `normalizeSlotAnswer`. This
is what makes "typed and drag inputs score identically for the same answer"
(this card's acceptance line) hold BY CONSTRUCTION: neither builder compares
text itself, so there is no second normalisation implementation to drift
from `lib/items/slots.ts`'s. `slotsResponse.test.ts`'s
"typed and drag score identically" test drives both paths with the same
underlying answer ("cat") and asserts the same `correct` outcome, rather
than asserting the two code paths are literally the same function.

## Decision 5 — verification without jsdom, again — and without a browser pass

Same constraint as 0024/0029/0030: no jsdom/React-rendering setup in this
repo's Vitest config, and adding one is a new dependency (stop-and-ask even
under `--no-approval`). `splitPromptOnGaps`, `setGapAnswer`/`clearGapAnswer`,
`placeChip`/`clearChip`, and both response builders are pure functions in
`lib/lessonPlayer/slotsResponse.ts`, unit-tested in
`slotsResponse.test.ts` — including a 0007 presentation-order test for the
chip pool, mirroring `matchingResponse.test.ts`'s right-side-pool test.

**The React components (`SlotsRenderer`/`TypedSlots`/`DragSlots`) were not
verified in a live browser this session**, same caveat 0030 recorded for
`OrderingRenderer`/`MatchingRenderer` — this session has no browser-
automation tool. `q6` (typed) and `q7` (drag) fixtures were added to
`app/admin/lesson-player-demo`'s `DEMO_DOCUMENT` so a session with browser
access can verify the inline-cloze layout, the 44px touch targets
(`min-h-11` throughout, same convention as every other PLAY-00x renderer),
and the mid-drag-on-scroll claim empirically — none of that has happened
yet. The claims in Decisions 1-2 above are architectural reasoning, not
measured fact, and are labelled as a hypothesis in this card's evidence
comment.

**Revisit when:** a session with browser-automation access runs the demo
page at a 360px viewport against `q6`/`q7` and either confirms the inline
layout/touch targets or finds a concrete problem (e.g. the inline `<input>`/
gap-button breaking line flow badly enough to need a non-inline layout even
when `splitPromptOnGaps` succeeds).

## What would make us revisit this

- If real authored content produces prompts that legitimately need markup
  richer than a bare `"___"` (e.g. a gap mid-word, or two adjacent gaps with
  no text between them), `splitPromptOnGaps`'s literal-split approach may
  need a real placeholder syntax instead — no such case exists in authored
  content yet (the course library is still empty; see `docs/handoff.md`
  "Launch bar").
- If a future card authors `slots` items with more chips than gaps
  (distractors) or lets one chip legitimately fill multiple gaps, Decision 3
  needs revisiting — today's schema has no field to represent either case.
