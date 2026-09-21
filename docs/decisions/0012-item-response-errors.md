# 0012 — shared response-error contract for item types

## Context

ITEM-011 (issue #60), `type:decision`. `selection`, `selection_grid` and
`ordering` each throw a module-scoped `Error` subclass
(`SelectionResponseError`, `SelectionGridResponseError`,
`OrderingResponseError`) for a response no learner's client could have
produced, so a lesson-level caller can tell "client bug" from a legitimate
zero score without a sentinel number in `[0,1]` — see
`docs/decisions/0008-selection-scoring.md` §3. 0008 named this pattern
repeating a third time as the signal to give `ItemScoreResult` a real error
channel instead of a fourth and fifth module each inventing its own class;
0011 confirmed the threshold was met and filed this card. Lay out options
with evidence; the owner decides.

## Evidence

### a. Production call sites of `score()` / `scoreItem()`

```
$ grep -rn "\.score(\|scoreItem(" --include=*.ts --include=*.tsx -- lib app | grep -v "\.test\.ts"
lib\items\ordering.ts:...        (module-internal throw sites, not calls)
lib\items\selectionGrid.ts:...   (module-internal throw sites, not calls)
lib\items\selection.ts:...       (module-internal throw sites, not calls)
lib\items\index.ts:35:export function scoreItem(item: Item, response: unknown): ItemScoreResult {
lib\items\index.ts:37:  return typeModule.score(item as never, response);
```

`scoreItem` (`lib/items/index.ts:35-38`) is the only call site outside the
three modules' own tests, and it is a bare passthrough — no try/catch, no
error handling, no caller of `scoreItem` itself exists yet anywhere in
`app/` or `lib/`. **No lesson-level caller exists today.** This changes the
cost comparison for options 2 and 3: widening the contract now touches
`index.ts` and three modules with zero call sites to migrate; done later, it
also touches whatever lesson-runner code has been written against the
current throwing contract by then.

### b. Error codes across the three existing classes

| code (as thrown today) | module | trigger | same meaning elsewhere? |
|---|---|---|---|
| `malformed` | selection | response fails `SelectionResponseSchema` | same meaning in all three — "not the response shape at all" |
| `malformed` | selection_grid | response fails `SelectionGridResponseSchema` | ″ |
| `malformed` | ordering | response fails `OrderingResponseSchema` | ″ |
| `unknown_option` | selection | selected id not among the item's options | same meaning as `unknown_row` / `unknown_element` — "references an id the item does not have" |
| `unknown_row` | selection_grid | answered `rowId` not among the item's rows | ″ |
| `unknown_element` | ordering | placed id not among the item's elements | ″ |
| `duplicate_selection` | selection | same option id selected twice | same meaning as `duplicate_row` / `duplicate_element` — "the same id appears twice where a set/permutation forbids it" |
| `duplicate_row` | selection_grid | same `rowId` answered twice | ″ |
| `duplicate_element` | ordering | same element id placed twice | ″ |
| `too_many_selections` | selection | >1 selection on a `multi: false` item | type-specific — no analogue; a grid/ordering response has no "single-answer" constraint |
| `missing_element` | ordering | response omits an element id the item has | type-specific — no analogue; `selection` has no "must appear" requirement (unselected = not chosen) and `selection_grid` treats an absent row as unanswered-and-scored, never an error |

Unifiable into one 3-way union: `malformed`, `unknown_id`, `duplicate_id`.
Kept type-specific: `too_many_selections` (selection only), `missing_element`
(ordering only). This is the direct input to any shared code union under
options 1 and 2, and to the codes a shared `parseResponse` would return under
option 3.

### c. `ItemTypeModule.parse`'s existing error shape (`lib/items/types.ts:64-68`)

```ts
export type ParseError = { field: string; message: string };

export type ParseResult<TItem> =
  | { ok: true; item: TItem }
  | { ok: false; errors: ParseError[] };
```

Untagged (no `code`), string-`field`-keyed, and carries a *list* of errors
(zod can report several issues from one payload in one pass — see
`toParseErrors` in each module). This is what option 3's "mirrors `parse`"
argument rests on, but the mirror is inexact: `parse`'s errors have no
`code` union at all (`field` free-text stands in for it) and are plural, where
every existing response-error class is singular (`score`/`readSelection`
etc. throw on the *first* problem found, never accumulate). A `parseResponse`
built to genuinely mirror `parse` would need to decide whether response
errors also become a list — a scope question this card's evidence does not
resolve on its own.

### d. Reliance on catching a module-specific class by name

```
$ grep -rn "instanceof (Selection\|SelectionGrid\|Ordering)ResponseError\|toBeInstanceOf(" lib/items/*.test.ts
lib\items\selection.test.ts:64:    if (error instanceof SelectionResponseError) return error;
lib\items\selection.test.ts:171:    expect(error).toBeInstanceOf(SelectionResponseError);
lib\items\selectionGrid.test.ts:119:    if (error instanceof SelectionGridResponseError) return error;
lib\items\ordering.test.ts:91:      if (error instanceof OrderingResponseError) return error;
```

All four uses are in the three modules' own test files (each testing its own
class), not in cross-module or lesson-level code. **Nothing outside a
module's own test suite catches its response-error class by name today** —
so no production code breaks under any option; only the three test files'
`scoreError()` helpers and one `toBeInstanceOf` assertion need updating to
match whatever shape is chosen, regardless of option.

## Options

### 1. Shared base error class — `ItemResponseError { code, itemId, itemType }`, `score()` still throws

`score()`'s signature is unchanged (`(item, response) => ItemScoreResult`,
still throws on a broken response); only the thrown value's *class* changes
from three ad hoc `Error` subclasses to one shared one, parameterized by an
added `itemType` field and a code drawn from a shared union plus each
type's own extension.

- **Files touched:** `lib/items/types.ts` (new `ItemResponseError` class +
  shared code union), `selection.ts`, `selectionGrid.ts`, `ordering.ts`
  (delete their own class, throw the shared one with `itemType` supplied),
  their three `.test.ts` files (`instanceof SelectionResponseError` →
  `instanceof ItemResponseError`, plus asserting `.itemType`). `index.ts`
  and `ItemTypeModule` are untouched — no interface change.
- **`ItemTypeModule` signature change:** none. `score`'s type is exactly what
  it is today.
- **Lesson-level caller's check:** `try { scoreItem(...) } catch (e) { if (e
  instanceof ItemResponseError) { /* client bug */ } else throw; }` — one
  `instanceof` check instead of five per-type ones (today's implicit
  alternative), but still exception-based control flow for an expected,
  routine condition (a stale client sending a response against an edited
  item). Every future type module must remember to throw the shared class
  and not reintroduce its own — nothing in the type system enforces this,
  since `score`'s return type says nothing about what it throws.
- **`__sketches__/freeText.ts`:** compiles unchanged — it doesn't throw at
  all today (`score` always returns `{earned: 0, possible: 1, subResults:
  []}`), and this option touches no interface it implements against.
- **ITEM-006/007 (`matching`, `slots`):** each throws `new
  ItemResponseError("malformed" | "unknown_id" | "duplicate_id" | <own
  type-specific code>, item.id, item.type, message)` instead of defining
  `MatchingResponseError` / `SlotsResponseError`. Smallest diff of the three
  options for those two cards.

### 2. Error channel on `ItemScoreResult` — `score()` returns `ok | error`

`ItemScoreResult` (or `score`'s return type) becomes a discriminated union,
e.g. `{ ok: true; earned; possible; subResults } | { ok: false; code;
itemId; itemType; message }`. `score()` never throws for a malformed
response; it returns the error variant.

- **Files touched:** `lib/items/types.ts` (widen `ItemScoreResult` or add a
  new `ScoreResult` union + shared code type — a genuine contract change),
  `selection.ts`, `selectionGrid.ts`, `ordering.ts` (`readSelection` /
  `readResponse` / `readOrder` stop throwing and return an error value that
  `score` forwards), `index.ts` (`scoreItem`'s return type follows), all
  three `.test.ts` files (every existing test that reads `.earned` /
  `.possible` off the result now must narrow `result.ok` first — this is the
  widest test blast radius of the three options), plus every other reader of
  `ItemScoreResult` — today that's nothing outside `lib/items/`, per (a), but
  it is the shape a lesson-runner and any renderer that reads a score result
  will be written against from here on.
- **`ItemTypeModule` signature change:** yes — `score`'s return type widens.
  This is the exact change 0008 (§3) declined to make alone, calling it
  "a shape-of-the-deliverable change this card is not entitled to make
  alone" — which is why 0008/0010/0011 chose throw instead and left this
  decision for ITEM-011. That is precisely why this card exists: ITEM-011 is
  the card entitled to reopen the `ItemTypeModule`/`ItemScoreResult`
  contract, so widening it here is not a cost against this option — it's
  the thing a `type:decision` card is for.
- **Lesson-level caller's check:** `const result = scoreItem(item,
  response); if (!result.ok) { /* client bug, result.code */ } else {
  /* use result.earned/possible/subResults */ }` — ordinary control flow, no
  `instanceof`, no exception for a routine condition, and the type checker
  forces every caller to handle the error case (an `ok`-narrowed result is
  the only way to reach `.earned`). Strongest mechanical guarantee of the
  three options that a caller can't forget the check.
- **`__sketches__/freeText.ts`:** compiles, but the module built against the
  interface *after* this widening would need to return `{ ok: true, ... }`
  rather than the bare object it returns today — the sketch itself doesn't
  break (nothing calls `.score()` on it in the sketch file), but the
  interface it proves compiles against shifts, so the sketch would need a
  one-line update to keep proving the abstraction holds.
- **ITEM-006/007:** implement `score` returning `{ ok: false, code, ... }`
  instead of throwing. Slightly larger diff than option 1 per module
  (every early-return becomes a return-with-shape instead of a throw), but
  no new class to author.

### 3. Response validation split from scoring — `parseResponse(item, raw)` mirrors `ItemTypeModule.parse`

A new function per module, `parseResponse(item, raw): ValidatedResponse |
ResponseParseError[]` (or a `ParseResult`-shaped `{ ok, ... }`, per (c)),
runs before `score`. `score` itself is narrowed to accept only an
already-validated response type and therefore cannot fail — `readSelection`
/ `readResponse` / `readOrder`'s validation logic moves into
`parseResponse`; `score` becomes pure arithmetic over a value that is
already known-good.

- **Files touched:** `lib/items/types.ts` (new `parseResponse` slot on
  `ItemTypeModule`, a `ResponseParseError` type, and — per (c) — a decision
  on whether it returns one error or a list, since `parse`'s own
  `ParseResult` returns a list and an inexact mirror is worse than either a
  faithful one or an admittedly-different one), `selection.ts`,
  `selectionGrid.ts`, `ordering.ts` (split each `readX` function in two:
  validation → `parseResponse`, arithmetic → `score`; `score`'s parameter
  type narrows from `unknown` to the validated response type), `index.ts`
  (`scoreItem` becomes two calls — `parseResponse` then `score` — or a
  combinator that does both, which is itself a design choice not yet
  decided), all three `.test.ts` files (every existing malformed-response
  test moves from calling `.score()` and catching, to calling
  `.parseResponse()` and inspecting the result — the most structural of the
  three test rewrites).
- **`ItemTypeModule` signature change:** yes, and the largest of the three —
  a new required method every module (present and future) implements, plus
  `score`'s parameter type narrows (today `unknown`, matching the interface
  in `lib/items/types.ts:134`). Same category of change as option 2, and for
  the same reason as option 2 above: this card is where that contract is
  allowed to be reopened.
- **Lesson-level caller's check:** two calls instead of one —
  `const validated = mod.parseResponse(item, raw); if (!validated.ok) {
  /* client bug */ } else { const result = mod.score(item,
  validated.response); /* result can never itself signal an error */ }`.
  This is the only option where a *legitimate zero score* and a *client bug*
  are structurally impossible to confuse even in principle, because `score`
  has no error path left to conflate with a real score — option 1 still
  relies on a caller remembering the `instanceof` check, option 2 still
  relies on a caller narrowing `.ok` before reading `.earned`, but here the
  type that reaches `score` cannot represent "malformed" at all.
- **`__sketches__/freeText.ts`:** does **not** compile unchanged — it
  implements `ItemTypeModule<FreeTextItem, string>` with only `parse` and
  `score`; a `parseResponse` becoming part of the interface means the sketch
  needs a trivial addition to keep compiling. ITEM-001's acceptance is about
  admitting a type this card was never told about *without changing
  `types.ts`/`index.ts` to accommodate it* — it is not a promise that
  `ItemTypeModule` itself never grows a member, and options 2 and 3 are both
  exactly the kind of considered, card-level contract change 0008 deferred to
  ITEM-011 for. This is a per-type maintenance cost of option 3 (every
  module, including the sketch, picks up one more method), not a violation
  of the sketch's test or a disqualifying finding.
- **ITEM-006/007:** implement `parseResponse` (validation: pair id
  existence for `matching`, gap-answer shape for `slots`) separately from
  `score` (pure credit arithmetic). Cleanest separation of the three for
  authoring two brand-new modules from scratch, at the cost of the
  interface change above landing on the same card that also has to design
  `matching`/`slots` response shapes for the first time — two decisions
  compounding in one card, which 0008/0010/0011 each avoided by resolving
  the shape question before the error question.

All three options keep 0008's binding constraint: none encodes an error as
a number in `[0,1]`. Option 1 keeps that guarantee by throwing (an error is
never a return value at all). Options 2 and 3 keep it by making the error a
distinct, differently-shaped branch of a discriminated union rather than a
sentinel `earned`/`possible` pair — `result.ok === false` is checked by its
own field, not inferred from a score that happens to look wrong.

## Recommendation

**Option 1** (shared base class, `score()` still throws), labelled as a
recommendation, not a decision.

Correction to how the zero-callers finding (a) should be read: it does
**not** make option 1 cheaper than 2/3 — if anything it's the opposite. With
no production caller of `scoreItem` yet, there is nothing to migrate under
*any* option: widening `ItemScoreResult` (option 2) or adding
`parseResponse` (option 3) is at its cheapest right now, before a
lesson-runner is written against today's throwing contract. So (a) does not
argue for option 1 on migration-cost grounds — it removes migration cost as
a deciding factor for any of the three. The choice has to be made on the
benefit each option gives a caller that doesn't exist yet, not on which one
is less work to introduce today.

Reasoning: a malformed response — a stale client sending a response shaped
for an item that's since been re-authored, or a genuine client bug — is an
*exceptional*, not routine, condition: no correct client ever produces one.
0008 already established that a thrown typed error is distinguishable from
any real score, including a legitimate zero, "by construction" (§3) — that
property is not in question and does not depend on which option is chosen.
What ITEM-011 was actually filed to fix is *duplication*: three modules each
invented their own `Error` subclass with materially the same codes. Option 1
fixes exactly that defect with the smallest change — one shared class, one
unified code union — while leaving the channel (throw, for an exceptional
condition) as it already correctly is.

Option 2 makes every caller handle an `ok`/`error` branch on every call,
including the overwhelming majority of calls where the client is correct and
the branch can never be taken — normal control flow is bent around a case
that, by construction, only a bug reaches. Option 3's structural
"impossible to confuse" property is real, but its benefit is realized at a
validation boundary that only a caller — a lesson runner, or wherever
responses first reach `scoreItem` — can define; no such caller exists yet to
own that boundary, so the benefit is currently theoretical rather than
something this repo can point to and say it needs.

**What would change this recommendation:** when the first production caller
of `scoreItem` — a lesson runner, or server-side response scoring — is
designed, option 3 should be reconsidered against that caller's actual
needs (in particular whether it wants several independent response problems
reported at once, the way `parse` already can). Moving from option 1 to
option 3 later is additive (a new `parseResponse` method plus a narrower
`score` parameter type), not a rewrite of the shared error class option 1
introduces now — so deferring that reconsideration costs nothing.

## Decision

**Option 1 — shared base class (`ItemResponseError { code, itemId,
itemType }`), `score()` still throws.** Decided 2026-09-21, owner's call.

A malformed response is a client bug, not a routine outcome — no correct
client produces one — so a typed throw is the right channel for it, and
0008 already established that a thrown typed error is distinguishable from
any real, possibly-zero score by construction. The defect ITEM-011 exists to
fix is that three modules each reinvented that same typed-error pattern with
overlapping codes; option 1 fixes that duplication directly (one shared
class, one unified `code` union: `malformed` / `unknown_id` /
`duplicate_id` shared, `too_many_selections` / `missing_element` kept
type-specific) without changing the channel.

Option 2 was rejected because it forces every caller — including every
correct client's every call — to branch on an `ok`/`error` result to reach a
case only a bug ever produces; that cost is paid on every call, not just the
exceptional ones. Option 3's benefit (a validation boundary structurally
incapable of returning a bad score) is real, but it belongs to whoever owns
response validation at the point responses first arrive — a lesson runner or
equivalent — and no such caller exists in this repo yet to define that
boundary or benefit from it.

**Revisit trigger:** when the first production caller of `scoreItem` is
designed — a lesson runner, or server-side response scoring — reconsider
option 3 against that caller's real requirements. Moving from option 1 to
option 3 is additive (add `parseResponse`, narrow `score`'s parameter type),
not a rewrite, so this is safe to defer rather than pre-build.
