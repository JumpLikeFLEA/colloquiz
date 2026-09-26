# 0055 — matching: long right-side answers drop to full row width, always

## Context

PLAY-010 (`type:decision`), raised from partner review notes 1 and 4: note 1
is that a long right-side answer is cramped once placed; note 4 is that rows
and the shared bank should sit side by side. Both concern the same renderer
(`MatchingRenderer.tsx`, docs/decisions/0039).

## Evidence gathered before deciding

- **0039 Decision 1's claim doesn't hold for long content.** `SlotTarget` is
  `min-h-11 w-28` ([MatchingRenderer.tsx:250](../../app/components/lesson-player/practice/MatchingRenderer.tsx),
  pre-change) — a fixed *minimum* height, not a fixed height. A long placed
  answer wraps inside the 112px-wide box and grows the row taller. 0039
  Decision 1 is corrected here, not defended: "row height never moves" held
  only for the empty state.
- **Longest right-side text across the 10 matching items in
  `future-imperfect.json`**, printed from the parsed file, not estimated:
  138 characters ("Modern wireless earbuds have not replaced all forms of
  communication, but they have certainly lived up to the hype for millions
  of people.", item 3, "Pair 2"). The three long-answer items (Pair 2/3/4,
  converted from written tasks, 2 pairs each) run 74–138 characters; the
  short items (expression↔meaning, categorisation, up to 8 pairs) run
  5–54 characters — a real gap, not a continuum with an obvious cut point.
- **The width constraint the issue names is stale.** The issue's acceptance
  line points at `LessonPlayer.tsx:93`'s `max-w-xl`; that cap was already
  widened same-day by the ad-hoc adaptive-width decision
  (docs/decisions/0043, 2026-09-26, earlier commit than this card) to
  `max-w-xl lg:max-w-5xl`, with every practice block — `matching` included —
  placed at `READING_WIDTH_CLASS` (`w-full lg:max-w-2xl lg:mx-auto`): 672px
  at `lg`+, unchanged (~mobile column width) below it. Recorded here so a
  future session doesn't re-discover the same staleness.

## Tension between the two notes

Two-column rows/bank (note 4) narrows the row's own column further —
exactly where note 1's long answers already overflow at the current single
column width. Fixing note 4 alone would make note 1 worse on the viewports
it targets.

## Options presented

(a) long answer moves under the left content at full row width; (b) two
columns (rows left, bank right) at `lg`+, current stacked layout below it;
(c) per-item layout chosen by content length; (d) (a) always, plus (b)
layered on top for items short enough not to reintroduce note 1.

## Decision

**Option (a), applied unconditionally** — every placed answer renders full
row width on its own line below the left content, not only long ones,
because deriving "long" from character count would need a threshold
recalibrated against whatever future courses author (54 vs. 74 characters is
a 20-character gap with no rendering fact behind it, unlike "does this
actually wrap at `w-28`" — which is exactly the fixed-width box this change
removes). The empty slot is unchanged: still an inline `w-28` placeholder
next to the left content, tap-to-select or drag target, so the common case
(rows with nothing placed yet) reads identically to before.

Owner rationale (2026-09-26): learners arrive on phones, where only note 1
applies; (b)/(c)/(d) buy `lg`+-only gains that are mostly seen in author
preview, not by the audience this product is for (docs/handoff.md,
"Audience and language"). (a) is also the first layer of (d), so choosing it
now forecloses nothing if note 4 is picked up later.

**Note 4 (rows/bank side by side at `lg`+) is NOT decided here** — deferred
to a new low-priority card, to be picked up with real desktop-traffic share
from Speed Insights (OPS-008) rather than guessed at now, since this
product's audience is phone-first by design.

## Implementation

`MatchingRenderer.tsx`'s row JSX now renders `SlotTarget` in one of two
positions, not one box that resizes: inline (`w-28 shrink-0`, next to the
left content) when the slot is empty; full-width (`w-full`), on its own line
below the left content, when it holds a paired answer. `SlotTarget` itself
now derives its width class from whether it is filled, and the two call
sites in the row (`!pairedRightId` / `pairedRightId`) pick which position
renders — the component was not made to reposition itself. No change to
`DraggableSlotChip`, the bank, drag/tap handling, or `matching.ts` scoring.

## Verification

`npm run check` and `npm test` (480 tests, up from 451 at 0039 — the gap is
other PLAY cards landed since, not this one) both pass; no test change was
needed since the existing `MatchingRenderer.test.tsx` doesn't assert on slot
width classes.

**Live-browser verification was possible this session** (unlike
0030/0032/0039, which recorded no browser-automation access) — Playwright
via system Edge, driven headless against a real `npm run dev` instance and a
scoped test admin user created and deleted through the Supabase Admin API
(`docs/decisions` precedent: service-role key, never reaches the browser).
Verified by temporarily importing the three real long-answer payloads (Pair
2/3/4) from `authored/courses/future-imperfect.json` into
`lesson-player-demo`'s fixture document (reverted before commit — the demo
fixture itself is unchanged in the final diff), then screenshotting:

- **375px (mobile)**: empty slots render identically to the pre-change
  layout (inline `w-28` "Tap to match" pill). Placing the 138-character
  answer moves it to a full-width line below the left content, wrapping
  cleanly across 5 lines with no cramped single-word-per-line wrapping and
  no row-height side effects on neighbouring rows.
- **1280px (desktop, `lg`+)**: same behavior; the 672px `READING_WIDTH_CLASS`
  column is wide enough that the 138-character answer wraps to 2 lines
  instead of 5, confirming the full-width box scales with the column rather
  than being pinned to a fixed pixel width.
- **Short item** (`q5`, "Match the verb to its past simple form."): empty
  state at both widths is pixel-identical to the pre-change screenshots on
  file from 0039's own verification pass — confirming no regression for the
  common (short-answer) case, which is most of the authored content.

## What would make us revisit this

- Real desktop-traffic share (OPS-008 / Speed Insights) large enough to
  justify building note 4's side-by-side layout — at that point, layer it on
  top of this decision per option (d), not instead of it.
- A course authored with right-side content long enough to overflow even the
  full-width row at `lg`+ (unlikely at today's 138-character maximum, but not
  provably impossible for a future course).
