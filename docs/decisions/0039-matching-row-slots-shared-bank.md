# 0039 — matching renderer: row slots + always-visible shared bank

## Context

Follow-up interaction work on the `matching` player renderer, requested
directly (not a board card): replace the expand/collapse tap-to-pair layout
(docs/decisions/0030 Decision 2) with row slots and a permanent bank, the
same shape 0032 gave `slots`' `DragSlots`, plus real drag support.

## Decision 1 — expand/collapse is gone; each row carries a fixed-size answer slot

0030 Decision 2's layout expanded a tapped left row to show the right-side
options inline below it, collapsing again once a pair was set. Two problems
this caused, both raised directly rather than measured on device (no
browser-automation pass was available this session either — same constraint
0030/0032 already recorded):

- **Layout shift.** Expanding a row changes the page's height under the
  learner's finger — exactly the touch-scroll conflict 0030 itself worried
  about for a DRAG gesture, reintroduced by a plain TAP. A row below the
  expanded one visibly jumps.
- **Hidden options.** A right-side option is invisible until its matching
  left row happens to be the one expanded, so the full set of choices — and
  how many are left unused — is never at-a-glance. A consumable/reusable pool
  is far easier to reason about when every option is always on screen.

Each left row now renders as `[left content] [answer slot] [correctness
icon]`, and the slot (`SlotTarget`) is a fixed `min-h-11 w-28` box regardless
of whether it holds an answer — placing or clearing an answer changes what
is INSIDE the box, never the box's own size, so a row's height (and every
row below it) never moves. This is the same "the control IS the row, fixed
size" precedent 0029 Decision 4 and 0030 Decision 1's move buttons already
established for `selection`/`ordering`.

## Decision 2 — the bank is non-consumable, and that is why distractors stay meaningful

The bank (`Bank`) renders every right-side element always — including a
right distractor with no correct pairing at all — and a chip is never
removed, disabled, or filtered out after being placed. This mirrors 0030
Decision 3, which already established the reusable-pool requirement from
docs/decisions/0013 Decision 2 (many-to-one is legal, both authored and
answered): removing a chip after one placement would make an authored
many-to-one item unanswerable through this UI even though `matching.ts`'s
`score` still accepts it.

This is the ONE deliberate difference from `DragSlots`' bank (0032 Decision
3), which DOES filter a placed chip out — there, a chip/gap pairing is 1:1
and consumed, so a placed chip has nowhere else to be used. Here it does.

**Why this also protects distractors as meaningful, not just many-to-one:**
if placing a chip removed it from the bank, a learner working through the
last unfilled row could solve it by elimination — whichever chip remains in
the bank must be the answer — without knowing anything about the actual
pairing. A non-consumable bank makes every remaining chip still a live,
independently-evaluated choice for every open slot, all the way to the last
one. A small used-count badge (`BankChip`) is shown instead of removing the
chip — visible feedback that an option has been placed, without ever hiding
it or narrowing the remaining choice set for elimination.

## Decision 3 — a placed answer is a SECOND, differently-scoped draggable node, not the bank chip moved

`DragSlots`' invariant (0032 Decision 3) is "a chip renders in exactly one
place" — filtered out of the bank the instant it is placed at a gap, so one
`useDraggable({ id: chip.id })` node ever exists for it at a time. That
invariant does not hold here: because the bank is non-consumable, the SAME
right element can be simultaneously visible in the bank (as a drag source
for filling more slots) and inline in one or more filled rows (as a drag
source for moving/clearing that specific placement) — two, or more, mounted
nodes at once, which dnd-kit's one-id-one-node contract requires distinct
ids for.

The bank's copy is draggable as `bank:<rightId>`; a placed row's copy is
draggable as `slot:<leftId>` — keyed by the ROW it sits in, not by which
right element it is, since two different rows can hold the same right id
simultaneously (the many-to-one case again). `handleDragEnd` branches on
which prefix `active.id` carries to decide the correct pure transition:

- `bank:<rightId>` dropped on a row (`leftId`) → `setMatchingPair` (fill;
  the bank copy is untouched, it was never "consumed").
- `bank:<rightId>` dropped back on the bank → no-op.
- `slot:<leftId>` dropped on the bank → `clearMatchingPair`.
- `slot:<leftId>` dropped on another row → `moveMatchingPair`, a new pure
  helper in `lib/lessonPlayer/matchingResponse.ts` that vacates the source
  slot and overwrites the target slot's previous pairing (if any) with no
  bank bookkeeping — unlike `slotsResponse.ts`'s `moveChipToGap`, there is
  nothing to "return to the bank" here, because the displaced right id was
  never removed from the bank to begin with.

The tap flow (tap a slot to select it, then tap a bank chip; or tap a chip
with no slot selected to fill the first empty one, via the new
`firstEmptyLeftId`) and the drag flow both resolve through the same four
functions in `matchingResponse.ts` (`setMatchingPair`, `clearMatchingPair`,
`moveMatchingPair`, plus the read-only `firstEmptyLeftId`) — no
placement/clearing logic is duplicated between the two input paths, same
discipline as 0032 Decision 2.

Clearing a placed answer no longer requires selecting the slot first: each
filled slot shows its own ✕ next to the placed content
(`SlotTarget`/`DraggableSlotChip`), calling `onClear` directly. Tapping the
placed content itself still selects the slot (`onTapToggle`), the same
selection a tap on an empty slot triggers, so re-filling a slot with a
different chip works the same tap-slot-then-tap-chip way whether the slot
started empty or not.

## Decision 4 — duplicated from `DragSlots`, not extracted into a shared component

The sensor configuration (`PointerSensor`/`TouchSensor`/`KeyboardSensor`,
identical constraint values) is copied a third time here, matching the
repo's own existing precedent: `OrderingRenderer` and `DragSlots` already
duplicate this exact block rather than sharing it (see 0032 Decision 1),
each with a comment pointing at the others. `MatchingRenderer` follows the
same convention rather than introducing the first shared abstraction the
other two never got.

The chip/bank pieces themselves (`BankChip`, the drag-preview chip, the
droppable-bank wrapper) were NOT extracted into a shared component
parameterised by consumable-vs-reusable, despite being asked to consider it.
Reason: the two pools differ at the id-scheme level, not just a
filter-vs-badge display choice —

- `DragSlots`' invariant is one draggable node per chip, ever; a shared
  component's props would need to assume that to decide "is this the bank's
  copy or the gap's copy," which is false for matching (Decision 3 above).
- Genericizing the id scheme (`bank:<id>` / `slot:<id>` vs. `DragSlots`'
  bare `chip.id` reused as both) to cover both cases would touch
  `DragSlots`' existing ids and therefore its existing `onDragEnd` matching
  logic — exactly the "if extraction would touch gap-fill behaviour or
  scoring, don't" line this work was asked to respect.

Duplicating `BankChip`/`ChipPreview`/the bank wrapper (small, presentational,
~20-30 lines apiece) was judged cheaper and safer than a shared component
whose only non-trivial parameter would be "how do ids and filtering work,"
which is precisely the part that differs.

## Decision 5 — sticky bank, CSS only

The bank container is `sticky bottom-0` with its own `bg-card` and
`border-t`, inside the item's card `div` (no wrapping `overflow` on any
ancestor between it and the page's own scroll container) — no scroll
listener, matching the request. Rows scroll under the bank once the item is
taller than the viewport; the border/background keep the boundary legible
rather than rows appearing to vanish under a transparent strip.

This was not verified in a live browser this session (no browser-automation
tool or hosted-admin credentials available — same constraint recorded in
0030/0032). It is architectural reasoning: `position: sticky` requires no
`overflow` value other than `visible`/`clip` on every ancestor up to the
nearest actual scroll container, which is true here (the item card and its
parents introduce no `overflow-auto`/`overflow-hidden`), so the bank should
stick to the nearest scrolling ancestor's bottom edge — expected to be the
page/viewport itself, not a clipped inner region.

**Image-chip height was not a problem for this session to evaluate against a
real fixture**: the only `matching` item in the demo document
(`app/(main)/app/admin/lesson-player-demo/page.tsx`, `q5`) is text-only. The
bank's chip sizing (`min-h-11`, `size-10` inline images per
`MatchingContentView`, `flex-wrap gap-2`) was written to the same scale as
`DragSlots`' bank, which does not carry images at all — this is a genuine
gap in verification, not a resolved question, flagged rather than guessed
at. **Revisit when:** a `matching` item authored with image content (AUTH-004
made this possible — `MatchingContentView` already renders `content.kind ===
"image"` via `next/image` at a `size-10`/`size-12` box, confirmed by reading
that component before this work) is available to check the bank's rendered
height against the "roughly a third of a 360×640 viewport" ceiling this
session was told to stop at rather than guess past.

## Verification

`npm run check` and `npm test` (451 tests) both pass. New/changed:

- `lib/lessonPlayer/matchingResponse.ts` gained `moveMatchingPair` and
  `firstEmptyLeftId`, both pure, both unit-tested in
  `matchingResponse.test.ts` alongside the pre-existing `setMatchingPair`/
  `clearMatchingPair`/`buildMatchingResponse` tests (including the 0007
  presentation-order-independence case and the 0013 many-to-one case), all
  of which still pass unchanged — scoring semantics are untouched by this
  work.
- `app/components/lesson-player/practice/MatchingRenderer.test.tsx` is new
  (the "editor" Vitest project, jsdom + React Testing Library — see
  docs/decisions/0036): mounts the renderer, drives a tap-slot-then-tap-chip
  fill, places the same bank chip at two different slots (many-to-one) and
  asserts the used-count badge, and asserts `onScore` receives the response
  `scoreItem` was actually called with.

**No live browser pass was done** — same constraint as 0030/0032 (no
browser-automation tool, and `/app/admin/lesson-player-demo` needs a real
hosted-admin Supabase session this environment has no credentials for). The
layout-stability, sticky-bank, and drag claims above are architectural
reasoning, not measured fact.

**What to check in DevTools** (Chrome/Edge device toolbar, iPhone SE / 360px
width, touch emulation on), against `/app/admin/lesson-player-demo`'s `q5`
fixture:

1. Tap a slot, tap a bank chip — confirm the row's height does not change
   and no other row shifts. Tap the same bank chip again for a different
   slot — confirm the used-count badge appears/increments and the chip is
   still tappable/draggable.
2. Tap the ✕ on a filled slot — confirm it clears immediately, no slot
   selection required first.
3. Touch-drag a bank chip onto a slot (press-and-hold ~200ms, then move) —
   confirm a quick tap does NOT start a drag, and a normal page swipe still
   scrolls. Drag a placed answer onto another slot (should move/swap) and
   onto the bank (should clear).
4. Scroll the item taller than the viewport (or resize) and confirm the bank
   sticks to the bottom edge with its border/background intact, rows
   scrolling underneath it.
5. Hard-reload the page and confirm no console errors from `DndContext`'s
   SSR-id handling (0032 Decision 6's fix, reused here with
   `matching-${attemptId}:${item.id}`).
6. Submit and confirm correct/incorrect + explanations render exactly as
   before this session's changes (no scoring behavior changed).

**Revisit when:** a session with browser-automation access, or an authored
`matching` item with image content, can confirm the layout-stability, sticky
positioning, and image-chip-height claims above.

## What would make us revisit this

- If a `matching` item is ever authored with a right side large enough that
  the bank's wrapped rows dominate the viewport even with text-only chips,
  the bank may need its own internal scroll region rather than growing with
  content — not needed for the sizes this repo's one shipped course and demo
  fixtures use.
- If the image-chip bank height check above (Decision 5) finds the bank
  exceeding roughly a third of a 360×640 viewport, this decision's "no
  workaround, describe the problem" instruction applies to whoever runs that
  check next, not to this session (no image fixture existed to test against).
