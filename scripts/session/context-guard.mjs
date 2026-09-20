#!/usr/bin/env node
/**
 * PreToolUse hook that fires the session-handoff mechanics described in
 * CLAUDE.md ("Session handoff"). Claude Code exposes no field or env var
 * for how full the current context window is (confirmed against
 * https://code.claude.com/docs/en/hooks.md and the settings schema before
 * writing this file — see docs/decisions/0003-context-guard.md), so usage
 * is read from the session's own transcript file (`transcript_path` on hook
 * stdin), which carries the API's own token counts: each assistant entry has
 * a `message.usage` block, and `input_tokens + cache_creation_input_tokens +
 * cache_read_input_tokens` is exactly the prompt the request was billed for,
 * i.e. how full the window was at that moment. Cached tokens count — they
 * occupy the window. The last entry's `output_tokens` is added because that
 * message is in the window too by the time this hook fires.
 *
 * This replaces a chars/4 estimate over the raw JSONL (OPS-004). That
 * estimate was measured wrong in a way no constant could fix: across four
 * real transcripts the true chars-per-token ran 6.53 to 9.57 — the guard
 * over-counted by 1.63-2.39x and would have denied tool calls at 31% of the
 * real window. Reading the number instead of estimating it also removes the
 * `isCompactSummary` boundary scan the estimate needed, since usage drops on
 * its own after a compaction. See docs/decisions/0003-context-guard.md.
 *
 * Two zones:
 *   - SOFT (>= SOFT_LIMIT_FRACTION): allow the call, but surface a message
 *     telling the session to wrap up the current step and hand off.
 *   - HARD (>= HARD_LIMIT_FRACTION): deny every tool call except a strict
 *     allowlist of git/gh commands — CLAUDE.md:329 names these so the
 *     revert-and-record path and the handoff comment can still run. The
 *     card's own acceptance line (scripts/board/backlog.mjs, OPS-002) goes
 *     further and reads as "allow exactly this list, nothing else" — that
 *     stricter reading is what's implemented; see the ADR for why the two
 *     sources differ and which one this follows.
 *
 * Two escape hatches, because a misfiring estimate must not be able to
 * lock out the tools needed to fix the hook itself:
 *   - CONTEXT_GUARD_DISABLE=1 turns the guard off entirely (always allow).
 *   - CONTEXT_GUARD_FORCE_FRACTION=<0..1> substitutes for the estimate —
 *     this is how the Step 5 dry-fire forces the hard limit without a
 *     synthetic transcript.
 *
 * main() fails OPEN: any throw, unreadable transcript, or malformed stdin
 * allows the call through and writes a diagnostic to stderr, rather than
 * denying everything silently for the rest of the session. See the ADR for
 * why an invisible pass-through was judged less harmful than an invisible
 * lockout.
 */

import { readFileSync } from 'node:fs';

// Assumed context window. Not read from anywhere live — there is no API
// for it — so this is a constant, set to match the window the sessions this
// hook guards actually run with (1M, stated by the user 2026-09-20), not a
// measurement the hook can make for itself.
export const CONTEXT_WINDOW_TOKENS = 1_000_000;

// Set by the user (2026-09-20) against a 1M window: hand off at 40% used,
// lock down to the handoff allowlist at 45%. Deliberately far lower
// fractions than the original 0.7/0.9, because 40% of 1M is ~400k tokens —
// a much larger absolute budget than 70% of 200k was, and the handoff wants
// room to finish and commit the current step, not a last-gasp margin.
// The fractions are policy, not measurement. What they are applied TO is
// now measured (OPS-004); CONTEXT_WINDOW_TOKENS is the constant still
// resting on a statement. See docs/decisions/0003-context-guard.md.
export const SOFT_LIMIT_FRACTION = 0.4;
export const HARD_LIMIT_FRACTION = 0.45;

// Kept under 200 chars: this repeats on every tool call while in the soft
// zone (no dedup, no state file — see the ADR on what that costs).
export const SOFT_LIMIT_MESSAGE =
  'CONTEXT SOFT LIMIT: finish and verify the current atomic step, commit it, ' +
  'then run the session handoff in CLAUDE.md.';

export const HARD_LIMIT_DENY_REASON =
  'CONTEXT HARD LIMIT: only git status|diff|log|add|commit|restore|stash and ' +
  'gh issue view|comment are allowed. Revert the current step if unfinished ' +
  'and post the session handoff.';

// Each allowlisted command, matched against a single &&/;/|-separated
// segment of the Bash or PowerShell command string, trimmed.
const ALLOWED_COMMAND_PATTERNS = [
  /^git\s+(status|diff|log|add|commit|restore|stash)(\s|$)/,
  /^gh\s+issue\s+(view|comment)(\s|$)/,
];

// && / ; / | all split a command into segments that must each independently
// match the allowlist. `|` also catches `||` (an empty segment between two
// pipes), which is filtered out by requiring non-empty segments below.
const SEGMENT_SEPARATOR = /&&|;|\|/;

function isAllowedCommand(command) {
  if (typeof command !== 'string' || command.trim().length === 0) return false;
  const segments = command
    .split(SEGMENT_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return false;
  return segments.every((segment) => ALLOWED_COMMAND_PATTERNS.some((re) => re.test(segment)));
}

/**
 * Pure decision logic — no I/O. { toolName, toolInput, usageFraction } in,
 * a decision out. Mirrors the next-card.mjs split between pure logic and
 * CLI glue so the decision matrix is testable without a transcript file or
 * a live session.
 */
export function decide({ toolName, toolInput, usageFraction }) {
  if (usageFraction < SOFT_LIMIT_FRACTION) {
    return { permissionDecision: 'allow' };
  }

  if (usageFraction < HARD_LIMIT_FRACTION) {
    return { permissionDecision: 'allow', message: SOFT_LIMIT_MESSAGE };
  }

  if (toolName === 'Bash' || toolName === 'PowerShell') {
    const command = toolInput && typeof toolInput === 'object' ? toolInput.command : undefined;
    if (isAllowedCommand(command)) {
      return { permissionDecision: 'allow' };
    }
    return { permissionDecision: 'deny', reason: HARD_LIMIT_DENY_REASON };
  }

  // Every other tool — including Edit, Write, Read, Grep, Task — is
  // outside the allowlist at the hard limit.
  return { permissionDecision: 'deny', reason: HARD_LIMIT_DENY_REASON };
}

/**
 * Reads how full the context window is from the token counts the transcript
 * already carries. Walks backward to the most recent usable `message.usage`
 * and stops there — no summing, no heuristic, nothing to calibrate.
 *
 * Returns 0 when the transcript carries no usage at all: the first tool call
 * of a session, or a transcript format this reader does not recognise. That
 * is the same fail-open choice main() makes on a throw — a guard that has
 * lost its input must not deny every call for the rest of the session. The
 * cost is that a format change disables the guard silently; the stderr line
 * is the only signal, and nothing displays it (see the ADR).
 */
export function readUsageFraction(
  transcriptPath,
  { contextWindowTokens = CONTEXT_WINDOW_TOKENS } = {},
) {
  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim().length === 0) continue;

    // Cheap reject before the parse. This file is re-read on every single
    // tool call and real transcripts run to megabytes, so parsing every
    // line to find one field is worth avoiding. A false positive here (the
    // string appearing inside message content) costs one parse and falls
    // through the checks below.
    if (!line.includes('"usage"')) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // malformed or partially-written trailing line
    }
    if (!entry || typeof entry !== 'object') continue;

    // A subagent's usage describes ITS OWN window, not this session's.
    // Reading one would under-count the parent and push the trip point
    // late, which is the failure direction that matters.
    if (entry.isSidechain === true) continue;

    const usage = entry.message && entry.message.usage;
    if (!usage || typeof usage !== 'object') continue;

    const tokens = occupiedTokens(usage);
    if (tokens > 0) return tokens / contextWindowTokens;
  }

  process.stderr.write(
    `context-guard: no message.usage found in ${transcriptPath} — guard is not gating\n`,
  );
  return 0;
}

/**
 * Every token occupying the window at the moment this entry was written:
 * the whole input side of the request (cached tokens included — a cache hit
 * is cheaper, not absent), plus the output that request produced, which is
 * in the window by the time a PreToolUse hook fires on the tool call that
 * output asked for.
 */
function occupiedTokens(usage) {
  const n = (key) => (typeof usage[key] === 'number' ? usage[key] : 0);
  return (
    n('input_tokens') +
    n('cache_creation_input_tokens') +
    n('cache_read_input_tokens') +
    n('output_tokens')
  );
}

function readStdin() {
  return readFileSync(0, 'utf8');
}

function main() {
  if (process.env.CONTEXT_GUARD_DISABLE === '1') {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
      }),
    );
    return;
  }

  const input = JSON.parse(readStdin());
  const toolName = input.tool_name;
  const toolInput = input.tool_input;

  const forced = process.env.CONTEXT_GUARD_FORCE_FRACTION;
  const usageFraction =
    forced !== undefined ? Number(forced) : readUsageFraction(input.transcript_path);

  if (Number.isNaN(usageFraction)) {
    throw new Error(`context-guard: usage fraction is NaN (forced="${forced}")`);
  }

  const result = decide({ toolName, toolInput, usageFraction });

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: result.permissionDecision,
      ...(result.reason ? { permissionDecisionReason: result.reason } : {}),
      ...(result.message ? { permissionDecisionReason: result.message } : {}),
    },
    // additionalContext is documented as NOT supported for PreToolUse
    // (code.claude.com/docs/en/hooks.md, confirmed before writing this
    // file); systemMessage is documented for all hook types, so the
    // soft-limit message rides on that instead — see the ADR.
    ...(result.message ? { systemMessage: result.message } : {}),
  };

  process.stdout.write(JSON.stringify(output));
}

if (process.argv[1] && process.argv[1].endsWith('context-guard.mjs')) {
  try {
    main();
  } catch (err) {
    // Fail OPEN: never let a broken estimate or malformed input silently
    // deny every tool call for the rest of the session.
    process.stderr.write(`context-guard: failed open — ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
      }),
    );
  }
}
