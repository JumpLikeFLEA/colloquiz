# 0090 — The board's Hold column

## Context

On 2026-10-08 the owner added a fifth Status option, **Hold**, to the
Colloquiz project board (option id `a1fbdd56`, read from
`gh project field-list 2 --owner JumpLikeFLEA`; it sits between In progress
and Verify on the board). Its purpose, in the owner's words: park some
issues. The workflow is unchanged — Ready → In progress → Verify → Done — and
a card in Hold is not counted toward the "5 or more cards in Verify"
return-to-chat rule.

Before this, `scripts/board/config.mjs` listed four options, so
`board-move.mjs <KEY> Hold` was rejected as an unknown column, and
`next-card.mjs` treated any column other than Verify/Done as keeping a
milestone active.

## Options

For whether a Hold card keeps its milestone active:

1. **It does.** A milestone whose only open cards are in Hold stays active,
   `next-card.mjs` reports "no pickable cards" and returns to chat.
2. **It doesn't.** Hold is treated like Verify/Done for milestone
   activity; `work on next` moves on to the next milestone.

## Decision

Option 2. Parking a card means "not now"; under option 1 parking the last
open card of a milestone would stall `work on next` until the card was
un-parked, which defeats parking it. To keep a parked card from being
forgotten, `next-card.mjs` prints `Parked in Hold (skipped): <keys>` after
every result.

Also:

- `next-card.mjs` never picks a Hold card (it only ever picked In progress
  and Ready cards; tests in `next-card.test.mjs` pin it).
- `board-move.mjs` accepts `Hold` via `STATUS_COLUMNS`.
- A session never moves a card into or out of Hold on its own; that is the
  owner's call (CLAUDE.md, "Working on a board issue").
- CLAUDE.md's "milestone complete" and "5 or more cards in Verify" stops
  now say Verify/Done/Hold and "Hold doesn't count" respectively.

## What would make us revisit it

The owner parks cards that must still gate a milestone (e.g. a launch
blocker waiting on a partner). Then option 1, or a per-card exception,
becomes the right rule.
