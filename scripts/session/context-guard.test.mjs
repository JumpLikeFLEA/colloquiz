import { describe, it, expect } from 'vitest';
import { decide, SOFT_LIMIT_FRACTION, HARD_LIMIT_FRACTION } from './context-guard.mjs';

const SOFT = (SOFT_LIMIT_FRACTION + HARD_LIMIT_FRACTION) / 2; // inside the soft zone
const HARD = HARD_LIMIT_FRACTION + 0.01; // inside the hard zone

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
