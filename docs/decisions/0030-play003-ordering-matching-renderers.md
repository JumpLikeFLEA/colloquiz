# 0030 — PLAY-003: ordering/matching renderers

## Context

PLAY-003 (issue #74) builds the `ordering` and `matching` interactive item
renderers behind `LessonPlayer`'s `practiceRenderer` slot (PLAY-001, 0024;
same slot PLAY-002/0029 wired `selection`/`selection_grid` into). The card's
own acceptance leaves the interaction design open ("Usable on a 360px touch
screen, with the interaction choices recorded in a decision file"), explicitly
anticipates a drag interaction ("For drag items this covers target size, and
what happens mid-drag on scroll"), and requires the many-to-one/consumable-
chip-pool question 0013 left open to be answered here. Decided unattended
under `work on next --no-approval`.

## Decision 1 — `ordering`: up/down move buttons, not drag

Reordering is done with a pair of ▲/▼ buttons on each row (min-h-11 / 44px
each), not a pointer-drag gesture. Rejected: hand-rolled native
pointer-event drag reordering (the acceptance line's own default — "a drag
library is a new dependency, stop and ask; native pointer events are the
default assumption" — never actually requires that a renderer choose drag,
only that IF one does, it must be native, not a library).

Reasons:

- The acceptance line itself flags "what happens mid-drag on scroll" as an
  open question a drag choice has to answer — i.e. it acknowledges the
  touch/scroll conflict is real, not hypothetical. A dragged row's pointer
  capture has to either suppress page scroll for the drag's duration (a
  common source of "stuck" gestures on iOS Safari) or coexist with it (which
  makes the reorder target ambiguous while the page is moving under the
  finger). Neither failure mode has a cheap, testable fix without a real
  device/Playwright pass this session could not run (see "What would make us
  revisit this").
- `orderingModule.rendererNeeds.inputs` is `["drag", "typed"]` — the item
  type itself already declares a non-drag input as an accepted alternative,
  which a move-button UI satisfies directly (each button press is a discrete,
  unambiguous "typed" instruction, not a continuous gesture).
- Move buttons are the same "row IS the control" precedent 0029 Decision 4
  established for `selection`/`selection_grid`: real `<button>`s, 44px
  targets, no custom gesture recognizer, no pointer-capture edge cases to get
  wrong on a screen this session could not test on-device.

`@dnd-kit/core`/`@dnd-kit/sortable` are already `package.json` dependencies
(confirmed via `grep` before this card) but have zero usages anywhere in the
source tree — pre-installed, never wired up. This decision does not use them.
Not choosing a library is consistent with the acceptance line's "native
pointer events are the default assumption"; not choosing drag AT ALL is the
part this decision adds, and is what "What would make us revisit this" below
is about.

## Decision 2 — `matching`: tap-to-pair (expand-and-choose), not drag

Tapping a left-side row expands it to show the right-side options inline,
directly below that row; tapping one of those options sets the pair and
collapses the row. Rejected for the same touch-scroll reasons as Decision 1:
a drag-a-chip-onto-a-target gesture has the identical pointer-capture/scroll
conflict, doubled (both a left and a right region need to be reachable
mid-drag on a 360px screen without a second scroll region getting in the
way).

`matchingModule.rendererNeeds.inputs` is `["drag"]` only — unlike `ordering`,
the type does not declare a non-drag alternative. The tap-to-pair design is
read as satisfying the same underlying need ("associate a left element with a
right element") through a different, renderer-level affordance, not as
ignoring `rendererNeeds` — the same latitude `SelectionGridRenderer` already
exercises by not calling `shuffleForItem` on rows despite `selection_grid`
sharing scoring machinery with `selection` (0029).

## Decision 3 — right-side chips are a REUSABLE pool, answering 0013's revisit note

0013 Decision 2 makes many-to-one legal both authored and answered (two left
elements may correctly share one right partner), and flagged: *"If the built
renderer turns out to model right-side chips as a consumable pool ... the
many-to-one authoring case becomes uneditorializable in that renderer even
though the scoring module still accepts it."*

This renderer does not consume/disable a right chip after it is paired to a
left element — the same chip can be tapped again for a different left
element, so an authored many-to-one item is fully answerable through this UI.
`lib/lessonPlayer/matchingResponse.ts`'s `setMatchingPair`/`clearMatchingPair`
never inspect what else currently points at a right id, which is what makes
this hold structurally rather than by the demo fixture happening not to
exercise it.

## Decision 4 — verification without jsdom, again — but without a browser pass this time

Same constraint as 0024/0029: this repo's Vitest config has no
jsdom/React-rendering setup, and adding one is a new dependency — a
stop-and-ask even under `--no-approval`. The state-transition and
response-building logic (`moveOrderElement`, `initialOrder`,
`buildOrderingResponse`, `setMatchingPair`, `clearMatchingPair`,
`buildMatchingResponse`) is extracted into pure functions in
`lib/lessonPlayer/orderingResponse.ts` / `matchingResponse.ts` and unit-tested
there, driving the same call sequence a tap on a rendered row/chip would make,
through to `scoreItem` — including a 0007 presentation-order-independence
test for each type, mirroring `selectionResponse.test.ts`.

**Unlike 0029 Decision 3, the React components themselves were NOT verified
in a live browser this session** — 0029's Playwright pass against
`/app/admin/lesson-player-demo` used a browser-automation tool this session
does not have access to. `q4`/`q5` fixtures (an ordering and a matching item)
were added to that same demo page's `DEMO_DOCUMENT` so a session with browser
access can verify the 360px/touch-target/mid-drag-on-scroll claims above
empirically, but that verification has not happened yet. `npm run check` and
`npm test` (390 tests) both pass; the 44px/no-drag-scroll-conflict claims in
Decisions 1–2 are architectural reasoning, not measured fact, and are labelled
as a hypothesis in this card's evidence comment.

**Revisit when:** a session with a browser-automation tool available runs the
demo page at a 360px viewport and either confirms the touch targets/layout or
finds a concrete problem — at that point this decision's hypothesis becomes
either confirmed evidence or a bug to fix, and either way this note should be
updated to say which.

## What would make us revisit this

- If a future card gets real on-device (or Playwright) testing of a native
  pointer-event drag reorder that resolves the mid-drag-scroll question
  cleanly, drag could be added as a progressive enhancement alongside the
  move buttons (which would stay as the accessible/no-JS-gesture fallback,
  matching `ordering`'s own declared `["drag", "typed"]` inputs) rather than
  replacing them.
- If `matching` items start being authored with large `left`/`right` sets,
  the expand-in-place chip picker may need to become a proper modal/sheet
  instead of an inline reveal — not needed for the sizes this card's fixtures
  and the one shipped course use.

## Superseded in part by 0032

**Decision 1 (`ordering`: no drag) is reversed by docs/decisions/0032**, at
explicit user request and with `@dnd-kit/sortable`/`@dnd-kit/utilities`
approved as dependencies — the "what would make us revisit this" condition
above (a resolution to the mid-drag-scroll question) is met by dnd-kit's own
`TouchSensor` activation-delay/tolerance handling, not by an on-device test
this session ran. The up/down move buttons this decision designed stay, now
as the keyboard/no-gesture fallback 0032 explicitly keeps them as — they were
never removed. `matching` (Decision 2) is UNCHANGED by 0032; only `ordering`
and `slots` (0031/0032) gained real drag.

## Superseded in part by 0039

**Decision 2 (`matching`: expand/collapse tap-to-pair) is replaced by
docs/decisions/0039** — row slots + an always-visible shared bank, plus real
drag (dnd-kit, same reversal conditions 0032 already established: the
library is pre-approved and its `TouchSensor` activation constraint answers
the touch-scroll question this decision's "no drag" call was originally
worried about). Decision 3 (the right side is a REUSABLE pool) is KEPT,
unchanged in substance — 0039's bank is still non-consumable for the same
0013 many-to-one reason, it is simply always visible instead of gated behind
an expanded row. Decision 1 (`ordering`) is untouched by 0039.
