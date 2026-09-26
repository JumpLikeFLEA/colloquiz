# 0053 — PLAY-008: per-sub-part explanations, in place and numbered

## Context

PLAY-008 (issue #113) moves explanation display from a block-level list under
each practice block (`LessonPlayer.tsx`, `text-destructive-text`) to a
per-sub-part "Why?" disclosure directly beneath the row/pair/element/gap it
explains. Its acceptance body embeds a STOP-AND-ASK the working agreement
treats as binding even under `--no-approval`: whether to extend
`resolveExplanations` (0017) so a CORRECT sub-part can also offer "Why?", not
only a wrong one.

## Decision 1 — stay wrong-only; no change to `resolveExplanations`

Put to the user directly (`AskUserQuestion`, this session): **stay wrong-only**.
`lib/items/explanations.ts` is untouched — `resolveExplanations` still filters
to `!subResult.correct` (0017 Decision 4), so "Why?" only ever appears on an
incorrect row/pair/element/gap. Every per-type renderer computes its own
`explanationBy<X>Id` via `resolveExplanations(item, result)` once submitted,
and looks a sub-part up by the same id it already uses for the correct/
incorrect marker (`row.id`, `pair.id`, `element.id`, `gap.id` — 0009's
`SubResult.id` convention).

**Revisit when:** the partner's content review flags that a CORRECT answer's
authored explanation ("Real. Edison did believe this…") is being lost —
0017's header already names this exact example as the motivating case for a
future change; this decision only says PLAY-008 itself isn't where that
change happens.

## Decision 2 — the shared disclosure component

`app/components/lesson-player/practice/ExplanationDisclosure.tsx` — one real
`<button>` (`aria-expanded`, 44px target, 0029 Decision 4 precedent),
collapsed by default, toggling a neutral `bg-muted`/`text-muted-foreground`
panel. Neutral, not `destructive-*`, because the wrong state is already
signalled by the row's own tint and ✗ marker — repeating it on the
explanation panel would be redundant and, if that tint were ever the only
signal on a color-blind-unfriendly render, `docs/handoff.md`'s "never colour
alone" principle only holds if at least one signal ISN'T colour to begin
with (the ✗ glyph). Every renderer imports this one component rather than
each hand-rolling its own toggle.

## Decision 3 — `slots`: a gap's disclosure can't live inline, so it lists below the sentence

`selection_grid`, `matching` and `ordering` all render one row per sub-part,
so "directly beneath that sub-part" is literal — the disclosure sits inside
that row's own container. `slots` gaps are a few characters inside a running
sentence (`GapLayout`'s inline-segment rendering); expanding a multi-line
explanation there would insert a paragraph mid-sentence and break the reading
flow the inline layout exists to protect.

Chosen instead: every WRONG gap gets its own line — "Gap N: Why?" — in a
small list directly beneath the whole sentence (`GapExplanations`, shared
between `TypedSlots` and `DragSlots`). This is the closest equivalent
"beneath that sub-part" permits without redesigning the inline layout, and it
reuses the same "Gap N" numbering the non-inline fallback path
(`splitPromptOnGaps` failing) already established for gap labels.

**Revisit when:** a future card redesigns `slots`' inline layout (none
planned) — at that point the per-gap disclosure could move inline if the new
layout has room for it.

## Decision 4 — `selection`: one disclosure for the item, not per-option

`selection` scores as exactly one `SubResult` for the whole item (0009), so
there is exactly one explanation to offer, never per-option — the per-option
✓/✗ marks (0029 Decision 2) stay a visual affordance only, unconnected to
explanation granularity. The disclosure renders once, below the whole option
list, when that single SubResult is wrong.

## Decision 5 — numbering: `selection_grid` and `matching` only, confirmed unshuffled

The acceptance line requires visible 1/2/3 numbering for `selection_grid`
rows and `matching` rows specifically (a self_check referencing "items 1, 4
and 7" needs the numbers it names to mean something). Both were confirmed
unshuffled before numbering:

- `selection_grid`: no `shuffleForItem` call over `rows` (`SelectionGridRenderer.tsx`,
  already documented in that file's header before this card).
- `matching`: `item.payload.left.map(...)` renders directly; only `rightOptions`
  goes through `shuffleForItem` (`MatchingRenderer.tsx:65`). Left was never
  shuffled, confirmed by reading the renderer rather than assumed.

`ordering` and `slots` are NOT numbered by this card — `ordering`'s own
position numbers are PLAY-009's acceptance line, not this one, and a `slots`
gap is already labelled "Gap N" wherever the fallback (non-inline) layout
already showed it.

## Decision 6 — PLAY-007 reads explanations unchanged

`lib/lessonPlayer/session.ts`'s `explanationsForSession(document, results)`
is untouched — still exported, still covered by `session.test.ts` — and
`LessonPlayer.tsx` simply stops calling it (the removed block-level list was
its only caller in this tree). PLAY-007's end-of-lesson explanation review
will call this same pure function over the full lesson's `results` map when
it's built; PLAY-008 only moves where a WRONG sub-part's resolved text
displays DURING play, not how the lesson-level review will read it.

## Verification

- `LessonPlayer.test.tsx` gained one RTL test per renderer, each driving a
  guaranteed-wrong submission (an untouched/incorrect selection, unanswered
  grid rows, unpaired matching, an untouched typed slots gap, and — for
  `ordering` — the `shuffleOrderingIndices` never-identity guarantee) and
  asserting the "Why?" control is collapsed by default, then expands the
  fixture's own explanation text on click.
- Manual browser check (dev server + Playwright at 360px, admin
  `lesson-player-demo`, same precedent as 0029 Decision 3): numbered rows,
  the ✗ marker, and "Why?"/"Hide" toggling confirmed for `selection_grid`,
  `matching` and typed `slots` (screenshots taken, not committed — dev-only
  fixture, same as every prior renderer verification in this tree).
