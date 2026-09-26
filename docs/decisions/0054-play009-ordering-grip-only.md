# 0054 — PLAY-009: ordering — grip handle as the only pointer control

## Context

PLAY-009 (issue #114) asks for one way to reorder instead of three (grip,
▲, ▼), with visible positions — a partner review note on the `ordering`
renderer built by PLAY-003 (docs/decisions/0030) and extended with real drag
by docs/decisions/0032. `OrderingRenderer.tsx` had carried both the ▲/▼
move-button pair (0030 Decision 1's original "no drag" design, kept by 0032
as the accessible/no-gesture fallback once drag was added) and the grip
handle side by side. Three controls per row for one action was the complaint;
the buttons also crowded the row on a 360px screen and duplicated the number
a learner needs to track their progress through the list.

Worked unattended under `work on next --no-approval`.

## Decision 1 — remove the ▲/▼ buttons; the grip handle is the only pointer/touch control

`OrderingRow`'s `onMove`/`isFirst`/`isLast` props, the `ArrowUp`/`ArrowDown`
buttons, and `moveButtonClassName` are deleted from
`app/components/lesson-player/practice/OrderingRenderer.tsx`. This is safe
specifically because 0032 already answered the "what does a learner without
a mouse do" question a different way: `useLessonPlayerSensors`'
`KeyboardSensor` (with `sortableKeyboardCoordinates`, since this renderer
runs inside a `SortableContext`) is spread onto the SAME grip-handle button
via `{...attributes} {...listeners}` — a real `<button>`, Tab-reachable,
Space/Enter to pick up, arrow keys to move, Space/Enter to drop. The buttons
were never the only keyboard path; they were a second, redundant one. Once
verified (Decision 3), removing them is a pure simplification, not a new
accessibility gap.

`lib/lessonPlayer/orderingResponse.ts`'s `moveOrderElement` (the "move by one
position" wrapper the buttons called) is deleted with its dedicated tests in
`orderingResponse.test.ts` — it had no caller left. `moveOrderElementToIndex`
(the single state-transition function both the buttons and drag went
through, per 0032) is unchanged and is still the only function the renderer's
`onDragEnd` calls.

## Decision 2 — a live position number replaces the buttons' spatial affordance

Each row now renders `{position + 1}.` in a `text-sm text-muted-foreground`
span immediately before the grip handle — the same numbering convention
`docs/decisions/0053` (PLAY-008) already established for `matching`'s left
column and `selection_grid`'s rows (`<span className="shrink-0 text-sm
text-muted-foreground">{index + 1}.</span>`), reused verbatim rather than
inventing a second numbering style. `position` comes from `order.map((id,
position) => ...)` in `OrderingRenderer`, so it is always the row's current
index, live during a drag and after a keyboard move — the acceptance line's
"updating as rows move" holds because it is derived from `order` on every
render, never stored as its own piece of state that could drift.

The number is a **display position**, not the authored element id — the
same "shuffled display order vs. authored answer key" distinction
`lib/items/ordering.ts` (0007) already draws for scoring; nothing about this
change touches which order is "correct."

`dragHandleClassName()` also gains `focus-visible:ring-2
focus-visible:ring-brand` (plus `outline-none` on the base state) — the
handle had relied on the removed move buttons for a visible keyboard focus
indicator inside the row; now that it is the only interactive element per
row it needs its own, using the same `focus-visible:ring-2
focus-visible:ring-brand` token pairing `SelectionRenderer.tsx`,
`SlotsRenderer.tsx`, `ExplanationDisclosure.tsx` and `SubjectGrid.tsx`
already use, not a new focus style.

## Decision 3 — verified with a real RTL keyboard-drag test, not by inspection

The acceptance line specifically asks for this to be "Verified by an RTL
test driving the keyboard path, not by inspection" — unlike 0030/0032, this
is now possible: `vitest.config.mts`'s `"editor"` project (added by
docs/decisions/0036, AUTH-003) runs `app/**/*.test.{ts,tsx}` under jsdom with
React Testing Library, and `MatchingRenderer.test.tsx` (0039) and
`LessonPlayer.test.tsx` (PLAY-005) already render drag-capable renderers
there successfully — mounting a `DndContext` in jsdom was already proven to
work before this card.

The remaining gap: `sortableKeyboardCoordinates` (`@dnd-kit/sortable`) picks
its target row by comparing `getBoundingClientRect()` results between the
active row and each candidate (`collisionRect.top < rect.top` for
`ArrowDown`, then closest-corners among the survivors) — jsdom reports every
element's rect as all-zero by default, so every row would tie and no move
would ever resolve. `OrderingRenderer.test.tsx` mocks
`HTMLElement.prototype.getBoundingClientRect` to return a `top` of `44 *
index-among-siblings`, giving dnd-kit's own (unmodified) collision algorithm
real, distinct positions to compare — the test asserts on the RENDERED
outcome (which row's aria-label ends up in which position after Space →
ArrowDown → Space), not on any dnd-kit internal. A second timing detail:
`KeyboardSensor.attach()` (`@dnd-kit/core`) defers wiring its ongoing
document-level keydown listener with `setTimeout(..., 0)`, so the test awaits
one real macrotask between the pickup keydown and the ArrowDown keydown.

`npm run check` and `npm test` both pass (480 tests; 4 new in
`OrderingRenderer.test.tsx`: position numbers render and buttons are gone,
the hold-and-drag hint renders, the keyboard pickup/move/drop path actually
reorders a rendered row, and submit still reaches `scoreItem` with an
unchanged response shape).

## Decision 4 — a short, always-visible hint replaces the buttons' self-evident affordance

A `<p className="text-xs text-muted-foreground">Hold and drag the handle to
reorder.</p>` renders under the prompt whenever the item is not yet
submitted. Buttons carry their own affordance (a button looks pressable);
the 200ms `TouchSensor` press-and-hold activation (`useLessonPlayerSensors`,
0032 Decision 1) does not — a quick tap-and-release on a touch screen now
does nothing, which is worse without an explanation than the buttons’
immediate feedback was. No conditional touch/pointer detection is added
(none exists elsewhere in this codebase); the hint always renders, which
also answers a mouse-and-keyboard user's "how do I do this" for free.

## Superseded

**docs/decisions/0030 Decision 1** ("▲/▼ move buttons, not drag") is now
fully superseded — 0032 already reversed its "no drag" half; this decision
reverses the other half, removing the buttons 0032 kept as the fallback.

**docs/decisions/0032**'s references to the buttons staying "as the
keyboard/no-gesture fallback" are superseded in part: the fallback is now the
grip handle's own `KeyboardSensor` wiring, which 0032 already built into the
same button — nothing about 0032's sensor configuration (Decision 1) or
`moveOrderElementToIndex` sharing (Decision 2) changes.

## What would make us revisit this

- If a future item type or authoring pattern makes rows too numerous for a
  linear position number to stay meaningful (not expected at this app's
  authored-course scale — courses are 3-8 lessons, `ordering` items are
  short word/phrase sequences).
- If a real device pass surfaces a touch learner who cannot discover the
  press-and-hold gesture even with the hint — at that point a stronger
  affordance (an animated hint, a first-use tooltip) would be worth the
  added complexity this decision deliberately avoided.
