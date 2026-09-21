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

## Revision 2026-09-21 — OPS-004: read the token count instead of estimating it

`estimateUsageFraction()` (chars/4, reset at the last `isCompactSummary`
boundary) is replaced by `readUsageFraction()`: walk the transcript backward
and return the most recent `message.usage`'s
`(input_tokens + cache_creation_input_tokens + cache_read_input_tokens +
output_tokens) / CONTEXT_WINDOW_TOKENS`. `CHARS_PER_TOKEN` and the
compaction-boundary scan are deleted outright, not kept as a fallback — two
independent estimates of the same quantity is exactly the way they quietly
disagree, the same reasoning the "what would make us revisit this" section
above already gave for retiring the heuristic once a real number was
available.

### The measurement that motivated this

The probe run behind this card ran on 2026-09-20, from a chat session, not a
repo command — the raw output no longer exists as a reproducible artifact and
is committed verbatim at `docs/decisions/0003-probe-run-2026-09-20.md`. That
file, not this paragraph, is the source; treat any number below as a pointer
into it rather than as independently established here.

Across four real transcripts (all from one project, `Dota2-analysis-tool`,
so this is one density profile, not a cross-project spread), the implied
`CHARS_PER_TOKEN` at each transcript's deepest point ran **6.53 to 9.57** —
the old `CHARS_PER_TOKEN = 4` over-counted real occupancy by 1.63×–2.39×,
which is why the guard's soft/hard band, tuned against the assumed
`CHARS_PER_TOKEN = 4`, would trip as early as 31.4% real occupancy in one
transcript. See the evidence file for the per-session breakdown, the
duplicate-block correction (5 printed blocks were 4 distinct sessions), and
the derived median (7.295, not the probe's own unfixed 6.82).

**Occupancy definition — two sources, reconciled by picking one:** the probe
computed real occupancy as `input_tokens + cache_creation_input_tokens +
cache_read_input_tokens`, excluding `output_tokens`. The `occupiedTokens()`
function actually shipped in `readUsageFraction()` — unchanged by this
revision, already committed before this card started — adds
`output_tokens`, reasoning that the assistant's own last message is in the
window by the time the *next* tool call's PreToolUse hook fires. The two
were never reconciled into one number in the probe's own output; this
revision does not re-run the probe under the shipped definition, since the
underlying transcripts' peak points already moved by the time of writing.
What matters going forward is that there is now exactly one definition in
code — `occupiedTokens()`, exported from `context-guard.mjs` — and
`calibrate-context-guard.mjs` imports and calls that same function rather
than restating its arithmetic, so the guard's runtime number and the
calibration tool's number cannot drift apart the way `estimateUsageFraction`
and the probe's own chars/4 arithmetic once could have.

### Sidechain layout: the acceptance line's premise didn't hold

The card's acceptance line asks for the sidechain skip in `readUsageFraction`
to be "verified against a real transcript that HAS sidechain entries, not
asserted" — motivated by the probe finding 0.0% sidechain across all four
samples. Checking this directly (2026-09-21, all 11 local main-session
transcripts across 5 projects, one project's `subagents/agent-*.jsonl`
inspected directly) found:

- **No main-session transcript, in any project on this machine, ever
  contains an inline `isSidechain:true` line.** A subagent's own messages are
  written to a wholly separate file
  (`<session>/subagents/agent-<id>.jsonl`), which is internally 100%
  `isSidechain:true` — never mixed with `:false` lines the way the
  acceptance line's wording implies a single transcript might be.
- **`transcript_path` during a subagent's own tool call is still the
  PARENT session's main transcript file, not the subagent's own file** —
  measured directly: a temporary stderr-adjacent debug log (removed after
  the measurement, never committed) was added to `main()`, a real subagent
  was spawned via the `Agent` tool, and its own `Bash` tool call inside the
  subagent arrived at the hook with `transcript_path` pointing at this
  session's own `43a46403-….jsonl` — the same file the parent's own tool
  calls use. The main transcript's `isSidechain` count stayed at 0 even
  after the subagent ran.

Net effect: `readUsageFraction()`'s `isSidechain === true` skip branch is
**unreachable in this Claude Code version** — not because the reader is
reading the wrong file (it isn't; a subagent's tool call correctly falls
back to gating on the *parent's* own occupancy, which is the conservative,
safe direction), but because the file it reads, whoever's tool call
triggered the hook, never contains an inline sidechain row to skip in the
first place. This is a real, checked finding, not an assumption — and it
means the acceptance line's implicit test scenario (a naturally-occurring
mixed transcript) doesn't exist to test against.

**What the tests do instead**, since asserting a synthetic mixed fixture
would be exactly the thing the acceptance line was written to rule out:
`real-sidechain-only.jsonl` is an actual subagent transcript (stripped to
`type`/`isSidechain`/`message.usage`), proving the fail-open path over real
all-sidechain data; `real-mixed-composite.jsonl` concatenates that same real
subagent file's tail onto a real main-transcript tail, so the skip logic is
exercised against real JSON shapes even though the concatenation itself is
synthetic — documented as such in the test file, not presented as a
naturally-occurring transcript.

No follow-up card is proposed for this. The premise that failed was "the
guard might be reading the subagent's own file" — measured and found false;
what actually happens (parent-transcript fallback) is already the safe
behavior the skip logic was written to guarantee, just reached by a
narrower path than the acceptance line assumed.

### Compaction-boundary validation of CONTEXT_WINDOW_TOKENS

`scripts/session/calibrate-context-guard.mjs` (this card) scans every local
transcript for `type:"system", subtype:"compact_boundary"` entries, each of
which carries Claude Code's own `compactMetadata: { trigger, preTokens,
postTokens }` — a directly authoritative "how full was the window right
before this compaction" figure, not a reconstruction. Run 2026-09-21 against
142 transcripts across 5 projects on this machine:

**Exactly one compaction boundary exists anywhere in the sample.**
`trigger: "manual"` (the transcript's own `<command-name>/compact</command-name>`
entry confirms a typed `/compact`, not an automatic one),
`preTokens: 87771`, `postTokens: 10055`, on `model: "claude-sonnet-4-6"`, in
a different project (`trading-bot-v2`, a worktree) on a model outside the
Claude 5 family these sessions actually run. A manual boundary says nothing
about window size — the user can type `/compact` at any occupancy — so per
the card's own stop condition this is excluded from the pass/fail check, and
per the same condition's fallback: **the trigger here is determined (manual),
but the sample it comes from is off-model and off-project, so even though
the trigger is known, this one boundary establishes nothing about
`CONTEXT_WINDOW_TOKENS` for the sessions the guard actually protects.**

No AUTO boundary exists in the sample, so the STOP condition ("any AUTO
boundary below `SOFT_LIMIT_FRACTION` of `CONTEXT_WINDOW_TOKENS`") could not
fire either way — there is no evidence to trip it, which is different from
passing. **`CONTEXT_WINDOW_TOKENS = 1_000_000` remains exactly as
unvalidated after this card as before it** — the 2026-09-20 revision above
already said this was a statement, not a measurement, and this run had no
real compaction data on the relevant model to change that. The probe run's
own "Not established by this run" section already anticipated this gap.

### What would make us revisit this (successor to the item above)

- An AUTO compaction boundary, on a Claude 5-family model, in a session this
  guard actually protects, would be the first real evidence for or against
  `CONTEXT_WINDOW_TOKENS`. None exists yet on this machine; re-run
  `calibrate-context-guard.mjs` periodically as sessions accumulate, and
  treat any exit code 2 from it as the user's decision point, not a
  tuning trigger for the script to resolve on its own.
- If sidechain entries are ever observed inline in a main transcript (a
  Claude Code format change), the `isSidechain` skip branch in
  `readUsageFraction()` would become reachable for the first time since this
  revision — re-verify it against that real data rather than assuming the
  2026-09-21 finding still holds.
- The occupancy-definition gap between the 2026-09-20 probe (excludes
  `output_tokens`) and the shipped `occupiedTokens()` (includes it) was
  never reconciled numerically, only resolved going forward by having one
  canonical function. If a future session wants the exact probe numbers
  reproduced under the shipped definition, that is a fresh measurement, not
  arithmetic on numbers already printed.
