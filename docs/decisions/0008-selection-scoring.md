# 0008 — selection: the multi-answer scoring rule, and how a broken response is reported

## Context

ITEM-003 (issue #51). Its acceptance makes two things explicit: the
multi-answer rule must be "DECIDED AND RECORDED, not assumed ... because it
changes what a learner sees", and "a response referencing an unknown option id
is rejected by `parse`/`score` rather than silently scoring zero — a client bug
and a wrong answer must not look identical."

`selection` covers MCQ single, MCQ multi and True/False as one type. Only
multi-answer has a scoring question at all; the other two are the n=1 case of
whatever rule multi gets.

## Options considered

### 1. The multi-answer rule

Four candidates, scored on a 4-correct-of-8-options item:

| learner's answer | all-or-nothing | penalty | pure ratio | max() denominator |
|---|---|---|---|---|
| 4 correct, 0 wrong | 1 | 1 | 1 | 1 |
| 2 correct, 0 wrong | 0 | 0.5 | 0.5 | 0.5 |
| 4 correct, 1 wrong | 0 | 0.75 | 1 | 0.8 |
| 2 correct, 2 wrong | 0 | 0 | 0.5 | 0.5 |
| selects all 8 | 0 | 0 | **1** | 0.5 |
| nothing selected | 0 | 0 | 0 | 0 |

**All-or-nothing** is ruled out by `docs/handoff.md`: "Nothing demotivates the
learner. 8 of 10 correct is 80%, counted as progress — not a failed item."
Treating "3 of 4 correct options, missed the 4th" as a full miss is the exact
case that principle names.

**Penalty**, `max(0, (correctSelected − incorrectSelected) / totalCorrect)`,
was this card's original proposal and was rejected in review: a learner who
finds 2 of 4 correct options and guesses 2 wrong ones has demonstrably learned
something and scores 0 under it, which lands on the wrong side of the same
handoff principle. Its appeal was that it collapses to the single-answer case
for free (n=1: right → 1, wrong → max(0,−1) → 0).

**Pure ratio**, `correctSelected / totalCorrect`, is the softest rule and the
one review asked for — but it has no term for wrong selections at all, so
ticking every option always scores 1. That inverts the incentive the item
exists for: the learner who thinks and gets 3 of 4 scores below the learner who
selects everything without reading.

**max() denominator** — chosen:

```
earned = correctSelected / max(totalCorrectOptions, selectedCount)
```

It is the pure ratio with one change: the denominator grows when, and only
when, the learner selects more options than the item has correct ones. Below
that threshold `max` is inert and this is literally `correctSelected /
totalCorrect` — verified in `lib/items/selection.test.ts`, "is a plain
correctSelected/totalCorrect whenever the learner does not over-select". There
is still no penalty term: nothing is subtracted, and adding a further *correct*
selection never lowers the score (test: "selecting one more correct option
never lowers the score"). What it does remove is the shotgun strategy (test:
"the max() denominator: selecting every option does not score 100%"). Removing
the `max` turns that case from 0.5 into 1 and fails three tests — run with the
`max` deleted from the denominator, 3 failed | 23 passed.

It collapses to the single-answer case exactly as the penalty rule did: with
`multi: false` a response carries at most one id, so `max(1, selectedCount)` is
1 and the score is 1 or 0. True/False is the same path with two options. No
branch in `score` reads `multi` except the over-selection guard.

The cost, recorded honestly: "earned = the fraction of the correct answers you
found" is one step harder to explain to a course author than the pure ratio,
because it is only true while they do not over-select. The alternative was to
keep the pure ratio and cap selections in the UI instead, which moves the
problem to the authoring/render layer rather than solving it in the one place
both would have to agree.

### 2. Item weight: `possible` is 1, with one `subResult`

A selection item contributes `possible: 1` to the lesson total, and partial
credit is a fraction of that single unit. The alternative — `possible =
totalCorrectOptions`, with one `subResult` per correct option — cannot express
this rule at all: the denominator depends on `selectedCount`, a property of the
whole response, so it does not decompose into independent per-option results.

Consequence, stated because it is a real weighting choice and not a detail: in
`Σearned / Σpossible` (the lesson score, per `docs/handoff.md`) a selection
item counts once regardless of how many options it has, while a 10-row
`selection_grid` will count ten times (ITEM-004's acceptance fixes `possible`
to its row count). That is the intended reading — a grid of ten statements *is*
ten questions — but it means item weight follows sub-part count, not authoring
effort.

Per-option check/cross in the UI does not need per-option `subResults`: the
renderer already holds the item (`correctOptionIds`) and the response, so it
can mark each option without scoring telling it to.

### 3. How a broken response is reported

`ItemTypeModule.score()` (ITEM-001) returns `ItemScoreResult` and has no error
channel. Widening that shared contract — an `ok/error` result, say — would
touch every present and future type module, which is a shape-of-the-deliverable
change this card is not entitled to make alone (CLAUDE.md, "Working on a board
issue"). Two ways to satisfy the acceptance line without touching it: return a
sentinel score, or throw.

Chose **throw**, as `SelectionResponseError` (a typed `Error` with a `code` and
the `itemId`), for responses that no learner could have produced:

| code | when |
|---|---|
| `malformed` | not the response shape at all |
| `unknown_option` | names an option id the item does not have |
| `duplicate_selection` | the same id twice — a checkbox cannot be ticked twice |
| `too_many_selections` | more than one selection on a `multi: false` item |

A sentinel score would have to be a number, and every number in `[0,1]` is a
legitimate score, so it would re-create exactly the ambiguity the acceptance
line forbids. A thrown typed error is distinguishable from a real (possibly
zero) score by construction.

`duplicate_selection` is on that list for a concrete reason, not tidiness:
under the `max()` denominator `["a","a"]` would score 1/2 where `["a"]` scores
1/4, so silently de-duplicating changes the grade.

**What deliberately does NOT throw:** a `null`/`undefined` response and an
empty `selectedOptionIds` both mean *unattempted* and score 0. A learner really
can submit nothing, so it is not a client bug; this also matches ITEM-004's
acceptance for the sibling type ("a partially answered grid ... does not throw
and does not score the item as unattempted").

The item-side invariant (`correctOptionIds` empty → division by zero → `NaN` in
a lesson total) throws a plain `Error`, not a `SelectionResponseError`: `parse`
rejects that payload, so only a hand-built item that skipped `parse` can reach
it. Typed errors are for input a client can actually produce; assertions are
for states that should be unreachable.

### 4. Parse invariants decided here

`parse` rejects, beyond the obvious shape checks:

- **Every option correct** (`correctOptionIds.length >= options.length`). Such
  an item cannot be answered wrongly, so it measures nothing, and it is the one
  shape where "select everything" scores 1 legitimately.
- **`multi: false` with more than one correct option** — the surface form and
  the answer key would disagree.
- **Duplicate option ids** (a response id must identify exactly one option) and
  **duplicate option text** (the `lib/exerciseValidate.ts` rule: two identical
  options are indistinguishable to the learner).
- **A missing `explanationRef`.** `SubResult` requires one and `docs/handoff.md`
  says "Every mistake gets an explanation", so an item without one cannot
  produce a complete score result. It is a reference, not text — ITEM-009 still
  owns resolution.

Authored strings (`prompt`, option `text`) reuse `authoredString` from
`lib/courseContent.ts`, so the C0-control guard is the same one the importer
and `exerciseValidate` apply; `selection` adds no second convention.

## Decision

- `earned = correctSelected / max(totalCorrectOptions, selectedCount)`;
  `possible = 1`; one `subResult` carrying the same numbers plus
  `explanationRef`, with `correct: earned === possible`.
- No penalty term. Over-selection dilutes, it never subtracts.
- `score` throws `SelectionResponseError` (coded) for an impossible response;
  unattempted scores 0.
- Item-level impossibilities are rejected at `parse`, not scored.

## What would make us revisit this

- **ITEM-004..007 are the test of the error channel.** If a second or third
  type also needs to reject a response, the throw-with-a-typed-error pattern
  here is the one to copy — or, if three of them need it, that is the evidence
  that `ItemScoreResult` should have grown an error channel in ITEM-001 after
  all, and the contract gets a second pass before five modules have each
  invented their own error class.
- If authoring ever produces a multi item where over-selection is the honest
  answer (an item whose correct set genuinely is "all of them"), the
  every-option-correct parse rejection is what blocks it, and the pair of that
  rejection and the `max()` denominator should be reconsidered together — they
  exist for the same reason.
- If learner data shows over-selection is rare enough not to be worth the
  explanation cost, the rule simplifies to the pure ratio by deleting the
  `max(...)` and its three tests. Nothing else depends on it.
- If a selection item ever needs to weigh more than one unit in a lesson (a
  10-option multi counting like a 10-row grid), `possible: 1` is the line to
  change, and it changes every lesson percentage that contains one — so it is a
  content decision, not a scoring tweak.
