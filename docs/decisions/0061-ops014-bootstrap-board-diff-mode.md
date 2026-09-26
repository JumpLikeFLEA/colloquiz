# 0061 — bootstrap-board.mjs gains a read-only `--diff` mode

## Context

PLAY-011 (#116) noticed `bootstrap-board.mjs --dry-run` reporting a real
`WOULD UPDATE` for PLAY-007 (#96, already Done). `--dry-run` only prints a
boolean per field (`title:true/false` etc.), not the actual difference, so
finding out what had drifted meant guessing at the diff by hand.

## What was found

Running the new `--diff` mode against the live board (82 board-labelled
issues, 0 conflicted) found exactly one card with real drift: PLAY-007
(#96). The live issue's body carried a fifth acceptance line —

> The "next lesson" link is an in-app navigation, not a full page load — so
> a practice renderer whose chunk isn't loaded yet (PLAY-012/0057's per-type
> `next/dynamic`, all currently `ssr:true` with no `loading` fallback) could
> flash blank on arrival if its chunk isn't already fetched. Either (a) give
> the affected `dynamic()` calls a height-reserving `loading` fallback, or
> (b) verify — on a throttled network, with the result printed — that
> Next's `<Link>` prefetch already fetches the next lesson's renderer
> chunk(s) before the tap, so there is nothing to reserve space for. Record
> which option was taken, and why, in docs/decisions/0057.

— already checked `[x]`, and corresponding to real work: `docs/decisions/
0057-play012-code-splitting-vs-deferred-loading.md` exists and records which
option was taken. `scripts/board/backlog.mjs`'s PLAY-007 card was missing
this line entirely — it had been added by hand directly to the live issue
body at some point during PLAY-007/PLAY-012's work, outside any
`bootstrap-board.mjs` run, and never carried back into the source of truth.
No other drift (title/labels/milestone) was found on any Done issue, or on
any other card — the "outside any run this session made" title/labels/
milestone drift OPS-014's own body speculated about did not reproduce; the
only real drift was this one body line.

## Decision

- `bootstrap-board.mjs --diff`: read-only, prints the actual field-level
  diff (title/body/labels/milestone) per card against its live issue,
  content not booleans. A card with no live issue yet is reported `NEW`
  rather than diffed. Touches nothing: no issue create/edit, no label/
  milestone creation, no project board membership change — a true
  counterpart to `--dry-run`'s `WOULD CREATE`/`WOULD UPDATE` lines.
- Body diffs use a minimal LCS-based line diff (`diffLines`), not a unified
  diff with hunk headers/context — the bodies this tool renders are short
  enough that a plain +/- line list is legible on its own, and adding hunk
  machinery would be a premature abstraction for content this size.
- `backlog.mjs`'s PLAY-007 card gained the fifth acceptance line verbatim,
  so the source of truth matches the live issue instead of the live issue
  quietly diverging from it.

## What would make us revisit it

- If a card's body regularly needs hand edits after publish (i.e. this
  happens again for reasons other than a genuine backlog.mjs omission),
  that's a sign acceptance lines added mid-work need a lower-friction path
  back into `backlog.mjs` than "notice it via `--diff` later."
- If a body ever gets long enough that a plain +/- line list stops being
  legible, add hunk context to `diffLines` rather than replacing it with a
  full diff library.
