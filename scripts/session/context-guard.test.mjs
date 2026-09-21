import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decide, readUsageFraction, SOFT_LIMIT_FRACTION, HARD_LIMIT_FRACTION } from './context-guard.mjs';

const SOFT = (SOFT_LIMIT_FRACTION + HARD_LIMIT_FRACTION) / 2; // inside the soft zone
const HARD = HARD_LIMIT_FRACTION + 0.01; // inside the hard zone

const TESTDATA = join(dirname(fileURLToPath(import.meta.url)), 'testdata');
const fixture = (name) => join(TESTDATA, name);

describe('decide', () => {
  it('allows any tool below the soft limit, with no message', () => {
    const result = decide({ toolName: 'Edit', toolInput: {}, usageFraction: 0.1 });
    expect(result).toEqual({ permissionDecision: 'allow' });
  });

  it('allows tool calls in the soft zone, carrying the soft-limit message', () => {
    const result = decide({ toolName: 'Read', toolInput: {}, usageFraction: SOFT });
    expect(result.permissionDecision).toBe('allow');
    expect(result.message).toMatch(/CONTEXT SOFT LIMIT/);
  });

  it('denies Edit at the hard limit', () => {
    const result = decide({
      toolName: 'Edit',
      toolInput: { file_path: 'x.ts' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('deny');
  });

  it('denies Write at the hard limit', () => {
    const result = decide({
      toolName: 'Write',
      toolInput: { file_path: 'x.ts' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('deny');
  });

  it('denies Read at the hard limit (the allowlist is strict, not just Edit/Write)', () => {
    const result = decide({ toolName: 'Read', toolInput: {}, usageFraction: HARD });
    expect(result.permissionDecision).toBe('deny');
  });

  it('allows `git commit` at the hard limit', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'git commit -m "handoff"' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('allow');
  });

  it('allows `gh issue view` at the hard limit', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'gh issue view 46' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('allow');
  });

  it('allows a chained handoff command at the hard limit', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'git add -A && git commit -m "session handoff"' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('allow');
  });

  it('allows the same chain via PowerShell', () => {
    const result = decide({
      toolName: 'PowerShell',
      toolInput: { command: 'git add -A ; git commit -m "session handoff"' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('allow');
  });

  it('denies `git push` at the hard limit', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'git push' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('deny');
  });

  it('denies a chain where one segment is not allowlisted', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'git add -A && git push' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('deny');
  });

  it('denies `gh issue list` at the hard limit (acceptance names only view|comment)', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'gh issue list --label board' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('deny');
  });

  it('denies an unlisted Bash command outright', () => {
    const result = decide({
      toolName: 'Bash',
      toolInput: { command: 'rm -rf node_modules' },
      usageFraction: HARD,
    });
    expect(result.permissionDecision).toBe('deny');
  });

  it('denies a Bash call with no command field', () => {
    const result = decide({ toolName: 'Bash', toolInput: {}, usageFraction: HARD });
    expect(result.permissionDecision).toBe('deny');
  });
});

// Fixtures under testdata/ are real transcript lines stripped to only the
// fields readUsageFraction() reads (type, isSidechain, message.usage) — see
// the fixture-building notes in docs/decisions/0003-context-guard.md. Real
// data was checked and no local transcript ever mixes isSidechain:true and
// :false lines in one file (sidechain content lives in a wholly separate
// `subagents/agent-*.jsonl`), so real-mixed-composite.jsonl is a composite
// of two real files rather than one naturally-occurring one — documented
// there, not asserted here.
describe('readUsageFraction', () => {
  it('reads the LAST usage entry, not the first, when several are present', () => {
    // real-tail-basic.jsonl: 3 real assistant entries with usage, the first
    // two occupying 127,094 tokens and the last (most recent) 127,452 —
    // close enough to collide by coincidence, far enough apart that reading
    // the wrong one is caught.
    const fraction = readUsageFraction(fixture('real-tail-basic.jsonl'));
    expect(fraction).toBeCloseTo(127452 / 1_000_000, 10);
  });

  it('skips sidechain entries and falls back to the last real usage before them', () => {
    // real-mixed-composite.jsonl: 3 real non-sidechain usage lines, then 5
    // real sidechain lines (isSidechain:true, some carrying usage of their
    // own) appended after. A reader that didn't skip sidechain would read
    // 38,513 (the sidechain tail) instead of 127,452 (the real prior entry).
    const fraction = readUsageFraction(fixture('real-mixed-composite.jsonl'));
    expect(fraction).toBeCloseTo(127452 / 1_000_000, 10);
  });

  it('returns 0 when a real transcript is entirely sidechain', () => {
    // real-sidechain-only.jsonl: an actual subagent transcript, all 43
    // entries isSidechain:true. Every usage-carrying entry gets skipped, so
    // the walk reaches the top of the file with nothing usable.
    const fraction = readUsageFraction(fixture('real-sidechain-only.jsonl'));
    expect(fraction).toBe(0);
  });

  it('returns 0 when the transcript has no usage entries at all', () => {
    const fraction = readUsageFraction(fixture('no-usage.jsonl'));
    expect(fraction).toBe(0);
  });

  it('skips a malformed trailing line and reads the last well-formed usage', () => {
    // malformed-trailing-line.jsonl: the same 3 real entries as
    // real-tail-basic.jsonl, plus one truncated JSON line appended after —
    // simulating a transcript read mid-write.
    const fraction = readUsageFraction(fixture('malformed-trailing-line.jsonl'));
    expect(fraction).toBeCloseTo(127452 / 1_000_000, 10);
  });
});
