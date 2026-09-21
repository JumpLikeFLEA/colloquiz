# 0011 — ordering: per-position scoring, and why an incomplete permutation is rejected, not scored

## Context

ITEM-005 (issue #53). Acceptance requires the scoring rule to be "DECIDED
AND RECORDED, not assumed," names per-position credit as the likely fit for
A2–B1 word order but requires the reasoning to be written down rather than
defaulted to. It also requires the duplicate and missing-element response
cases to be "rejected at parse... not a wrong answer" — this module has no
separate response-parse step (see `lib/items/ordering.ts`'s `readOrder`), so
"rejected at parse" is read here as it was for `selection`/`selection_grid`
(0008 §3, 0010 §3): rejected before scoring, not scored as a wrong answer.

## Options considered

### 1. The scoring rule

Three candidates named in the acceptance line:

- **Exact permutation** (all-or-nothing): ruled out for the same reason
  0008 ruled it out for `selection` — `docs/handoff.md`, "8 of 10 correct is
  80%, counted as progress." A 5-element sequence with one adjacent swap
  (4 of 5 words already in the right place) scoring 0 is the ordering
  instance of exactly the case that principle names.
- **A distance metric** (e.g. Kendall tau, or "how far each element is from
  its correct slot"): rejected as the wrong signal for a *word-order*
  exercise specifically — a distance metric rewards "close to the answer"
  even when no single word landed in a position a reader would call correct,
  which does not match how a language learner (or a teacher) would grade
  word order by eye. It is also harder to explain to the partner authoring
  content than "count the words in the right place."
- **Per-position credit** — chosen: `earned` = number of positions where the
  submitted element matches the authored element at that position,
  `possible` = element count. This is the plain reading of "8 of 10 correct
  is 80%" applied to a sequence instead of a set, and it is what the
  acceptance line itself flags as the likely fit.

Consequence, stated because it is a real weighting choice and not a detail:
a 5-element ordering item counts as *5* toward the lesson's `Σearned /
Σpossible` (`docs/handoff.md`), the same "item weight follows sub-part
count" consequence 0008 §2 recorded for `selection_grid`.

### 2. What makes a response valid: complete permutation, or partial-with-gaps

`selection_grid` (0010 §2) treats an unanswered row as scorable — it counts
as incorrect, not as a reason to reject the response. `ordering` does not
extend that to a partial submission (some slots filled, others empty),
because the two are not analogous: a `selection_grid` row is an independent
yes/no question with a well-defined "no answer" state per row. An ordering
response is a single sequence; if an element is missing from it, there is no
principled way to say which position in the remaining 4-of-5 sequence should
be read as "missing" without the client also telling us which slot it left
empty — the acceptance's own test list ("a response missing an element")
treats this as malformed input, not as an information-bearing partial
answer. So a submitted response must be a *complete* permutation of the
item's element ids; only `null`/`undefined` (nothing submitted at all) reads
as unattempted.

### 3. Sub-result identity

Per `docs/decisions/0009-subresult-identity.md`, each `subResult`'s `id` is
"the sub-part's own id." For ordering, the sub-part is a *position*, and the
position's natural id is the element that authoring says belongs there —
`elements[i].id` — not a synthesized `"pos-0"` string, since the element
already has a stable id and the UI wants to know "is the word that belongs
in slot 3 present there," which this id answers directly.

### 4. The error channel

Same pattern as `selection` and `selection_grid`: `score` throws a typed
`OrderingResponseError` (`malformed`, `duplicate_element`, `unknown_element`,
`missing_element`) for a response no learner's drag interaction could have
produced. This is the third type to need the pattern — 0008 named ITEM-004
as the test of whether a second type needs it, and said a third is the
signal to reconsider widening `ItemScoreResult` with a real error channel
rather than three modules each defining their own `Error` subclass. Noted
here for whoever picks up ITEM-006/007: the pattern has now repeated three
times with materially the same four-ish codes (malformed / references
something unknown / duplicates something / an item-side invariant that
should be unreachable past `parse`), which is worth weighing against the
cost of widening the contract before a fourth module reinvents it again.

### 5. Parse invariants

- **Fewer than 2 elements** rejected — the ordering analogue of `selection`'s
  "every option correct" rejection (0008 §4): a single-element sequence has
  only one possible order and cannot be answered wrongly, so it measures
  nothing.
- **Duplicate element ids** — a response id must identify exactly one
  element, same reasoning as `selection`'s duplicate option ids and
  `selection_grid`'s duplicate row ids.
- **A missing `explanationRef`** — same reasoning as the other two types
  (0008 §4, 0010 §6): `SubResult` requires one.

Unlike `selection`, duplicate or repeated **text** across elements is NOT
rejected: a word-order sentence can legitimately repeat a word ("that that
is true"), and correctness is decided by id, not by the text a `.text`
duplicate would make visually ambiguous — the UI ambiguity that concerned
`selection`'s options (indistinguishable choices) does not apply to tokens a
learner drags by position rather than selects by identity.

`authoredString` reuse for `prompt` and each element's `text`, same
convention as the other two types.

## Decision

- `earned` = positions where the submitted id matches the authored id at
  that position; `possible` = element count; one `subResult` per position,
  `id` = the element that belongs there.
- A response must be `null`/`undefined` (unattempted, scores 0) or a
  complete permutation of the item's element ids. Duplicate, unknown, or
  missing element ids all throw `OrderingResponseError`, never score as
  partial.
- Elements are authored in the correct order; there is no separate
  `correctOrder` field.
- Fewer than 2 elements rejected at `parse`, not scored.

## What would make us revisit this

- **Not a future trigger — already met.** `ordering` is the THIRD item type
  to need the throw-typed-error pattern (after `selection`, `selection_grid`),
  which is the exact threshold `docs/decisions/0008-selection-scoring.md`
  recorded: "if three of them need it, that is the evidence that
  `ItemScoreResult` should have grown an error channel." The contract's
  second pass is filed as ITEM-011, decided in
  `docs/decisions/0012-item-response-errors.md` (option 1: shared
  `ItemResponseError` class, throw channel unchanged) and carried out by
  ITEM-012, which migrated `selection`, `selection_grid` and `ordering` onto
  it.
- If content ever wants partial credit for "close but not exact" placement
  (the distance-metric option rejected above), that is a genuine content
  need this decision does not serve, and revisiting it means re-opening
  option 1, not bolting a second rule onto this one.
- If the drag UI ever wants to represent "some slots filled, others empty"
  as a submittable, scorable state (rather than a client-side-only
  in-progress state that is never sent to `score`), the "missing element
  throws" decision in §2 is the one to revisit — it currently assumes the
  client never submits an incomplete permutation.
