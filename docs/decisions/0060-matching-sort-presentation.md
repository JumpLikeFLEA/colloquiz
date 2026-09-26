# 0060 — matching: an authored `presentation` hint for categorisation items

## Context

PLAY-011 (issue #116): "Sort into categories" matching items render exactly
like ordinary word-to-meaning matching — a column of rows, each with its own
answer slot, and a shared bank below (`MatchingRenderer.tsx`, per
`docs/decisions/0039`). Partner review note 5 flagged that a categorisation
item should look like sorting into visible groups, not like "tap to match."

**Evidence**, re-run and printed (not retyped) from `authored/courses/
future-imperfect.json`:

```
total matching items: 10
categorisation items: [
  { "id": "f5-sort", "left": 8, "right": 2, "maxReuse": 4 },
  { "id": "g1-sort", "left": 4, "right": 3, "maxReuse": 2 }
]
```

"Categorisation" here means: some `right` element is the correct partner for
two or more `pairs` (`maxReuse > 1`, computed by grouping `payload.pairs` by
`pair.right`). All 8 other matching items in the file have `maxReuse === 1`
for every right element (same run, printed alongside the above) — the
distinction is clean in this file, not just in the two flagged items.

## Options considered

**(i) Infer the layout from payload shape** (e.g. a "few right elements,
several reused" threshold). Rejected. Presentation is authorial intent, not
something to read off counts. `docs/decisions/0013` Decision 2 makes
many-to-one matching legal input generally ("two near-synonyms both matching
one definition"), so a shape-based threshold will eventually misclassify a
legitimate non-categorisation many-to-one item as a bucket sort, or vice
versa. Two examples in one file are not enough to fit a threshold to.

**(ii) An explicit authored `presentation` field** — chosen, see below.

**(iii) A new item type.** Rejected. `score()` (`lib/items/matching.ts`),
`SubResult` shape and the response format would be identical to `matching`'s
existing ones — this is a rendering variant of one item type, not a new one.
A new type would duplicate the whole matching pipeline (parse, score,
registry entry, renderer contract) to get what one optional field gives. Per
`CLAUDE.md` a new item type is itself a stop-and-ask; choosing it here would
not skip that gate, only add a second one, for no scoring benefit.

## Decision: option (ii) — `presentation: "pairs" | "sort"`, optional, default `"pairs"`

Add an optional field to `MatchingPayloadSchema`
(`lib/items/matching.ts:55`, a `z.strictObject`):

```ts
presentation: z.enum(["pairs", "sort"]).default("pairs"),
```

`score()` (`lib/items/matching.ts:210`) is untouched: it operates on
`payload.pairs` regardless of `presentation`, so scoring output is
byte-identical between the two values for the same pairs.

Naming: `presentation`, values `"pairs" | "sort"` — not `"categorise"`, so
the field can't be mistaken for a second item type when read in isolation.

### Refinement 1 — optional, defaults to `"pairs"`, no migration

`MatchingPayloadSchema` is a `z.strictObject` that today has no check
requiring every `right` id to be covered by a pair (`superRefine`,
`lib/items/matching.ts:66-137`, checks id-distinctness and that each pair's
`left`/`right` references an existing element, nothing more) — an unused
right option is already legal, which is the same "backward compatible by
construction" shape a new optional field needs. Zod's `strictObject` only
rejects *unknown* keys; it does not require an *optional* key's presence, so
existing `lesson_versions` rows and `authored/` files with no `presentation`
key parse unchanged through `parseLessonDocument` — the same function
`scripts/import-lesson.ts` and the future editor-save path both call (per
that script's own "VALIDATION ORDER" comment, `scripts/import-lesson.ts:26-33`).
This was not run against a live database dump; it is architectural reasoning
from the schema/parser code, labelled as such.

Only `f5-sort` and `g1-sort` in `authored/courses/future-imperfect.json` get
`"presentation": "sort"` — no other file in `authored/` changes.

### Refinement 2 — the shape heuristic survives only as an advisory warning

The rejected option-(i) heuristic (`maxReuse > 1`, the same computation used
above to find the two evidence items) becomes a non-blocking WARNING in
`scripts/import-lesson.ts` (and `scripts/validate-course-file.ts` if it fits
the offline-check pass better): if a matching item has some right element
reused by 2+ pairs and carries no `presentation` field, print a warning
naming the item id. It never changes rendering or validation success —
labelled in code as a heuristic, not a rule.

### Refinement 3 — `"sort"` requires at least 2 right elements

Validation (in the same `superRefine`): `presentation === "sort"` requires
`payload.right.length >= 2` (a "sort" into fewer than 2 buckets isn't a
sort). Unused categories are allowed — an empty bucket is a legitimate
distractor, the same way an unused right option is legal under `"pairs"`
(no check requires every category to hold a pair).

### Refinement 4 — naming is final

`presentation`, `"pairs" | "sort"`. Not `"categorise"`.

## What would make us revisit this

- A categorisation item needs scoring that differs from per-left,
  1-point-per-pair scoring — e.g. partial credit scoped to a whole bucket
  rather than each statement independently. `score()` currently has no
  concept of `presentation` at all; if that stops being true, this decision's
  "scoring is untouched" premise no longer holds and needs its own review.
- Authors routinely forget the field despite the Refinement-2 warning,
  suggesting the field should be required (with no default) rather than
  optional, or that the warning should be promoted to a validation error.

## Round-trip evidence for the field (cited, not assumed)

- `PracticeItemForm.tsx`'s matching editor (`MatchingForm`,
  `app/(colloquiz)/(main)/app/admin/courses/[id]/lessons/[lessonId]/
  PracticeItemForm.tsx:617-717`) never reconstructs `payload` from scratch —
  every `onChange` call spreads the existing payload first
  (`{ ...item, payload: { ...payload, <field>: <value> } }`, e.g. lines
  636-643, 646-650, 653-663, 667). A field the form has no control for is
  therefore never dropped by an edit to a *different* field; it survives
  load → edit-something-else → save. This does not by itself prove a
  `presentation: "sort"` item can be *created* through the form UI — no
  control for the field is being added by this decision — only that the
  field round-trips through the existing editor once present, per the
  file's own stated rule that "no raw JSON is ever shown to the author,
  every field maps directly to one of that type's payload fields"
  (`PracticeItemForm.tsx:28-31`). Whether authors need a form control to set
  `presentation` themselves (versus it only ever being set by import) is
  left to PLAY-011a's implementation, not decided here.
