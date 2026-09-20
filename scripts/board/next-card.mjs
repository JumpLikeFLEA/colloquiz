#!/usr/bin/env node
/**
 * Picks the next card to work, in this exact order:
 *
 *   1. An In-progress card in the active milestone, if one exists.
 *   2. Otherwise the lowest-rank Ready card in the active milestone whose
 *      every dependsOn is closed.
 *   3. Otherwise: report which "return to chat" condition applies — the
 *      active milestone is complete, no pickable card exists, or the
 *      would-be pick is type:decision — and exit 0.
 *
 * The active milestone is the lowest-numbered milestone (M0 before M1
 * before ...) that has any card whose live column is not Verify or Done.
 * This is derived from the live board every run, never hardcoded.
 *
 * The decision logic (`decide`, `activeMilestoneKey`, `isDepClosed`) is pure
 * — it takes an array of { card, issueState, column } records and returns a
 * result, with no `gh` calls of its own. This is what lets the
 * milestone-complete case be verified with synthetic records instead of by
 * mutating the live board: faking "every card is done" for real would mean
 * moving all 14 cards to Verify, which briefly shows false progress on a
 * shared board — the other three states only ever touch one or two cards
 * and don't have that problem, but this one does. See
 * docs/decisions/0002-board-tooling.md.
 */

import { execFileSync } from 'node:child_process';
import { CARDS, MILESTONES, rankOf } from './backlog.mjs';
import { OWNER, PROJECT_NUMBER, BOARD_LABEL } from './config.mjs';

const HELP = `Usage: node scripts/board/next-card.mjs

Picks the next card to work (In-progress in the active milestone, else the
lowest-rank unblocked Ready card in it) and prints the pick and the reason.
With no pickable card, prints which "return to chat" condition applies and
exits 0. Prints the picked card's latest SESSION HANDOFF comment if it has
one.
`;

const TITLE_RE = /^(\S+)\s+—\s+(.*)$/;

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 }));
}

function fetchIssuesByKey() {
  const issues = ghJson([
    'issue',
    'list',
    '--label',
    BOARD_LABEL,
    '--state',
    'all',
    '--json',
    'number,title,state',
    '--limit',
    '200',
  ]);
  const byKey = new Map();
  for (const issue of issues) {
    const m = TITLE_RE.exec(issue.title);
    if (m) byKey.set(m[1], { number: issue.number, state: issue.state });
  }
  return byKey;
}

function fetchStatusByIssueNumber() {
  const data = ghJson(['project', 'item-list', String(PROJECT_NUMBER), '--owner', OWNER, '--format', 'json', '--limit', '200']);
  const byNumber = new Map();
  for (const item of data.items) {
    if (item.content && typeof item.content.number === 'number') {
      byNumber.set(item.content.number, item.status ?? null);
    }
  }
  return byNumber;
}

function fetchLatestHandoffComment(issueNumber) {
  const data = ghJson(['issue', 'view', String(issueNumber), '--json', 'comments']);
  const handoffs = data.comments.filter((c) => c.body.startsWith('SESSION HANDOFF'));
  if (handoffs.length === 0) return null;
  return handoffs[handoffs.length - 1].body;
}

// Builds { card, issueNumber, issueState, column } for every card in CARDS.
function buildRecords() {
  const issuesByKey = fetchIssuesByKey();
  const statusByNumber = fetchStatusByIssueNumber();
  return CARDS.map((card) => {
    const issue = issuesByKey.get(card.key);
    const column = issue ? statusByNumber.get(issue.number) ?? null : null;
    return { card, issueNumber: issue ? issue.number : null, issueState: issue ? issue.state : null, column };
  });
}

// --- pure decision logic: no gh, no I/O --------------------------------

export function isDepClosed(depKey, records) {
  const rec = records.find((r) => r.card.key === depKey);
  return !!rec && rec.issueState === 'CLOSED';
}

export function activeMilestoneKey(records, milestones = MILESTONES) {
  for (const m of milestones) {
    const incomplete = records.some((r) => r.card.milestone === m.key && r.column !== 'Verify' && r.column !== 'Done');
    if (incomplete) return m.key;
  }
  return null; // every milestone's cards are all Verify/Done
}

// Returns a discriminated result describing the pick, or which
// "return to chat" condition applies. Never touches the network.
export function decide(records, milestones = MILESTONES) {
  const active = activeMilestoneKey(records, milestones);
  if (active === null) {
    return { kind: 'milestone-complete' };
  }

  const inMilestone = records.filter((r) => r.card.milestone === active);

  const inProgress = inMilestone.find((r) => r.column === 'In progress');
  if (inProgress) {
    return { kind: 'pick', record: inProgress, active, reason: `an In-progress card exists in the active milestone (${active}).` };
  }

  const readyUnblocked = inMilestone
    .filter((r) => r.column === 'Ready')
    .filter((r) => r.card.dependsOn.every((depKey) => isDepClosed(depKey, records)))
    .sort((a, b) => rankOf(a.card.key) - rankOf(b.card.key));

  if (readyUnblocked.length === 0) {
    const anyReady = inMilestone.some((r) => r.column === 'Ready');
    return { kind: anyReady ? 'blocked' : 'no-ready', active };
  }

  const pick = readyUnblocked[0];
  if (pick.card.type === 'decision') {
    return { kind: 'decision-card', record: pick, active };
  }

  return { kind: 'pick', record: pick, active, reason: `the lowest-rank Ready card in the active milestone (${active}) with every dependency closed.` };
}

// --- I/O: printing + the one live gh lookup a pick needs ----------------

function printResult(result) {
  switch (result.kind) {
    case 'milestone-complete':
      console.log('Return to chat: the active milestone is complete — every card in every milestone (M0-M4) is in Verify or Done.');
      return;
    case 'no-ready':
      console.log(`Return to chat: no pickable cards — the active milestone (${result.active}) has no card in Ready (everything is In progress, Verify, Done, or has no issue yet).`);
      return;
    case 'blocked':
      console.log(`Return to chat: no pickable cards — every Ready card in the active milestone (${result.active}) is blocked by an open dependency.`);
      return;
    case 'decision-card':
      console.log(`Return to chat: the next pick, ${result.record.card.key} — ${result.record.card.title}, is type:decision.`);
      return;
    case 'pick': {
      const { record, reason } = result;
      console.log(`Pick: ${record.card.key} — ${record.card.title}`);
      console.log(`Reason: ${reason}`);
      if (record.issueNumber) {
        const handoff = fetchLatestHandoffComment(record.issueNumber);
        if (handoff) {
          console.log('\nLatest SESSION HANDOFF comment:');
          console.log(handoff);
        }
      }
      return;
    }
    default:
      throw new Error(`unreachable: unknown result kind ${result.kind}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const records = buildRecords();
  printResult(decide(records));
}

if (process.argv[1] && process.argv[1].endsWith('next-card.mjs')) {
  main();
}
