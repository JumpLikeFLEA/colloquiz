# 0024 — PLAY-001: lesson player shell — location, mark_a/mark_b, practice slot

## Context

PLAY-001 (issue #72) builds the M1 lesson player shell and theory-block
renderers. Its acceptance lines leave three shapes to this card rather than
a prior decision: where the components live, how `mark_a`/`mark_b` are made
distinguishable without colour, and how practice blocks (whose real
renderers are PLAY-002..004, not this card) are represented in the shell.
Decided unattended under `work on next --no-approval`, recorded per the
working agreement rather than left only in the diff.

## Decision 1 — Component location

`app/components/lesson-player/`, a plain component directory with no route
above it — not inside `app/(main)/`, and not inside a new `app/(english)/`
route group, since SHELL-work on English route namespacing is still an open
decision (docs/handoff.md, "Open questions") that this card does not need to
resolve to satisfy "player components live outside `app/(main)/`". This
follows the existing precedent of `app/components/` holding reusable,
route-independent UI (NotificationBell, Groups — docs/ui-decisions.md).
Nothing under this directory imports from `app/(main)/`, Recharts, KaTeX, or
Framer Motion; verified by:

```
rg -n "app/\(main\)|recharts|katex|framer-motion" app/components/lesson-player
```

which printed no matches (see the issue-closing comment for the run).

**Revisit when:** the English route namespacing decision lands and a real
route wraps this player (M2, PLAY-001's own header: "the M1 player that M2
will wrap") — at that point the player may move under the new route group,
or stay in `app/components/` and simply be imported from it.

## Decision 2 — `mark_a`/`mark_b` distinguishable without colour

Each mark pairs a background tint with a DIFFERENT underline style, not just
a different hue, so the two remain distinguishable in grayscale or for a
colour-blind reader:

- `mark_a`: `bg-brand-subtle` + a **solid** 2px bottom border (`border-brand`).
- `mark_b`: `bg-accent` + a **dashed** 2px bottom border
  (`border-foreground/50`).

Both are token-only (no hex literals), implemented in
`app/components/lesson-player/InlineContent.tsx`. A run can carry both marks'
sibling marks (`emphasis`, `english`) at once per 0022, which is why the
component composes nested spans rather than switching on a single
discriminant.

**Revisit when:** a third contrasting mark is ever proposed — 0018/0022 both
call that a decision, not a drive-by addition, and the two-mark visual
scheme above would need a third distinguishable treatment designed
alongside it.

## Decision 3 — Practice-block slot is a pluggable renderer, not built here

PLAY-001's acceptance list includes practice blocks in "renders a lesson
document block by block," but the interactive per-type renderers are
PLAY-002 (selection/selection_grid), PLAY-003 (ordering/matching) and
PLAY-004 (slots) — separate cards, not yet done. `LessonPlayer` therefore
takes an optional `practiceRenderer` prop
(`{ block, onScore } => ReactNode`); when omitted it falls back to
`PracticeBlockPlaceholder`, which names the item's type and renders nothing
interactive. `onScore` writes into `LessonPlayer`'s own local session state
(`lib/lessonPlayer/session.ts`), which `aggregateLessonScore`/
`resolveExplanations` are then run over — so the scoring/explanation
plumbing this card owns is exercised and tested (`session.test.ts`) with
hand-built `ItemScoreResult` fixtures standing in for a real renderer's
output, without this card building or guessing at any item's interaction
design.

**Revisit when:** PLAY-002 lands and supplies the first real
`practiceRenderer` — confirm the prop shape still fits before PLAY-003/004
build against it, since a second and third caller are what would expose a
shape mismatch the first caller alone couldn't.

## Decision 4 — Verification without a component test suite

This repo's test runner (`vitest.config.ts`, docs/decisions/0004) is scoped
to `lib/**` and `scripts/**` — there is no jsdom or React-rendering setup.
Adding one is a new npm dependency, which even under `--no-approval` is a
stop-and-ask (CLAUDE.md). So the orchestration logic
(`scoreSession`/`explanationsForSession`/`buildYouTubeEmbedUrl`) was written
as pure functions in `lib/lessonPlayer/session.ts` and unit-tested there; the
React components themselves were verified by running the dev server and
viewing a fixture lesson through a dev-only, admin-gated demo page
(`app/(main)/app/admin/lesson-player-demo/`, mirroring the existing
`item-playground` precedent) — not part of this card's deliverable, not
reused by anything else.

**Revisit when:** a card actually needs to assert on rendered DOM output
(e.g. a regression a visual/manual check keeps missing) — that is the
trigger for proposing jsdom + React Testing Library as their own
`type:decision` card, not something to add quietly here.
