#!/usr/bin/env node
/**
 * Turns backlog.mjs's CARDS into GitHub issues + project items.
 *
 * Key <-> issue binding: the issue TITLE is "<KEY> — <title>" (em dash).
 * The key is read back out of the title with TITLE_RE; there is no other
 * state file. This is what makes the script idempotent and resumable with
 * no extra bookkeeping — GitHub itself is the state store. Every issue this
 * script owns also carries the `board` label, which is how queries scope
 * themselves away from this repo's 43 pre-existing, unrelated issues.
 *
 * Two passes, because dependsOn holds card KEYS and issue numbers do not
 * exist until the issues do:
 *   Pass 1 — create any card with no existing issue (body without a
 *            "Depends on" line yet; the numbers it would need don't all
 *            exist).
 *   Pass 2 — now every card's issue number is known (existing or just
 *            created), so recompute each card's full desired body/title/
 *            labels/milestone (this time WITH "Depends on: #n, #n"), diff
 *            against the current issue, and edit only if something
 *            changed. This is also what makes re-running safe: an already
 *            -correct issue diffs clean and is reported as skipped, not
 *            re-written.
 *
 * Resumability follows from idempotency: if this dies partway through pass
 * 1, re-running re-fetches the board-labelled issues that already exist,
 * skips creating those again, and continues with what's left. No run
 * state is persisted anywhere else.
 */

import { execFileSync } from 'node:child_process';
import { CARDS, MILESTONES } from './backlog.mjs';
import {
  OWNER,
  PROJECT_NUMBER,
  STATUS_COLUMNS,
  BOARD_LABEL,
  MILESTONE_TITLES,
} from './config.mjs';

const READY = STATUS_COLUMNS[0]; // "Ready" — first column in workflow order

const HELP = `Usage: node scripts/board/bootstrap-board.mjs [--dry-run]

Creates/updates one GitHub issue per card in backlog.mjs's CARDS, ensures the
"board" label, the epic:*/type:* labels and the M0-M4 milestones exist, and
adds every card issue to the Colloquiz project board in the Ready column.

Idempotent: re-running updates existing issues (matched by the "<KEY> — "
title prefix on a board-labelled issue) instead of creating duplicates.
Resumable: a partial run can simply be re-run.

  --dry-run   Print exactly what would be created/updated, touching nothing.
  --help      Show this message.
`;

const TITLE_RE = /^(\S+)\s+—\s+(.*)$/;

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function cardTitle(card) {
  return `${card.key} — ${card.title}`;
}

// Acceptance lines already checked off by hand in the live issue, so
// re-rendering the body (e.g. a later bootstrap run adding an unrelated
// card) doesn't silently un-tick completed work. Matched by exact text,
// since that's the only stable identity an acceptance line has.
function checkedAcceptanceLines(existingBody) {
  if (!existingBody) return new Set();
  const checked = new Set();
  for (const line of existingBody.split('\n')) {
    const m = /^- \[[xX]\] (.*)$/.exec(line);
    if (m) checked.add(m[1]);
  }
  return checked;
}

// `deps` is an array of { key, ref } where ref is a real issue number once
// known, or a placeholder string in --dry-run before any issue exists.
// `checked` is a Set of acceptance line text already ticked in the live
// issue (empty for a card with no existing issue yet).
function cardBody(card, deps, checked) {
  let body = `${card.goal}\n\n## Acceptance\n\n`;
  body += card.acceptance.map((a) => `- [${checked.has(a) ? 'x' : ' '}] ${a}`).join('\n');
  if (card.notes) {
    body += `\n\n## Notes\n\n${card.notes}`;
  }
  if (deps.length > 0) {
    const refs = deps.map((d) => `#${d.ref}`);
    body += `\n\nDepends on: ${refs.join(', ')}`;
  }
  return body;
}

function cardLabels(card) {
  return [BOARD_LABEL, `epic:${card.epic}`, `type:${card.type}`];
}

function labelColor(name) {
  if (name === BOARD_LABEL) return '5319E7';
  if (name.startsWith('epic:')) return '1D76DB';
  return 'BFD4F2'; // type:*
}

function ensureLabels(dryRun, log) {
  const existing = new Set(ghJson(['label', 'list', '--limit', '200', '--json', 'name']).map((l) => l.name));
  const needed = new Set([BOARD_LABEL]);
  for (const card of CARDS) {
    needed.add(`epic:${card.epic}`);
    needed.add(`type:${card.type}`);
  }
  for (const name of needed) {
    if (existing.has(name)) continue;
    log(`label ${name}: ${dryRun ? 'WOULD CREATE' : 'creating'}`);
    if (!dryRun) gh(['label', 'create', name, '--color', labelColor(name)]);
  }
}

function ensureMilestones(dryRun, log) {
  const existing = ghJson(['api', 'repos/:owner/:repo/milestones', '--paginate']);
  const existingTitles = new Set(existing.map((m) => m.title));
  for (const m of MILESTONES) {
    const title = MILESTONE_TITLES[m.key];
    if (existingTitles.has(title)) continue;
    log(`milestone "${title}": ${dryRun ? 'WOULD CREATE' : 'creating'}`);
    if (!dryRun) gh(['api', 'repos/:owner/:repo/milestones', '-f', `title=${title}`, '-f', `description=${m.goal}`]);
  }
}

// Returns { byKey: Map<cardKey, issue>, conflicts: string[] } where `issue`
// is { number, title, body, labels: string[], milestoneTitle } and a
// conflict is a board-labelled issue whose title prefix doesn't parse to a
// known card key, or a key claimed by more than one issue. Conflicted keys
// are reported and left untouched rather than silently duplicated.
function fetchExistingBoardIssues(log) {
  const issues = ghJson([
    'issue',
    'list',
    '--label',
    BOARD_LABEL,
    '--state',
    'all',
    '--json',
    'number,title,body,milestone,labels,url',
    '--limit',
    '200',
  ]);
  const byKey = new Map();
  const conflictedKeys = new Set();
  const knownKeys = new Set(CARDS.map((c) => c.key));
  for (const issue of issues) {
    const m = TITLE_RE.exec(issue.title);
    const key = m ? m[1] : null;
    if (!key || !knownKeys.has(key)) {
      log(
        `WARNING: board-labelled issue #${issue.number} ("${issue.title}") does not parse to a known card key — leaving it untouched, not creating a duplicate.`,
      );
      continue;
    }
    if (byKey.has(key)) {
      log(
        `WARNING: both #${byKey.get(key).number} and #${issue.number} parse to key ${key} — leaving both untouched. Resolve the duplicate by hand.`,
      );
      conflictedKeys.add(key);
      continue;
    }
    byKey.set(key, {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      labels: issue.labels.map((l) => l.name),
      milestoneTitle: issue.milestone ? issue.milestone.title : null,
      url: issue.url,
    });
  }
  for (const key of conflictedKeys) byKey.delete(key);
  return { byKey, conflictedKeys };
}

function fetchProjectItemsByIssueNumber() {
  const data = ghJson(['project', 'item-list', String(PROJECT_NUMBER), '--owner', OWNER, '--format', 'json', '--limit', '200']);
  const byNumber = new Map();
  for (const item of data.items) {
    if (item.content && typeof item.content.number === 'number') {
      byNumber.set(item.content.number, item);
    }
  }
  return byNumber;
}

function issueUrl(number) {
  const remote = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  return `https://github.com/${remote}/issues/${number}`;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const dryRun = argv.includes('--dry-run');
  const log = (msg) => console.log(msg);

  log(`=== ${dryRun ? 'DRY RUN — nothing below is actually written' : 'LIVE RUN'} ===\n`);

  log('--- labels & milestones ---');
  ensureLabels(dryRun, log);
  ensureMilestones(dryRun, log);

  log('\n--- existing board issues ---');
  const { byKey: existingByKey, conflictedKeys } = fetchExistingBoardIssues(log);
  log(`Found ${existingByKey.size} existing board-labelled issue(s) matching a known card; ${conflictedKeys.size} conflicted key(s).`);

  const numbersByKey = new Map();
  for (const [key, issue] of existingByKey) numbersByKey.set(key, issue.number);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let sampleBody = null;

  log('\n--- pass 1: create missing issues ---');
  for (const card of CARDS) {
    if (conflictedKeys.has(card.key)) {
      log(`${card.key}: SKIPPED — conflicted key, resolve by hand first.`);
      skipped++;
      continue;
    }
    if (numbersByKey.has(card.key)) continue; // exists; pass 2 reconciles it

    const title = cardTitle(card);
    const body = cardBody(card, [], new Set()); // deps unresolved this early; pass 2 fills them
    const milestoneTitle = MILESTONE_TITLES[card.milestone];
    const labels = cardLabels(card);

    if (dryRun) {
      log(`${card.key}: WOULD CREATE issue "${title}" (milestone "${milestoneTitle}", labels ${labels.join(',')})`);
      numbersByKey.set(card.key, `(pending ${card.key})`);
      if (!sampleBody) sampleBody = { key: card.key, title, body };
      created++;
      continue;
    }

    try {
      const url = gh([
        'issue',
        'create',
        '--title',
        title,
        '--body',
        body,
        '--milestone',
        milestoneTitle,
        '--label',
        labels.join(','),
      ]).trim();
      const number = Number(url.split('/').pop());
      if (!Number.isInteger(number)) throw new Error(`could not parse issue number from "${url}"`);
      numbersByKey.set(card.key, number);
      log(`${card.key}: created #${number}`);
      created++;
    } catch (err) {
      console.error(`\nFAILED creating issue for ${card.key}: ${err.message}`);
      process.exit(1);
    }
  }

  log('\n--- pass 2: reconcile every card (labels, milestone, body incl. deps) ---');
  for (const card of CARDS) {
    if (conflictedKeys.has(card.key)) continue;

    const deps = card.dependsOn.map((depKey) => ({ key: depKey, ref: numbersByKey.get(depKey) }));
    const unresolved = deps.filter((d) => d.ref === undefined);
    if (unresolved.length > 0) {
      log(`WARNING: ${card.key} depends on unresolved key(s) ${unresolved.map((d) => d.key).join(', ')} — dependency line will be incomplete.`);
    }

    const existing = existingByKey.get(card.key);
    const checked = checkedAcceptanceLines(existing ? existing.body : null);

    const desiredTitle = cardTitle(card);
    const desiredBody = cardBody(card, deps.filter((d) => d.ref !== undefined), checked);
    const desiredMilestone = MILESTONE_TITLES[card.milestone];
    const desiredLabels = cardLabels(card);

    const number = numbersByKey.get(card.key);

    if (existing) {
      const currentLabels = new Set(existing.labels);
      const labelsOk = desiredLabels.every((l) => currentLabels.has(l));
      const milestoneOk = existing.milestoneTitle === desiredMilestone;
      const titleOk = existing.title === desiredTitle;
      // GitHub sometimes echoes back a trailing newline that wasn't in what
      // we sent (e.g. an issue edited via --body-file, which always ends in
      // one) — trim before comparing so that alone doesn't register as a
      // real content difference.
      const bodyOk = existing.body.trim() === desiredBody.trim();

      if (titleOk && bodyOk && labelsOk && milestoneOk) {
        log(`${card.key}: #${number} up to date — skipped`);
        skipped++;
        continue;
      }

      log(`${card.key}: #${number} ${dryRun ? 'WOULD UPDATE' : 'updating'} (title:${titleOk} body:${bodyOk} labels:${labelsOk} milestone:${milestoneOk})`);
      if (!dryRun) {
        gh([
          'issue',
          'edit',
          String(number),
          '--title',
          desiredTitle,
          '--body',
          desiredBody,
          '--milestone',
          desiredMilestone,
          '--add-label',
          desiredLabels.join(','),
        ]);
      }
      updated++;
    } else if (deps.filter((d) => d.ref !== undefined).length > 0) {
      // Freshly created in pass 1; only needs a second edit if it actually
      // has dependencies to add (a dependency-free new card is already
      // correct from creation).
      log(`${card.key}: #${number} ${dryRun ? 'WOULD ADD "Depends on" line' : 'adding "Depends on" line'}`);
      if (!dryRun) {
        gh(['issue', 'edit', String(number), '--body', desiredBody]);
      }
      updated++;
    }

    if (!sampleBody || sampleBody.key === card.key) {
      sampleBody = { key: card.key, title: desiredTitle, body: desiredBody };
    }
  }

  log('\n--- project board membership ---');
  const projectItems = fetchProjectItemsByIssueNumber(); // read-only; safe in --dry-run too
  for (const card of CARDS) {
    if (conflictedKeys.has(card.key)) continue;
    const number = numbersByKey.get(card.key);
    if (typeof number !== 'number') {
      log(`${card.key}: WOULD ADD to project "Colloquiz" (Ready)`);
      continue;
    }
    if (projectItems.has(number)) {
      log(`${card.key}: #${number} already on the board (status: ${projectItems.get(number).status ?? '(none)'})`);
      continue;
    }
    log(`${card.key}: #${number} adding to project "Colloquiz" (Ready)`);
    const url = issueUrl(number);
    gh(['project', 'item-add', String(PROJECT_NUMBER), '--owner', OWNER, '--url', url]);
    gh(['project', 'item-edit', String(PROJECT_NUMBER), '--owner', OWNER, '--url', url, '--field', 'Status', '--value', READY]);
  }

  log('\n=== summary ===');
  log(`created: ${created}  updated: ${updated}  skipped: ${skipped}  conflicted: ${conflictedKeys.size}`);

  if (sampleBody) {
    log('\n=== sample rendered issue ===');
    log(`Title: ${sampleBody.title}`);
    log(`Body:\n${sampleBody.body}`);
  }
}

main();
