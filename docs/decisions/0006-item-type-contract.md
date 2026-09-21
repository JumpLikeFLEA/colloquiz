# 0006 — Item type contract and registry shape

## Context

ITEM-001 (issue #49): every M0 item-type card (ITEM-003..007) implements a
common contract. Getting the shape wrong is expensive because it ripples
through five later cards, so it ships alone first.

## Options considered

**Result shape.** All-or-nothing boolean per item vs. `{ earned, possible,
subResults[] }` with partial credit per sub-result. `docs/handoff.md`
settles this already: "8 of 10 correct is 80%, counted as progress." A
`selection_grid` row or a `slots` gap can be individually right or wrong, so
credit has to live at that granularity — a single item-level boolean would
force `selection_grid` to average its own rows internally and lose the
per-row correctness the UI needs to show a check/cross per row.

**Explanation delivery.** Resolved explanation text inline in `SubResult` vs.
a reference (`explanationRef: string`). ITEM-009 ("Explanation resolution")
is its own later card; putting resolved text in the score result now would
mean deciding storage/lookup before that card exists. A reference keeps
`score()` a pure function of `(item, response)` with no dependency on
however explanations end up stored or fetched.

**Per-type payload shape.** Decide the concrete fields for `selection`,
`selection_grid`, `ordering`, `matching`, `slots` now vs. defer to each
type's own card. Deferred: ITEM-003..007 each own their type's shape and
this card has no source to derive those fields from other than guessing —
CLAUDE.md's working agreement is explicit that a guess doesn't get
constructed into an explanation. `payload: unknown` on each item interface
is the placeholder; `ItemTypeModule.parse` narrows it per type.

**Registry completeness.** The acceptance text ("a missing or extra type is
a compile error, not a runtime surprise") requires the registry object
itself to type-check against an exhaustive map today, not just define a
type that could be exhaustive once populated. That forced a choice: leave
the registry only partially typed until ITEM-003..007 land (weaker
guarantee, deferred), or write minimal placeholder modules for all five
types now so the exhaustive map compiles from this card onward. Chose
placeholders: `lib/items/{selection,selectionGrid,ordering,matching,slots}.ts`
each satisfy `ItemTypeModule` with `parse` returning a typed "not yet
implemented" error and `score` returning `{ earned: 0, possible: 1,
subResults: [] }`. Each is replaced wholesale by its own card — this is
scaffolding, not a partial feature, and the placeholder pattern is
identical to (and reuses the same score shape as) the free_text sketch the
acceptance criteria explicitly asked for.

**Abstraction test constraint.** `ItemTypeModule<TItem>` was initially
constrained to `TItem extends Item`, which the free_text sketch (a type
deliberately NOT in `Item`) could not satisfy — `tsc` rejected it. Loosened
the constraint to the minimal `{ id: string; type: string }` shape instead.
`Item` remains what the real registry is keyed over (`ItemTypeRegistry`
constrains each entry to `Extract<Item, { type: K }>`); `ItemTypeModule` is
what any type, registered or not, can be implemented against. This is the
mechanism that let the sketch compile with zero changes to `types.ts` or
`index.ts`.

## Decision

- `lib/items/types.ts` holds the contract: `Item` (discriminated union,
  `payload: unknown` per type), `SubResult` / `ItemScoreResult`,
  `ItemTypeModule<TItem, TResponse>`, `ItemTypeRegistry`.
- `lib/items/index.ts` holds the exhaustive registry plus `parseItem` /
  `scoreItem` dispatch by the `type` discriminant.
- Zod, already a dependency, validates the shared envelope
  (`ItemEnvelopeSchema`) using the same `discriminatedUnion`/`strictObject`
  pattern as `lib/courseContent.ts` and `lib/exerciseValidate.ts`. No new
  dependency.
- `lib/items/__sketches__/freeText.ts` is the throwaway sixth-type proof;
  delete it (or replace it with the real ITEM-XXX card) whenever free_text
  is actually built.

## What would make us revisit this

- If a future item type needs a field that cannot be expressed inside an
  opaque `payload: unknown` plus the type's own `parse`/`score` (e.g. a
  cross-type field shared by every item), the envelope in `types.ts` grows a
  field — revisit then, not speculatively now.
- If ITEM-003 (the first real type) finds `payload: unknown` too weak to
  express even one type safely (e.g. needs a shared sub-shape with another
  type), that's a signal the deferred-payload decision above was wrong and
  the registry contract needs a second pass before ITEM-004 copies the
  pattern.
- If explanation resolution (ITEM-009) turns out to need more than a single
  string key per sub-result (e.g. resolving per-locale, or needing the whole
  item for context), `explanationRef`'s shape should be revisited before
  wiring it through five type modules is habit.
