# 0032 — lesson player: drag interactions and inline typed-gap sizing

## Context

Follow-up visual/interaction work on the `ordering` and `slots` player
renderers, requested directly (not a board card): drag-to-reorder for
`ordering`, an always-visible drag-capable word bank for `slots`'
`input: 'drag'`, and answer-sized inline inputs for `slots`' `input: 'typed'`.

Two renderers already existed with a considered "no drag" stance —
`OrderingRenderer` (docs/decisions/0030 Decision 1) and `DragSlots`
(docs/decisions/0031 Decision 2) — both for the same reason: a hand-rolled
native-pointer-event drag has real touch-scroll conflicts on a 360px screen,
and neither session that built them had a device/Playwright pass to verify a
fix. This decision reverses both calls. The reversal is explicit and
requested, not a re-litigation of 0030/0031's reasoning — see "Why the
reversal is safe" below for what actually changed.

**Numbering note:** 0031 is already taken (`0031-play004-slots-renderer.md`,
PLAY-004's own decision doc). This document is 0032.

## Why the reversal is safe

0030/0031's objection was never "drag is wrong for this content" — it was
"a HAND-ROLLED native-pointer-event drag is an unverified risk, and a drag
library is a new dependency we can't add without asking." Both conditions
changed:

1. `@dnd-kit/core`/`@dnd-kit/sortable` were already `package.json`
   dependencies (pre-installed, unused, per 0030's own note) — this work
   adds `@dnd-kit/utilities` as the only new dependency, explicitly approved
   for this work, so the "stop and ask before a drag library" gate in
   0030/0031 is satisfied rather than bypassed.
2. dnd-kit's `TouchSensor` activation constraint (`delay`/`tolerance`) is
   exactly the fix 0030's "what would make us revisit this" asked for: a
   touch has to stay within `tolerance` px for `delay` ms before a drag is
   armed, so a normal vertical swipe scrolls the page as always and only a
   deliberate press-and-hold-then-move gesture starts a reorder/chip-move.
   This is dnd-kit's own mechanism, not a hand-rolled one — the thing 0030
   explicitly said this session couldn't verify by hand is exactly what the
   library is for.

Neither `matching` (0030 Decision 2) nor the underlying "consumable slots
chip pool" (0031 Decision 3) is touched — this is additive interaction work
on top of two renderers, not a re-scope of the item types.

## Decision 1 — one sensor configuration, shared by both renderers

`OrderingRenderer` and `DragSlots` (SlotsRenderer.tsx) each build:

```
useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
useSensor(KeyboardSensor, ...)
```

`distance: 5` keeps a plain tap/click from arming a drag (mouse/trackpad
users don't need the touch-specific delay). `delay: 200, tolerance: 5` is the
touch-scroll answer above — 200ms is long enough that a normal swipe-to-scroll
gesture (which typically moves well past 5px within the first 100-150ms) is
read as a scroll, not a drag-start, while still feeling immediate once a
learner does mean to drag. Neither number was benchmarked on a real device
this session (see "Verification" below) — they are dnd-kit's own commonly
documented starting values for exactly this touch-vs-scroll conflict, chosen
as a reasoned default, not measured against this app's content.

`OrderingRenderer`'s `KeyboardSensor` uses `sortableKeyboardCoordinates`
(from `@dnd-kit/sortable`) because it operates over a `SortableContext`.
`DragSlots`' `KeyboardSensor` uses the plain default coordinate getter — it
has no sortable list, just independent droppables (gaps, the bank), so
`sortableKeyboardCoordinates` does not apply; dnd-kit's default arrow-key
coordinate stepping is what free (non-sortable) drag-and-drop gets.

## Decision 2 — drag and the existing discrete-input paths share one state transition each, always

Neither renderer's drag handler computes a reordering/placement itself:

- `OrderingRenderer`'s `onDragEnd` looks up the drop target's index in the
  current `order` array and calls `moveOrderElementToIndex` — the SAME
  function the up/down buttons now call through (previously
  `moveOrderElement` did its own adjacent swap; it is now a thin wrapper over
  `moveOrderElementToIndex`, added to `lib/lessonPlayer/orderingResponse.ts`
  this session). A `moveOrderElementToIndex` test asserts it agrees with
  `moveOrderElement`'s old swap result for an adjacent move, so the
  refactor is behavior-preserving where the two overlap, and adds true
  multi-position moves (a drag can jump straight from index 0 to index 3;
  the old function could only step by one).
- `DragSlots`' `onDragEnd` and its tap-flow handlers both resolve through
  `moveChipToGap`/`moveChipToBank` (`lib/lessonPlayer/slotsResponse.ts`,
  replacing 0031's `placeChip`/`clearChip`, which only handled the simpler
  "gap picked, then chip tapped" case). `moveChipToGap` now DISPLACES
  whatever chip previously sat at the target gap back to the bank rather than
  assuming the gap was empty — necessary once a drag can drop onto an
  already-filled gap, which the tap flow's own UI could never previously
  produce (the bank only showed unplaced chips). `firstEmptyGapId` is new,
  for "tap a chip with no gap selected fills the first empty gap."

This is what makes "no reorder/placement logic in the component" true by
construction, not by convention: the component's job is entirely "which ids
were involved in this event," and the pure function decides what the new map
looks like.

## Decision 3 — `slots`' word bank is always visible; a chip renders in exactly one place

The bank (`ChipBank`) no longer waits for `activeGap` to be set — it is a
permanent droppable region below the prompt, matching the request
("the option bank must always be visible, not only after tapping a gap").
A chip that is currently placed at a gap is filtered OUT of the bank's list
and rendered inline at that gap instead (`DraggableChip`) — a chip is never
duplicated across both locations, which is also what keeps `useDraggable`'s
one-id-one-node dnd-kit contract intact (two mounted nodes sharing one drag
id would be a dnd-kit misuse, not just a visual glitch).

Tapping a placed chip (inline at its gap) or an empty gap both call the same
`onTapToggle`, selecting that gap (`activeGap`) — tapping a bank chip then
fills it (`moveChipToGap`), or, with no gap selected, fills
`firstEmptyGapId`. A small "Clear" affordance appears next to the bank only
when a filled gap is the active selection, calling `moveChipToBank` — the
drag path reaches the same outcome by dropping the chip on the bank's
droppable region directly.

## Decision 4 — typed gap inputs are sized to their own longest accepted answer

`gapInputWidthCh(acceptedAnswers, minCh = 5, paddingCh = 2)`
(`lib/lessonPlayer/slotsResponse.ts`) returns
`max(longest accepted answer length + 2, 5)`, applied as an inline
`style={{ width: '<n>ch', maxWidth: '100%' }}` on each gap's `<input>`. `ch`
is a CSS unit already tied to the font's own average character width, so the
box scales with the font instead of needing a px-to-character lookup table.
No upper clamp is applied — `max-width: 100%` caps it at the containing
line's width instead, so an unusually long accepted answer wraps onto its
own line rather than being squeezed narrower than its content (squeezing
would need `overflow`/scroll affordances that leak MORE about the hidden
text than a plain width does, the opposite of the acceptance line's "don't
reveal the answer through any attribute beyond width").

This is authored-answer-length leaking through width **by design** — the
request states the constraint as "don't reveal the answer through any
attribute BEYOND width," not "don't reveal it at all." No other attribute
(`maxlength`, a `title`, `aria-describedby` naming the answer, etc.) is added.

## Decision 5 — compact visual height via padding + negative margin, not a shorter tap target

`typedGapInputClassName` drops the previous full bordered box
(`border`, `rounded-md`, `min-h-11`) for a plain bottom-border ("underline")
input: `border-0 border-b-2`, `rounded-sm`, `bg-transparent`. Vertical sizing
is `py-2.5 -my-2.5` — the padding still counts toward the input's hit-tested
(padding-box) area, but the matching negative margin pulls the element's
layout footprint back to roughly its unpadded height, so it does not enlarge
the surrounding line the way a literal `min-h-11` box would. The paragraph's
line-height is widened separately (`leading-[44px]`, via a new
`lineClassName` prop on the shared `GapLayout`) so consecutive wrapped lines
still have breathing room even though no single input forces that spacing by
its own visible height — `DragSlots` keeps `GapLayout`'s previous default
(`leading-8`), since its gap targets are still full `min-h-11` boxes and
don't need the same accommodation. This is the "touch target extends via
padding/negative margin rather than visual height" mechanism the request
names directly.

## Decision 6 — an explicit `DndContext id`, to fix an SSR hydration mismatch

`DndContext` auto-generates the id it uses for its `aria-describedby`
attribute (`DndDescribedBy-N`) from a module-level counter that increments
once per `DndContext` mounted. `lesson-player-demo`'s fixture document
mounts several `DndContext`s on one page (one per `ordering`/`slots`-drag
practice block) via server-side rendering, and the counter's starting value
differed between the server render pass and the client hydration pass —
React flagged it as a hydration mismatch (attributes not matching), traced to
`BankChip`'s `aria-describedby`. This is a documented dnd-kit SSR caveat, not
a bug in this renderer's own logic: the library's fix is to pass an explicit,
stable `id` prop to `DndContext` instead of relying on the auto-counter.

Both `OrderingRenderer` and `DragSlots` now pass
`id={`ordering-${item.id}`}` / `id={`slots-${item.id}`}` — `item.id` is
authored content, identical on the server and the client, so the id is
stable across the hydration boundary and unique per practice block on the
page (two `slots`/`ordering` blocks in the same lesson never share an
`item.id`, per each type's own `parse`).

## Verification

`npm run check` and `npm test` pass (419 tests; `moveOrderElementToIndex`,
`moveChipToGap`/`moveChipToBank`/`firstEmptyGapId`, and `gapInputWidthCh`
each have new unit tests, all pure and jsdom-free — same precedent as every
prior PLAY-00x decision).

**No live browser pass was done.** `npx playwright` is available in this
environment (confirmed runnable), but `/app/admin/lesson-player-demo`
requires a real Supabase-authenticated session with the `admin` profile role
against the HOSTED project (`page.tsx` calls `createClient()`/`getUser()`
and checks `profiles.role`) — this session has no credentials for that
account, and creating one would itself be a write against the hosted
database, which the working agreement reserves for explicit approval. The
sensor timing values (Decision 1), the padding/negative-margin touch-target
claim (Decision 5), and the inline-flow wrapping claim (Decision 4) are
therefore all architectural reasoning, not measured fact.

**What to check in DevTools** (Chrome/Edge device toolbar, iPhone SE / 360px
width, "Show touches"/touch emulation on), against `/app/admin/lesson-player-demo`
(fixtures q4 = ordering, q6 = typed slots, q7 = drag slots):

1. **Ordering (q4), touch emulation:** press-and-hold a row's grip handle,
   then drag vertically — confirm the row reorders only after a deliberate
   hold (not on a quick tap), and that swiping the PAGE itself (not the
   handle) still scrolls normally. Confirm the up/down buttons still work
   with the mouse/keyboard after dragging once (no leftover disabled state).
2. **Ordering (q4), mouse:** confirm a small drag (a few px) doesn't fire
   accidentally on a click intended as a button press, and that the
   `DragOverlay` preview + the dimmed placeholder row both render while
   dragging.
3. **Slots drag (q7):** confirm the bank is visible immediately (no tap
   needed), drag a bank chip onto a gap, drag a filled gap's chip to another
   gap (should swap, displaced chip returns to the bank) and to the bank
   itself (should clear). Confirm tap-to-fill still works (tap a gap, tap a
   chip; tap a chip with nothing selected fills the first empty gap).
4. **Slots typed (q6):** confirm the sentence reads as one flowing line at
   360px width AND at a wide desktop viewport — inputs should be visibly
   narrower/wider per gap based on their accepted answer's length, not one
   uniform width. Tap an input and confirm the actual tappable area feels
   larger than the thin underline suggests (the padding/negative-margin
   claim in Decision 5).
5. At every step above, submit and confirm correct/incorrect + explanations
   still render exactly as before this session's changes (no scoring
   behavior changed).

**Revisit when:** a session with browser-automation access (or this session
gains hosted-admin credentials) runs the checklist above and either confirms
Decisions 1/4/5's architectural claims or files concrete bugs against them.
