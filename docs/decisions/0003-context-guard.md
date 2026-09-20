# 0003 — Context guard hook (OPS-002)

## Context

CLAUDE.md's "Session handoff" section describes a protocol — finish the
current step, revert if it can't be finished, post a fixed-template comment —
that depended entirely on a session noticing its own context usage and
choosing to follow it. OPS-002 makes that mechanical: a `PreToolUse` hook
(`scripts/session/context-guard.mjs`) that estimates usage on every tool call
and, past a hard limit, denies everything except the commands the handoff
protocol itself needs.

Two things had to be settled before writing any code, both checked against
`node_modules/next/dist/docs/`-adjacent first-party docs — here,
`https://code.claude.com/docs/en/hooks.md` and the Claude Code settings
schema — rather than assumed from training data, per AGENTS.md:

1. **There is no field or environment variable exposing how full the context
   window is.** `PreToolUse` hook stdin carries `transcript_path`, not a
   usage fraction. Usage has to be estimated from the transcript file itself.
2. **`additionalContext` is documented as unsupported for `PreToolUse`.**
   Only `permissionDecision` / `permissionDecisionReason` and the
   hook-type-agnostic top-level `systemMessage` are available, which is why
   the soft-limit message rides on `systemMessage` rather than
   `additionalContext`.

## Usage estimate: chars/4 over the transcript, reset at the last compaction

`estimateUsageFraction()` reads the transcript JSONL, sums raw line lengths
(the literal on-disk bytes, not re-serialized JSON), divides by
`CHARS_PER_TOKEN = 4` and by `CONTEXT_WINDOW_TOKENS` (originally `200_000`;
corrected to `1_000_000` — see the 2026-09-20 revision below), both declared
as constants at the top of the file with a comment on what they are (a guess
and a heuristic, not a measurement — there is no live API for either).

The sum only starts from the last transcript entry with `isCompactSummary:
true`, not from the top of the file. Without that boundary, a session that
had already auto-compacted once would have its estimate permanently pinned
above the hard limit for the rest of the session — the pre-compaction lines
never leave the file, only the live context. The boundary shape (that
`isCompactSummary: true` marks a real compaction event in the transcript,
not merely a message *about* compaction) was read off this session's own
transcript, not guessed.

**This heuristic has not been tuned against anything — that is the honest
answer to the acceptance line asking what the constants were "tuned
against."** The one data point in hand is this session itself: mid-way
through OPS-002's own step 4, the hook denied a plain `node -e` sanity-check
Bash call while allowing `git status`/`git add`/`git commit`, i.e. its hard
limit fired for real, unprompted, on the session that had just registered it
seconds earlier. That is one live data point, not a calibration. Revisit the
constants once a few real handoffs have happened and it's possible to compare
the guard's estimate against the actual `/context` usage Claude Code reports
at the point the guard tripped.

## Escape hatches, because a misfiring estimate must not be able to lock out the fix

`CONTEXT_GUARD_DISABLE=1` allows every call unconditionally.
`CONTEXT_GUARD_FORCE_FRACTION=<0..1>` substitutes a literal fraction for the
estimate. The second one is not a debugging convenience added after the
fact — it is the acceptance criterion's dry-fire mechanism: "force the hard
limit in a scratch session" has no other way to happen deterministically,
since a real transcript can't be edited to a known size without also being a
valid transcript the harness will re-read.

Dry-fire evidence (run directly against `context-guard.mjs`, no scratch
session needed once the force-fraction hatch existed):

```
$ echo '{"tool_name":"Edit","tool_input":{"file_path":"x.ts"},"transcript_path":"/dev/null"}' \
    | CONTEXT_GUARD_FORCE_FRACTION=0.95 node scripts/session/context-guard.mjs
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
"permissionDecisionReason":"CONTEXT HARD LIMIT: only git status|diff|log|add|commit|restore|stash
and gh issue view|comment are allowed. Revert the current step if unfinished and post the
session handoff."}}

$ echo '{"tool_name":"Bash","tool_input":{"command":"git status"},"transcript_path":"/dev/null"}' \
    | CONTEXT_GUARD_FORCE_FRACTION=0.95 node scripts/session/context-guard.mjs
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}

$ git status
On branch main
nothing to commit, working tree clean
```

The soft zone was dry-fired the same way at `CONTEXT_GUARD_FORCE_FRACTION=0.8`
and returns `allow` carrying the `CONTEXT SOFT LIMIT` message on both
`permissionDecisionReason` and `systemMessage`.

## The allowlist: CLAUDE.md's wording vs. the acceptance line's wording, and a real discrepancy between them

CLAUDE.md's "Session handoff" section says the hard limit leaves available
`git status`/`diff`/`log`/`add`/`commit`/`restore`/`stash` and `gh issue
view`/`comment`. OPS-002's acceptance line quotes the same list and adds "the
allowlist CLAUDE.md names" — i.e. a request to allow *exactly* that list,
which is a stricter reading than CLAUDE.md's own prose (which doesn't say
"and nothing else" in as many words, though the working agreement's intent —
lock the session down to only what the revert-and-handoff path needs — reads
the same way). The implementation follows the acceptance line's stricter
reading: `ALLOWED_COMMAND_PATTERNS` is a positive allowlist matched per
`&&`/`;`/`|`-separated segment, and every other tool (`Read`, `Grep`, `Task`,
etc.) is denied outright at the hard limit, not just `Edit`/`Write` as
CLAUDE.md's prose might be read to imply in isolation.

**A real discrepancy was caught during this step's verification, not
assumed away**: the first implementation (committed in a prior session) also
allowed `gh issue list`, which is in neither CLAUDE.md's list nor the
acceptance line's. Re-reading the acceptance text word-for-word ("allows
exactly the allowlist CLAUDE.md names: ... and `gh issue view|comment`")
turned this up as scope the code had added on its own — there is no
recorded reason for it anywhere in the session's commits or comments, so it
was not a considered decision being second-guessed, it was drift. Fixed by
removing `list` from `ALLOWED_COMMAND_PATTERNS` and from
`HARD_LIMIT_DENY_REASON`'s text, and locking it down with a test
(`denies 'gh issue list' at the hard limit`) so a future edit can't
reintroduce it silently. If `gh issue list` turns out to be genuinely needed
at the hard limit (e.g. because a future handoff step calls it), that is a
CLAUDE.md wording change to propose, not a quiet code addition.

## Fail-open, not fail-closed

Any throw in `main()` — an unreadable transcript, malformed stdin, a `NaN`
usage fraction — is caught and the call is allowed through, with the error
written to stderr rather than surfaced as a denial. An invisible lockout (a
crashing hook silently denying every tool call for the rest of a session,
with the only diagnostic in a stderr stream nothing displays) was judged
worse than an invisible pass-through (a broken guard that stops protecting
the session but doesn't stop the session from working) — a broken hook that
blocks all work is a worse failure mode for a Windows/PowerShell + Bash dual
environment where transcript path handling has more edge cases than a single
shell would.

## What would make us revisit this

- Once a handful of real soft/hard trips have happened across sessions,
  compare the guard's estimated fraction at the trip point against what
  Claude Code's own `/context` command reports for the same point (captured
  before the hard limit denies the ability to check) — this is the
  calibration data that doesn't exist yet.
- If `CHARS_PER_TOKEN = 4` proves systematically wrong in one direction
  (code-dense sessions tripping too late, prose-heavy sessions tripping too
  early), split the constant by content type rather than tuning a single
  blended number.
- If a future card needs a command at the hard limit that isn't in the
  current allowlist, add it to CLAUDE.md's prose list first — the code
  allowlist should never grow without that line changing to match, which is
  exactly the drift this ADR's `gh issue list` finding caught after the
  fact.
- If Claude Code ever exposes a real usage fraction (field on hook stdin, or
  a documented env var), replace `estimateUsageFraction()` outright rather
  than keeping the transcript heuristic as a fallback — two independent
  estimates of the same thing is a way for them to quietly disagree.

## Revision 2026-09-20 — 1M window, 40% soft / 45% hard

`CONTEXT_WINDOW_TOKENS` was `200_000` and the fractions were `0.7` / `0.9`.
Both were wrong for the sessions this hook actually guards: the window is
**1M tokens**, stated by the user, not 200k — so the guard was dividing by a
denominator five times too small and would have tripped its hard limit at
roughly 180k tokens of transcript, about 18% of the real window. The
fractions are now `0.4` / `0.45`, also set by the user.

Consequences worth stating rather than leaving to be re-derived:

- The soft/hard band narrowed from 20 percentage points to 5. Against a 1M
  window that is still ~50k tokens of room between "start handing off" and
  "locked to the handoff allowlist" — wider in absolute terms than the old
  20-point band over 200k (40k), so the handoff has *more* room to finish
  and commit the current step, not less.
- The absolute trip points moved from ~140k/~180k estimated tokens to
  ~400k/~450k.
- `CHARS_PER_TOKEN = 4` is unchanged and still uncalibrated. The window fix
  removes a known-wrong constant; it does not make the estimate measured.
  The calibration item under "What would make us revisit this" still stands,
  and is now the only unvalidated number in the estimate.

The fraction constants are the user's stated policy, not a derived
recommendation; changing them is their call, not a tuning exercise.
