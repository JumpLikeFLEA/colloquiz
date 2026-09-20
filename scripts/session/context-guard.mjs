#!/usr/bin/env node
/**
 * PreToolUse hook that fires the session-handoff mechanics described in
 * CLAUDE.md ("Session handoff"). Claude Code exposes no field or env var
 * for how full the current context window is (confirmed against
 * https://code.claude.com/docs/en/hooks.md and the settings schema before
 * writing this file — see docs/decisions/0003-context-guard.md), so usage
 * is estimated from the session's own transcript file (`transcript_path`
 * on hook stdin): chars/4 over the JSONL, summed only from the last
 * `isCompactSummary: true` entry onward so a completed auto-compaction
 * doesn't permanently pin the estimate above the hard limit for the rest
 * of the session. The boundary shape was read off a real compacted
 * transcript, not guessed — see the ADR.
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
// for it — so this is a constant guess, not a measurement.
export const CONTEXT_WINDOW_TOKENS = 200_000;

// Token estimate = chars / CHARS_PER_TOKEN. A heuristic that errs both
// ways: under-counts a code-dense transcript (real code runs closer to
// ~3 chars/token), over-counts prose-heavy stretches.
export const CHARS_PER_TOKEN = 4;

// Initial estimates only, validated by nothing but the Step 5 dry-fire.
// Acceptance asks what they were "tuned against" — the honest answer is
// nothing yet; see docs/decisions/0003-context-guard.md.
export const SOFT_LIMIT_FRACTION = 0.7;
export const HARD_LIMIT_FRACTION = 0.9;

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
 * Estimates how full the context window is from the session's own
 * transcript file. Sums raw JSONL line lengths (not re-serialized JSON —
 * the literal on-disk bytes) from the last `isCompactSummary: true` entry
 * onward, or from the start if the session hasn't compacted.
 */
export function estimateUsageFraction(
  transcriptPath,
  { contextWindowTokens = CONTEXT_WINDOW_TOKENS, charsPerToken = CHARS_PER_TOKEN } = {},
) {
  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  let boundary = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue; // malformed/partial trailing line — not a boundary candidate
    }
    if (entry && entry.isCompactSummary === true) {
      boundary = i;
      break;
    }
  }

  const relevant = lines.slice(boundary);
  const chars = relevant.reduce((sum, line) => sum + line.length, 0);
  return chars / charsPerToken / contextWindowTokens;
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
    forced !== undefined ? Number(forced) : estimateUsageFraction(input.transcript_path);

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
