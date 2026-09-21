# 0009 — SubResult grows a required `id`

## Context

Working ITEM-004 (issue #52) surfaced a gap in the shared item-type contract
(`lib/items/types.ts`, ITEM-001/docs/decisions/0006). ITEM-004's acceptance
requires `subResults` to carry "one entry per row, each with its row
identity, correctness, and its explanation reference" — but `SubResult` had
no field for identity, only `correct`, `earned`, `possible`,
`explanationRef`. The interface's own doc comment already named what
`SubResult` models ("a row of a `selection_grid`, a pair of a `matching`
item, a gap of a `slots` item") without ever giving any of them an id.

Modifying a type every present and future item-type module implements
against is a "shape of the deliverable" change (CLAUDE.md, "Working on a
board issue") — not something ITEM-004 is entitled to decide alone, even
under `--no-approval`. Options were put to the user directly rather than
folded into the ITEM-004 diff.

## Options considered

1. **Optional `id?: string` on `SubResult`.** Non-breaking by construction —
   `selection`'s existing single subResult could keep omitting it. Rejected:
   optional fields on a shared contract tend to go unset by accident rather
   than by decision, and every type module scores at least one identifiable
   sub-part, so there is no real case where a module has nothing to put there.
2. **No contract change — encode identity into `explanationRef`.** Rejected:
   nothing guarantees `explanationRef` values are unique per sub-part or
   stable as an identifier; it is authored content, not an id, and conflating
   the two makes a future rename of either field a silent bug.
3. **A `selection_grid`-local field via a type assertion, undocumented in the
   shared contract.** Rejected: works for this one module but the field
   would not be typed for the renderer, and `matching`/`slots` would each
   reinvent it — the exact "contract gets a second pass before five modules
   each invent their own" scenario 0008 warned about, arriving one card
   early.

## Decision

`SubResult.id: string` — **required**. For a type with exactly one
sub-part per item (`selection`, one subResult per scored item), `id` is the
item's own id (`item.id`), decided here rather than left to `selection` to
improvise since `selection` already shipped (ITEM-003) before this gap was
found and needed its existing test updated to match.

Changed in this commit, ahead of and separate from the ITEM-004
(`selection_grid`) diff: `lib/items/types.ts` (the field), `lib/items/
selection.ts` (`id: item.id` on its subResult), `lib/items/selection.test.ts`
(the exact-shape assertion updated to include it). `ordering.ts`,
`matching.ts`, `slots.ts` and the `__sketches__/freeText.ts` placeholder all
return `subResults: []` today, so none of them needed a change.

## What would make us revisit this

- If a type's sub-part turns out not to have a natural single id (e.g. a
  `matching` pair might want the id of one side, the other side, or a
  synthesized pair id) — that card's own decision doc should state which,
  rather than assuming the `selection_grid` convention (row id) transfers.
- If `id` values ever need to be stable across re-authoring (e.g. a review
  UI persists per-id state), whether ids survive a content edit becomes a
  question the importer, not this contract, has to answer.
