# 0002 — Board tooling (OPS-001)

## Context

OPS-001 builds the scripts that turn `scripts/board/backlog.mjs`'s `CARDS`
into a GitHub Projects v2 board and drive the `work on next` loop. It has to
settle, before any card issue exists: how a card key binds to a GitHub issue,
how re-running the bootstrap script stays idempotent and resumable, and what
tool the four scripts are built on.

## Key <-> issue binding

**Title prefix.** Every card issue's title is `"<KEY> — <title>"` (em dash),
e.g. `ITEM-002 — Seeded shuffling for item presentation`. The key is read
back out of a live issue's title with a regex (`^(\S+)\s+—\s+(.*)$`) — there
is no separate mapping file. A single `board` label is applied to every card
issue so scripts can scope their queries (`gh issue list --label board`) away
from this repo's 43 pre-existing, unrelated issues, without needing a label
per card.

Considered and rejected:
- **A label per card** (`card:ITEM-002`) — 14 labels for 14 cards, growing
  with the backlog, and the key would then live in two places (label name
  and title) that could drift.
- **A marker line in the issue body** — invisible in the issue list view and
  in any GitHub UI that doesn't render the body; the title prefix is visible
  everywhere the issue is, for free.

**Guard:** a board-labelled issue whose title prefix doesn't parse to a
known card key (typo, manually renamed, or a future migration) is reported
and left untouched rather than treated as available for a duplicate create.
Two issues that both parse to the same key are reported as a conflict and
both left untouched.

## Idempotency and resumability

GitHub itself is the only state store; there is no separate run-state file.

- **Idempotency** comes from re-deriving the key -> issue-number map on every
  run by listing `board`-labelled issues and parsing their titles, then
  diffing each card's full desired state (title, body — including a
  `Depends on: #n, #n` line with real numbers — labels, milestone) against
  what's actually stored. A card whose issue already matches is reported
  `skipped` and receives no API write. **This was verified, not assumed**:
  ITEM-002's acceptance text was edited, bootstrap was re-run and reported
  `1 updated` (not `1 skipped`), `gh issue view` showed the changed line as
  GitHub stored it, then the backlog edit was reverted and a further re-run
  reported `1 updated` again, restoring the original text. This rules out
  the alternative, wrong implementation where "skipped" would mean merely
  "an issue with that key already exists" (which would never re-sync a
  content edit to the board) — see the disambiguation below.
- **Resumability** follows from the same mechanism: if the process dies at
  issue 9 of 14 (rate limit, network, a bad field id), re-running re-fetches
  whatever board-labelled issues already exist and only creates what's
  missing, then reconciles all 14 in pass 2. No separate "resume from here"
  logic exists or is needed.
- **Two passes** are unavoidable given the title-prefix binding: `dependsOn`
  holds card keys, and an issue's number doesn't exist until the issue does.
  Pass 1 creates every missing issue (body without a dependency line yet).
  Pass 2 recomputes every card's full desired state — now with every key's
  issue number resolved — and diffs/edits only where something doesn't
  match.

### Ticked acceptance boxes survive a re-run

`bootstrap-board.mjs` re-renders each card's full body from `backlog.mjs` on
every run, including the acceptance list — and the working agreement's step
6 (`CLAUDE.md`) has every closed card get its acceptance boxes ticked by
hand on the live issue. Left alone, those two facts conflict: any later
bootstrap run (e.g. adding a 15th card to the backlog) would re-render every
card's acceptance list as unchecked, silently un-ticking completed work.
`checkedAcceptanceLines()` reads the existing issue body first, extracts
which acceptance lines are already `- [x]` (matched by exact text — an
acceptance line has no other stable identity), and `cardBody()` renders
those as checked again. Verified against the real OPS-001 issue: ticked all
seven boxes by hand, re-ran `--dry-run`, confirmed it reported "up to date"
rather than proposing to revert them.

That same test surfaced an unrelated body-comparison bug: GitHub round-trips
a body edited via `--body-file` with a trailing newline appended (the
scratchpad file used to tick OPS-001's boxes ended in one, as most editors
do), which doesn't match `cardBody()`'s output (never trailing-newline-
terminated) byte-for-byte — the diff check was flagging a real, ticked,
otherwise-identical issue as needing an update over one invisible character.
Fixed by trimming both sides before comparing. This didn't affect the
earlier ITEM-002 skip/update resumability test, since that body was written
entirely by the script itself (via `issue create`/`issue edit`), never
through a manually-supplied `--body-file`.

### What "skipped" means (disambiguate before reading a count)

`skipped` in the created/updated/skipped summary means **the issue's stored
title, body (including its resolved `Depends on` line), labels and milestone
already exactly match what `backlog.mjs` says they should be** — verified by
an explicit diff in pass 2, not by "a matching-key issue exists so leave it
alone." A skip is evidence the content is in sync, not evidence the
reconciliation step ran and chose not to look.

## Why Node ESM over `gh`, not Python or Octokit

- `gh` is already the project's authenticated GitHub interface (used
  elsewhere in the working agreement — `gh issue view`, `gh issue comment`).
  Adding Octokit would mean a second, parallel way to authenticate against
  GitHub for no capability `gh` doesn't already expose via `item-add` /
  `item-edit` / `item-list` / `field-create` / `issue create` / `issue edit`.
- Node keeps one toolchain with the rest of the repo (already Node/TypeScript
  throughout); Python would be a second runtime for one corner of tooling.
- The one gap `gh project` doesn't cover — renaming an existing single-select
  field's options — was reached through `gh api graphql`, which is still
  `gh`, not a new dependency.

## Verifying next-card.mjs's four states without corrupting the board

`next-card.mjs`'s pick logic was verified against all four states the
board-scripts prompt asked for: an In-progress card taking precedence, the
normal lowest-rank-unblocked pick, a Ready card correctly skipped for an open
dependency, and the milestone-complete message. The first three were
verified live: move one or two real cards on the actual board, run
`next-card.mjs`, confirm the pick, move them back.

**The fourth (milestone-complete) was NOT verified live, and that was a
deliberate correction mid-session, not the original plan.** Doing it for
real means moving all 14 cards to Verify at once — the only way to make
"every card in the active milestone is Verify/Done" true when there are 14
cards and one milestone. That's materially different from moving one or two
cards: it briefly shows the shared board as if every M0 card had cleared
review, when zero work has happened on any of them. Partway through that
loop (`board-move.mjs` called 14 times in immediate succession, each doing
an `item-list` + `item-edit` GraphQL round trip), GitHub's secondary
(abuse-detection) rate limit tripped — visible as `GraphQL: API rate limit
exceeded`, even though `gh api rate_limit` showed 0/5000 of the primary quota
used throughout. Two subsequent polling attempts to check whether it had
cleared (a 5-minute and then a 13-minute retry loop, one `gh` call every
15-20s) kept failing with the same error; per GitHub's documented behavior,
continuing to send requests during a secondary-limit block extends the block,
so the polling was very likely making it worse rather than helping. Only
OPS-001 had actually been moved (to Verify) before the loop died on its
second card — the other 13 never left Ready — but the incident sat unresolved
for roughly 20 minutes before a single `gh` call, made after a genuinely idle
wait with no interleaved polling, confirmed the lockout had cleared.

The correction: `next-card.mjs`'s decision logic — `activeMilestoneKey` and
`decide()` — was refactored to be pure (an array of `{ card, issueState,
column }` records in, a result out) and exported, with zero `gh` calls
inside it. The milestone-complete case is verified by calling `decide()`
directly with 14 synthetic records (every real card from `CARDS`, each
given `column: 'Done'`, `issueState: 'CLOSED'`) and asserting the result is
`{ kind: 'milestone-complete' }` — no board mutation, no shared state
touched, no rate-limit exposure. This is intentionally a different
verification method from the other three states, and is recorded here so a
future reader doesn't read that asymmetry as an oversight.

Lesson for any future board-tooling change: a synthetic/unit-style check
against the pure decision function should be the default whenever a test
needs to represent a state — like "everything is done" — that doesn't occur
by moving one or two cards. Reach for a live-board test only for the states
that occur that way.

## Closing an issue does not move its board card — CLAUDE.md's step 6 is wrong about this

`CLAUDE.md`'s step 6 says: "the push closes the issue and the board moves it
to Done." That is not true for this board as configured, and it was
disproved by the first real case: pushing OPS-001's commit (`Closes #45`)
closed issue #45, but its project item stayed at `Verify` — it had to be
moved to `Done` by hand with `board-move.mjs OPS-001 "Done"` afterward.

The cause: GitHub Projects v2 ships a built-in, disabled-by-default
"Item closed -> set Status" workflow (confirmed via `gh api graphql` against
`ProjectV2Workflow` — `workflows(first: 20)` on the project lists it as
`{name: "Item closed", enabled: false}`, alongside four other seeded
workflows, all disabled except "Auto-add sub-issues to project"). Whether
that default is disabled from project creation or was disabled as a side
effect of `updateProjectV2Field` invalidating whatever option it targeted
was not established either way — it does not need to be, because **there is
no fix available through `gh` or the GraphQL API regardless of cause**: the
public schema for `ProjectV2Workflow` is read-only (`id`, `name`, `enabled`,
`number`, `createdAt`, `updatedAt`, `project`) plus exactly one mutation,
`deleteProjectV2Workflow`. There is no mutation to enable a workflow or set
its target field/option. Enabling "Item closed -> Status: Done" and pointing
it at the current `Done` option is a browser-only action, same category as
the Status-field view-grouping limitation already noted in step 1.

Until that's done by hand in the browser (Project #2 -> Workflows -> "Item
closed" -> enable -> set target Status: Done), **the actual mechanism is
`board-move.mjs <KEY> "Done"` after pushing**, not an automatic move on
close. `CLAUDE.md`'s step 6 wording should be corrected to say this
explicitly rather than assume the automation exists, or the workflow should
be enabled in the browser to make the original wording true again — this is
a call for whoever owns the workflow doc to make, not something this card
decides unilaterally.

## Revision 2026-09-21 — workflow enabled in the browser

The "Item closed -> Status" workflow described above was enabled by hand in
the browser (Project #2 -> Workflows -> "Item closed"), targeting the
project's current `Done` option. The section above is left as written — it
records why the manual `board-move.mjs <KEY> "Done"` step existed and why no
`gh`/GraphQL fix was available, and that history doesn't change. Going
forward, closing a card's issue (e.g. via a pushed `Closes #n` commit) should
move its board item to `Done` automatically; the manual `board-move.mjs
<KEY> "Done"` step is no longer expected to be necessary, though it remains
the fallback if the workflow is ever found not to have fired.

## What would make us revisit this

- If `gh` ever adds a `field-edit`/option-rename subcommand, the raw
  `gh api graphql` call in the Status-field setup (see the board-scripts
  prompt's step 1) could be replaced with it — cosmetic, not urgent.
- If the backlog grows past ~50-100 cards, `gh issue list --label board`
  paginating at `--limit 200` per call may need to grow or paginate properly;
  today's 14 cards are nowhere near that.
- If two people ever hand-edit issue titles independently and collide on a
  key, the conflict guard reports it but does not resolve it — if that
  becomes routine rather than a one-off slip, it may be worth a stronger
  binding (e.g. a hidden HTML-comment marker in the body as a fallback check
  alongside the title, not instead of it).
