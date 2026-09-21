# 0010 — selection_grid: per-row scoring, response shape, and the error channel

## Context

ITEM-004 (issue #52). Acceptance fixes the headline numbers (`possible` =
row count, `earned` = rows correct, 8/10 scores 0.8) and the two edge cases
(a partial response scores rather than throws or reads as unattempted; zero
rows is rejected at parse, not scored as 0/0). It leaves the response shape
and the error taxonomy for a malformed response undecided — `selection`
(docs/decisions/0008) had already answered the analogous questions for a
different item shape, so this card is mostly "does the same reasoning still
apply," not a fresh design.

## Options considered

### 1. Response shape

`selection`'s response is `{ selectedOptionIds: string[] }` — one field,
because a selection response is a single set. A grid response is N
independent booleans, so the candidates were a map (`Record<rowId,
boolean>`) or an array of `{ rowId, answer }`. Chose the **array**, matching
`selection`'s own `strictObject` array pattern where it has one (`options`,
`rows`) and keeping "which rows were answered" and "what they answered"
representable without relying on `Object.keys` order or JSON key-ordering
assumptions. A row with no entry in the array is unanswered — there is no
separate `null`/`undefined` per-row value.

### 2. What counts as "unanswered" vs. a broken response

Per acceptance, a partial grid must score (not throw, not read as
unattempted). This card treats **absence** as unanswered: a response array
shorter than `rows.length` is normal and expected, not malformed. Contrast
`selection`, where absence of a *selected* id is unattempted but there is no
equivalent "partial" concept because a selection item has exactly one
question, not N.

Considered requiring every row to appear in the response (with an explicit
`{ rowId, answer: null }` for "skipped"), rejected: it adds a shape the
client has no reason to construct, for a scoring outcome (unanswered =
incorrect) identical to just omitting the row.

### 3. The error channel

Same pattern as `selection` (0008 §3): `ItemScoreResult` has no error
channel, so a response no learner could have produced throws a typed error
(`SelectionGridResponseError`) rather than a sentinel score. This is the
second type to need it — 0008 flagged ITEM-004..007 as "the test of the
error channel" and said a second instance is expected, a third is the
signal to reconsider widening `ItemScoreResult` itself. One down.

Codes: `malformed` (not the shape at all), `unknown_row` (references a row
id the item does not have — this card's acceptance line, "a row referencing
an unknown statement id"), `duplicate_row` (the same row answered twice —
ambiguous, not a de-dupe candidate, since the two answers could disagree).
There is no `too_many_selections`-equivalent: a grid has no single-vs-multi
distinction to violate.

### 4. Sub-result identity

Acceptance requires each `subResult` to carry "its row identity." The
shared `SubResult` type had no field for this at all — see
`docs/decisions/0009-subresult-identity.md`, a contract change made in its
own commit ahead of this one. `selection_grid` populates it with the row's
own `id` (`row.id`), the natural choice since a row already has one and
nothing else on the row is a candidate identifier.

### 5. Item weight: `possible` is the row count, one `subResult` per row

Unlike `selection` (`possible: 1` regardless of option count — 0008 §2),
each row here is scored independently: no response-shaped denominator, no
over-selection case, so nothing prevents `possible` from decomposing
per-row. This is also what the acceptance line requires directly
("`possible` equals the number of rows"), so there was no real alternative
to evaluate — 0008 §2 already named this consequence when it was written
("ITEM-004's acceptance fixes `possible` to its row count").

### 6. Parse invariants

- **Zero rows** rejected via `.min(1)` — the acceptance line naming this
  case explicitly ("must be rejected at parse, not scored as 0/0").
- **Duplicate row ids**, same reasoning as `selection`'s duplicate option
  ids: a response id must identify exactly one row.
- **A missing `explanationRef` per row`** — same reasoning as `selection`
  (0008 §4): `SubResult` requires one, and the handoff principle ("every
  mistake gets an explanation") applies per-row here specifically because
  the acceptance calls out per-row explanations as an authoring burden, not
  a scoring one (`docs/handoff.md`, "failure modes identified").

`authoredString` reuse for `prompt` and each row's `statement`, same
convention as `selection`.

## Decision

- Response: array of `{ rowId, answer }`; a row absent from it is
  unanswered and scores incorrect, not excluded.
- `score` throws `SelectionGridResponseError` (codes: `malformed`,
  `unknown_row`, `duplicate_row`) for an impossible response; a partial or
  fully-empty response scores rather than throwing.
- `possible` = `rows.length`; one `subResult` per row, `possible: 1` each,
  `earned` 0 or 1.
- Zero rows rejected at `parse`, not scored.

## What would make us revisit this

- **ITEM-005..007**, per 0008: if a third type needs the throw-typed-error
  pattern, `ItemScoreResult` growing an error channel in ITEM-001 gets a
  second look instead of a fourth ad hoc error class.
- If authoring ever wants to distinguish "skipped" from "answered false" in
  analytics (not scoring — scoring treats them identically by design), the
  array-of-answered-rows shape would need a third response state, which is
  a response-shape change, not a scoring one.
