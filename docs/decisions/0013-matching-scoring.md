# 0013 — matching: subResult identity and the many-to-one question

## Context

ITEM-006 (issue #54) implements the `matching` item type. Two questions were
left for this card to decide and record, per its own acceptance line and per
0009-subresult-identity.md's open item:

1. What identifies a `matching` subResult — the left element's id, the right
   element's id, or a synthesized pair id? 0009 explicitly declined to guess.
2. Is mapping two left items to the same right item legal input, or
   malformed?

## Decision 1 — subResult id is the pair's own `id`

Each authored pair (`payload.pairs[]`) carries its own `id`, separate from
`left`/`right`, which are references into the `left`/`right` element arrays.
`SubResult.id` is this pair id.

Rejected: reusing the left element's id. `pairs[].left` is already
constrained to be unique across pairs (a left element has at most one
correct partner — see Decision 2), so it would work as an id today, but it
conflates "the element the question presents" with "the sub-part being
scored" — the same distinction `selection_grid` keeps by giving each row its
own `id` distinct from `statement`. A future change that let an element
appear in more than one pair (see "what would make us revisit") would break
a left-id-as-subResult-id scheme; an explicit pair id does not need that
constraint to hold.

## Decision 2 — many-to-one is legal, both authored and answered

Two different pairs may name the same `right` id as the correct partner for
two different `left` ids (e.g. two near-synonyms both matching one
definition). Consequently, a learner's response may also map two different
`left` ids to the same `right` id — that is not a distinguishable case from
"the response happens to be correct for an authored many-to-one pair", so
rejecting it would make a fully correct answer to a many-to-one item
unsubmittable.

This is the deciding asymmetry against treating a repeated `right` id the
way `ordering` treats a repeated element (as `duplicate_id`): `ordering`'s
response is a permutation, where physical repetition is never valid for ANY
input. `matching`'s response is not a permutation — two independent
selections may legitimately coincide.

What IS still rejected as `duplicate_id`: the same `left` id appearing twice
in one response. That is ambiguous (which of the two answers for that left
item counts?) in a way a repeated `right` id is not — each entry keyed by a
distinct `left` id is scored independently and unambiguously regardless of
what `right` id it names.

`pairs[].left` values must be distinct within `payload.pairs` (enforced at
parse) for the same reason: a left element scored by two different pairs
would make "the pair for this left id" ambiguous. `pairs[].right` values are
NOT required to be distinct — that is exactly the many-to-one case this
decision makes legal.

## What would make us revisit this

- If a future authoring need wants one left element to have more than one
  correct right partner (as opposed to two left elements sharing one right
  partner), `pairs[].left` uniqueness would need to be relaxed and subResult
  identity revisited — a pair id alone would no longer identify "the
  sub-part for this left element" uniquely.
- If the built renderer turns out to model right-side chips as a consumable
  pool (each chip usable once, UI-enforced), the many-to-one authoring case
  becomes uneditorializable in that renderer even though the scoring module
  still accepts it — that would be a renderer constraint layered on top, not
  a reason to reopen this decision.
