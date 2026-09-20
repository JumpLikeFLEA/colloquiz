#!/usr/bin/env node
/**
 * Moves one card between Status columns on the live board.
 *
 * Usage: node scripts/board/board-move.mjs <KEY> "<column>"
 */

import { execFileSync } from 'node:child_process';
import { CARDS } from './backlog.mjs';
import { OWNER, PROJECT_NUMBER, BOARD_LABEL, STATUS_COLUMNS } from './config.mjs';

const HELP = `Usage: node scripts/board/board-move.mjs <KEY> "<column>"

Moves a card to the given Status column and prints the before/after column.
A move to the column a card is already in is a no-op that says so.

Valid columns: ${STATUS_COLUMNS.join(', ')}
`;

const TITLE_RE = /^(\S+)\s+—\s+(.*)$/;

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function findIssueByKey(key) {
  const issues = ghJson([
    'issue',
    'list',
    '--label',
    BOARD_LABEL,
    '--state',
    'all',
    '--json',
    'number,title,url',
    '--limit',
    '200',
  ]);
  for (const issue of issues) {
    const m = TITLE_RE.exec(issue.title);
    if (m && m[1] === key) return issue;
  }
  return null;
}

function findProjectItemStatus(issueNumber) {
  const data = ghJson(['project', 'item-list', String(PROJECT_NUMBER), '--owner', OWNER, '--format', 'json', '--limit', '200']);
  for (const item of data.items) {
    if (item.content && item.content.number === issueNumber) {
      return item.status ?? null;
    }
  }
  return null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const [key, column] = argv;
  if (!key || !column) {
    fail(`Usage: node scripts/board/board-move.mjs <KEY> "<column>"\n\nValid columns: ${STATUS_COLUMNS.join(', ')}`);
    return;
  }

  const knownKeys = CARDS.map((c) => c.key);
  if (!knownKeys.includes(key)) {
    fail(`Unknown card key: "${key}"\n\nValid keys: ${knownKeys.join(', ')}`);
    return;
  }
  if (!STATUS_COLUMNS.includes(column)) {
    fail(`Unknown column: "${column}"\n\nValid columns: ${STATUS_COLUMNS.join(', ')}`);
    return;
  }

  const issue = findIssueByKey(key);
  if (!issue) {
    fail(`No board issue found for card key "${key}" — has bootstrap-board.mjs been run?`);
    return;
  }

  const before = findProjectItemStatus(issue.number);
  if (before === null) {
    fail(`Issue #${issue.number} (${key}) is not on the project board — has bootstrap-board.mjs been run?`);
    return;
  }

  if (before === column) {
    console.log(`${key}: already in "${column}" — no-op`);
    return;
  }

  gh(['project', 'item-edit', String(PROJECT_NUMBER), '--owner', OWNER, '--url', issue.url, '--field', 'Status', '--value', column]);

  console.log(`${key}: ${before} -> ${column}`);
}

main();
