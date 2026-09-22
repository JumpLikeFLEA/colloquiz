# 0029 — PLAY-002: selection/selection_grid renderers

## Context

PLAY-002 (issue #73) builds the first two real interactive item renderers
(`selection`, `selection_grid`) behind `LessonPlayer`'s `practiceRenderer`
slot (PLAY-001, docs/decisions/0024). Five shapes were left to this card.
Decided unattended under `work on next --no-approval`, recorded per the
working agreement rather than left only in the diff.

## Decision 1 — `attemptId` is a required prop, supplied by the caller (not `useId()`)

`lib/items/shuffle.ts` seeds presentation order on `${attemptId}:${itemId}`,
but nothing threaded an `attemptId` into `LessonPlayer` before this card —
PLAY-001 had no interactive renderer to need one. Attempt storage itself is
M2, so there is no server-issued attempt id to use yet.

The first version of this card had `LessonPlayer` generate one per mount
with React's `useId()`. That was wrong: `useId()` is derived from the
component's position in the render tree, not randomness — for a
server-rendered-then-hydrated `LessonPlayer`, it produces the *same* id on
every fresh page load, for every visitor, which pins `shuffleForItem`'s
presentation order to one fixed order per lesson rather than randomizing it
per attempt (the whole point of Decision 1's shuffle). It also shifts if
unrelated tree structure changes above `LessonPlayer`, which is not a
property an attempt id should have at all.

`LessonPlayer` now takes `attemptId: string` as a **required** prop instead —
it generates nothing itself. The caller is responsible for supplying a value
that is unpredictable and distinct per learner/attempt: today that's
`crypto.randomUUID()`, generated server-side, once per request, by whatever
Server Component renders the page (see the dev demo page for the concrete
pattern — Decision 5 below covers why a Client Component still has to be the
one that hands it to `LessonPlayer`).

**Revisit when:** M2/attempt storage introduces a real, server-issued
attempt id (e.g. a `results` row created at attempt start) — at that point
the real route passes that id through the same prop instead of a fresh
`crypto.randomUUID()`, so a resumed attempt (not just a fresh page load)
reshuffles consistently with whatever "resume" is defined to mean.

## Decision 2 — Feedback granularity: `selection` marks per-option, not just per-item

The acceptance line ("each sub-part shows correct or incorrect") maps
directly onto `ItemScoreResult.subResults` for `selection_grid` (one
subResult per row — the renderer marks each row). `selection` has exactly
one subResult for the whole item (docs/decisions/0009), so marking only "the
item" correct/incorrect after submit would tell a learner nothing about
*which* option was right. The renderer therefore also marks each *option*
(selected+correct, selected+wrong, missed-correct, neither) via
`selectionOptionFeedback` in `lib/lessonPlayer/selectionResponse.ts` — richer
than the acceptance line strictly requires, but the acceptance line's intent
("shows correct or incorrect") is unmet at the item level alone for a
multi-option MCQ.

**Revisit when:** a future selection-like type's acceptance conflicts with
per-option feedback (none currently does).

## Decision 3 — Verification without jsdom, again (0024 Decision 4 still holds)

Same constraint as PLAY-001: this repo's Vitest config has no
jsdom/React-rendering setup, and adding one is a new dependency — a
stop-and-ask even under `--no-approval`. The state-transition and
response-building logic behind both renderers (`toggleSelectionOption`,
`setGridRowAnswer`, `buildSelectionResponse`, `buildSelectionGridResponse`,
`selectionOptionFeedback`) is extracted into pure functions in
`lib/lessonPlayer/selectionResponse.ts` and unit-tested there, driving the
same call sequence a tap on a rendered option/row would make, through to
`scoreItem`. The React components themselves were verified by running the
dev server and driving `/app/admin/lesson-player-demo` with Playwright at a
360px viewport (screenshots taken, correct-answer/wrong-answer/partial-credit
states all confirmed to render and to match hand-computed scores) — not part
of this card's deliverable, not reused by anything else.

**Revisit when:** PLAY-003/004 land and the same constraint applies again —
if a third card needs the same workaround, that's the trigger (per 0024) to
propose jsdom + React Testing Library as its own `type:decision` card.

## Decision 4 — 360px interaction: full-width tappable rows, not radio/checkbox inputs

Options and grid True/False choices render as real `<button type="button">`
rows/pills, minimum 44px (`min-h-11`) tall, rather than small native
radio/checkbox controls with a separate label — the same "the row IS the
control" precedent SubjectGrid already established (docs/ui-decisions.md) for
touch targets on a narrow screen. The grid pills initially shipped at
`min-h-9` (36px) — below the 44px floor this decision states — and were
corrected to `min-h-11` in the same follow-up pass that fixed Decision 1;
confirmed at a 360px Playwright viewport both times (Decision 3), with the
corrected build measuring the rendered pill height directly (44px) rather
than trusting the class name.

## Decision 5 — `practiceRenderer` needs a Client Component on the caller's side

Wiring `practiceRenderer` (a function) into the dev-only demo page surfaced a
real bug, not a hypothetical one: `lesson-player-demo/page.tsx` is a Server
Component, and passing a function prop from a Server Component straight into
`<LessonPlayer>` throws at runtime ("Functions cannot be passed directly to
Client Components..."), confirmed via the Playwright run against the dev
server. Fixed by adding `LessonPlayerDemoClient.tsx`, a thin `"use client"`
wrapper that imports `practiceRenderer` and `LessonPlayer` itself and takes
only the (JSON-serializable) `document` as a prop from the server page.

**Revisit when:** the real M2 lesson route is built — it will need the same
client-boundary wrapper (or `LessonPlayer`'s own module could import
`practiceRenderer` as its default, removing the prop entirely, if by then
nothing else ever supplies a different renderer).
