# 0017 — Explanation resolution: authored shape, coverage, resolver

## Context

ITEM-009 (issue #57) is the first card to give `explanationRef` — present on
every type since ITEM-003..007 as "a REFERENCE into the item's own authored
explanations; ITEM-009 resolves it" — something to resolve into. Nothing in
`lib/items/*` before this card declared where explanation TEXT lives; every
type had the reference field but no dictionary it points into.

## Decision 1 — `explanations` + `fallbackExplanation` live on each type's own payload

Each of the five payload schemas gains two fields:

- `explanations: Record<string, string>` — specific text keyed by ref.
- `fallbackExplanation?: string` — used when a ref has no specific entry.

Declared per-type (`selection.ts`, `selectionGrid.ts`, `ordering.ts`,
`matching.ts`, `slots.ts` each add the two fields to their own
`z.strictObject`), not on the shared envelope in `types.ts`. This follows the
convention `explanationRef` itself already set: an authored field a type
"owns" is declared where the type's own payload is declared, the same way
every prior per-type card (0008/0010/0011/0013/0014) decided its own payload
shape without touching the shared contract. `SubResult`, `ItemScoreResult`
and `ItemTypeModule` (0006, 0009) are unchanged — this card adds authored
content, not a new contract shape every module implements against, so it
does not carry the same "shape of the deliverable" weight 0009 did.

The CHECK and the RESOLVER, however, are identical across all five types, so
they live once in a new shared module, `lib/items/explanations.ts`, and each
type's `superRefine` calls into it — the same "shared logic, per-type
declaration" split `ItemResponseError` (0012) already established for the
response-error channel.

## Decision 2 — `ordering` moves `explanationRef` from item-level to per-element

`ordering` shipped (ITEM-005) with one item-level `explanationRef` — every
wrong position got the same explanation. ITEM-009's acceptance names
"an ordering position... carries its own explanation" explicitly, alongside
grid rows, matching pairs and slots gaps — the four multi-sub-part types.
`ordering`'s existing single-ref shape did not match this, so
`OrderingElementSchema` gained its own `explanationRef` and the item-level
field was removed; `score()` now reads `element.explanationRef` per
position instead of one item-level value for every subResult.

This changes an already-shipped module's authored payload shape. It is
folded into this card rather than filed separately because: (a) the
acceptance line names ordering explicitly as one of the four types needing
per-sub-part explanations, so it is not scope this card invented; (b) no
English-course content has been authored yet (M1 is still Planned per
`docs/handoff.md`), so there is no live data this breaks. `selection` is
unaffected — it has exactly one sub-part per item (0009), so its single
item-level `explanationRef` was already correct and needed no change.

## Decision 3 — coverage is checked in each type's own `superRefine`, at parse

`checkExplanationCoverage(usedRefs, explanations, fallbackExplanation)`
(`lib/items/explanations.ts`) returns which used refs resolve to nothing
(`missingRefs`, only possible when `fallbackExplanation` is unset) and which
`explanations` keys no sub-part references (`unusedKeys` — almost always a
stale entry after a row/pair/gap was renamed, rejected the same way an
unknown id anywhere else in this engine is rejected). Each type calls this
inside its own `superRefine` and turns either into a `ParseError`.

**This means a missing explanation is a PARSE-TIME failure, exactly like
every other content invariant this engine enforces** (an option
`correctOptionIds` references that doesn't exist, a `selection_grid` with
duplicate row ids, an item where every option is correct) — none of those
are "warnings," all of them make `parse()` return `{ ok: false }`, and this
is no different. There is no draft-vs-published distinction to make here:
`parseItem`/a type's own `parse` is the only way an `Item` is ever
constructed in this engine (nothing hand-builds one), so an item that fails
this check cannot become even a DRAFT row — it fails on import, the same way
every other parse failure already blocks import. **This settles the second
half of the acceptance line ("blocks publish or only warns"): it blocks
import outright, which is strictly ahead of "blocks publish."**

No English-course importer exists yet (M1/CNT- is Planned) to literally
demonstrate "the importer's behaviour matches" — that importer's job, when
built, is simply to call `parseItem` (or a type's own `parse`) before
writing anything, which every existing per-type module already requires for
every OTHER content invariant. This card does not invent a new obligation
for that importer; it extends the list of things `parse()` already enforces.

## Decision 4 — the resolver: `resolveExplanations(item, result)`

Maps `result.subResults` to resolved text for every WRONG sub-response, in
the array's own order (which is authored order — every type's `score`
builds `subResults` by mapping over its authored rows/elements/pairs/gaps).
A correct sub-response is excluded from the returned array entirely, not
included with an empty string.

Resolution for one subResult: `explanations[subResult.explanationRef]` if
present, else `fallbackExplanation` if set, else throw
`ExplanationResolutionError`. That throw is unreachable for any item that
passed `parse()` — `checkExplanationCoverage` guarantees every ref used by a
sub-part resolves to one or the other. It exists as an assertion (a caller
bypassed `parse()`), not as a scoring outcome — this is what
`explanations.test.ts`'s "unreachable via parse()" test exercises directly,
by hand-constructing an `Item` instead of parsing one, the same technique
`lessonScore.test.ts` used for its own defensively-unreachable case.

## Decision 5 — the authoring cost

**A ten-row inline True/False needs up to ten explanations** — one per row,
if the author gives each row its own. `fallbackExplanation` is the escape
hatch: one item-level explanation covers every row that has no specific
entry, so a grid whose ten rows share one grammar point can cost ONE
explanation instead of ten (`explanations.test.ts`, "an item-level
fallbackExplanation covers every row without individual entries"). This is
the real price of `selection_grid`/`matching`/`slots`/`ordering`'s
independent-sub-part design (already flagged in `docs/handoff.md`'s failure
modes: "Per-sub-response explanations are an authoring burden, not a code
one. A 10-row inline True/False needs 10 explanations. The partner must know
this before she designs around the item type") — this decision doc is that
cost recorded on the code side. **No partner-facing authoring guide exists
in this repo yet** (M1/content-authoring is Planned, not started) — there is
currently nowhere else to write it down. Whichever M1/CNT- card produces
that guide should carry this paragraph (or link back to this file) forward;
flagged here so it isn't lost between now and then.

## What would make us revisit this

- If `explanations`/`fallbackExplanation` need to be shared or reused across
  items (a course-level glossary of common mistakes, say), the "each type
  owns its own copy" decision here would need to move to a shared,
  cross-item store — a bigger change than this card's scope.
- If a future type has a sub-part where NO explanation makes sense even when
  wrong (unlikely — "every mistake gets an explanation" is a stated
  principle in `docs/handoff.md`), `checkExplanationCoverage` would need an
  opt-out per sub-part, not just per item.
- When the M1 importer is actually built, its own card should confirm it
  calls `parseItem` before writing any row (this decision assumes it will,
  since every other item invariant already depends on that same assumption).
