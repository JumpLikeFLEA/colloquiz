#!/usr/bin/env node
/**
 * Prints one row per card in backlog.mjs's CARDS: key, title, milestone,
 * column, and whether it's blocked by an open dependency.
 *
 * "Blocked" is computed against the LIVE board, not just backlog.mjs's
 * dependsOn: a dependency is only open if its issue is actually still open
 * right now. Read straight from CARDS (rather than only from project items)
 * so a card with no issue yet still gets a row.
 */

import { execFileSync } from 'node:child_process';
import { CARDS } from './backlog.mjs';
import { OWNER, PROJECT_NUMBER, BOARD_LABEL } from './config.mjs';

const HELP = `Usage: node scripts/board/board-status.mjs

Prints a table of every card: key, title, milestone, column, blocked state.
Output is plain and stable enough to paste verbatim into a planning brief.
`;

const TITLE_RE = /^(\S+)\s+—\s+(.*)$/;

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 }));
}

// Returns Map<cardKey, { number, state, milestoneKey }>.
function fetchIssuesByKey() {
  const issues = ghJson([
    'issue',
    'list',
    '--label',
    BOARD_LABEL,
    '--state',
    'all',
    '--json',
    'number,title,state,milestone',
    '--limit',
    '200',
  ]);
  const byKey = new Map();
  for (const issue of issues) {
    const m = TITLE_RE.exec(issue.title);
    if (!m) continue;
    byKey.set(m[1], { number: issue.number, state: issue.state });
  }
  return byKey;
}

// Returns Map<issueNumber, statusColumnName>.
function fetchStatusByIssueNumber() {
  const data = ghJson(['project', 'item-list', String(PROJECT_NUMBER), '--owner', OWNER, '--format', 'json', '--limit', '200']);
  const byNumber = new Map();
  for (const item of data.items) {
    if (item.content && typeof item.content.number === 'number') {
      byNumber.set(item.content.number, item.status ?? '(no status)');
    }
  }
  return byNumber;
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function pad(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const issuesByKey = fetchIssuesByKey();
  const statusByNumber = fetchStatusByIssueNumber();

  const rows = CARDS.map((card) => {
    const issue = issuesByKey.get(card.key);
    const column = issue ? statusByNumber.get(issue.number) ?? '(not on board)' : '(no issue)';
    const openDeps = card.dependsOn.filter((depKey) => {
      const dep = issuesByKey.get(depKey);
      return !dep || dep.state === 'OPEN';
    });
    return {
      key: card.key,
      title: truncate(card.title, 50),
      milestone: card.milestone,
      column,
      blocked: openDeps.length > 0 ? `blocked by ${openDeps.join(', ')}` : '-',
    };
  });

  const widths = {
    key: Math.max(...rows.map((r) => r.key.length), 3),
    title: Math.max(...rows.map((r) => r.title.length), 5),
    milestone: Math.max(...rows.map((r) => r.milestone.length), 9),
    column: Math.max(...rows.map((r) => r.column.length), 6),
  };

  const header = `${pad('KEY', widths.key)}  ${pad('TITLE', widths.title)}  ${pad('MILESTONE', widths.milestone)}  ${pad('COLUMN', widths.column)}  BLOCKED`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    console.log(
      `${pad(r.key, widths.key)}  ${pad(r.title, widths.title)}  ${pad(r.milestone, widths.milestone)}  ${pad(r.column, widths.column)}  ${r.blocked}`,
    );
  }
}

main();
