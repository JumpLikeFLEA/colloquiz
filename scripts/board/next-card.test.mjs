import { describe, it, expect } from 'vitest';
import { decide, activeMilestoneKey, isDepClosed } from './next-card.mjs';

// OPS-011: INFRA cards carry no `milestone` field at all (deliberately
// outside M0-M4 — see backlog.mjs's INFRA-001/002/003). next-card.mjs must
// never pick one, since it has no milestone to become "active" and no
// meaningful position in the M0-M4 flow next-card.mjs drives.
//
// This is a proof, not new picking logic: `activeMilestoneKey` only ever
// matches `record.card.milestone === m.key` against the fixed MILESTONES
// list, so a record whose card has no `milestone` property never joins any
// milestone's `inMilestone` set and is structurally unreachable as a pick.
// These tests exercise that guarantee directly against synthetic records,
// per the "verified with synthetic records instead of mutating the live
// board" approach this file's own header comment already uses (see
// docs/decisions/0002-board-tooling.md).

const MILESTONES = [
  { key: 'M0', title: 'M0' },
  { key: 'M1', title: 'M1' },
];

function record(overrides) {
  return {
    card: { key: 'X', milestone: undefined, dependsOn: [], type: 'task', ...overrides.card },
    issueNumber: 1,
    issueState: 'OPEN',
    column: 'Ready',
    ...overrides,
  };
}

describe('milestone-less cards are never picked', () => {
  it('a milestone-less card alone reports milestone-complete, not a pick', () => {
    const records = [record({ card: { key: 'INFRA-001', milestone: undefined } })];
    const result = decide(records, MILESTONES);
    expect(result.kind).toBe('milestone-complete');
  });

  it('activeMilestoneKey never treats a milestone-less card as belonging to any milestone', () => {
    const records = [
      record({ card: { key: 'INFRA-001', milestone: undefined }, column: 'Ready' }),
      record({ card: { key: 'M0-DONE', milestone: 'M0' }, column: 'Done' }),
    ];
    // Every real-milestone card is Done, so with the milestone-less card
    // structurally invisible, the active milestone must be null, not M0.
    expect(activeMilestoneKey(records, MILESTONES)).toBe(null);
  });

  it('a Ready, unblocked milestone-less card is not picked even when it is the lowest rank', () => {
    const records = [
      record({ card: { key: 'INFRA-001', milestone: undefined, dependsOn: [] }, column: 'Ready' }),
      record({ card: { key: 'M0-TASK', milestone: 'M0', dependsOn: [], type: 'task' }, column: 'Ready' }),
    ];
    const result = decide(records, MILESTONES);
    expect(result.kind).toBe('pick');
    expect(result.record.card.key).toBe('M0-TASK');
  });

  it('an In-progress milestone-less card is not picked over a Ready real-milestone card', () => {
    const records = [
      record({ card: { key: 'INFRA-001', milestone: undefined }, column: 'In progress' }),
      record({ card: { key: 'M0-TASK', milestone: 'M0', dependsOn: [], type: 'task' }, column: 'Ready' }),
    ];
    const result = decide(records, MILESTONES);
    expect(result.kind).toBe('pick');
    expect(result.record.card.key).toBe('M0-TASK');
  });

  it('isDepClosed still resolves a dependency on a milestone-less card by its issue state alone', () => {
    // A real card may legitimately depend on an INFRA card (e.g. OPS-010 on
    // INFRA-001) — dependency resolution must not special-case milestone at
    // all, only issueState.
    const records = [record({ card: { key: 'INFRA-001', milestone: undefined }, issueState: 'CLOSED' })];
    expect(isDepClosed('INFRA-001', records)).toBe(true);
  });
});
