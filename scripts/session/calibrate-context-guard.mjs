/**
 * Validates CONTEXT_WINDOW_TOKENS (scripts/session/context-guard.mjs) against
 * real compaction boundaries — the only unvalidated constant in the guard
 * once OPS-004 replaced the chars/4 estimate with a direct token read.
 *
 * Every Claude Code transcript on this machine (`~/.claude/projects/**\/*.jsonl`,
 * never inside a `subagents/` folder — see the "why not subagent files" note
 * below) is scanned for `type:"system", subtype:"compact_boundary"` entries.
 * Each one carries `compactMetadata: { trigger, preTokens, postTokens }` —
 * Claude Code's OWN accounting of how many tokens were occupied right before
 * that compaction ran. That is a more authoritative number than anything
 * this script could reconstruct from `message.usage`, so `preTokens` is what
 * gets reported, not a re-derived sum — a re-derived number sitting next to
 * Claude Code's own is printed alongside it only as a cross-check, never in
 * place of it (see "two sources" below).
 *
 * A MANUAL boundary (`trigger: "manual"`, the user typed `/compact`) says
 * nothing about the window — the user could type it at 10% or 95% full — so
 * it is reported but excluded from the pass/fail check. Only an AUTO
 * boundary (`trigger: "auto"`, Claude Code compacted on its own because the
 * window was actually full) is evidence for what the window really is.
 *
 * Why not subagent files: a subagent's own tool calls were measured (OPS-004
 * probe, 2026-09-21) to receive the PARENT session's transcript_path, not a
 * path into its own `subagents/agent-*.jsonl` — so the file the guard reads
 * during a subagent's tool call is the same file scanned here, and the
 * subagent-only file a session directory also contains is never what
 * transcript_path points to. Scanning it here would count compactions this
 * hook can never actually see.
 *
 * Two sources, not conflated: `compactMetadata.preTokens` is Claude Code's
 * own count; `occupiedTokens()` (imported from context-guard.mjs, the exact
 * function the guard runs in production, input+cache_creation+cache_read+
 * output_tokens) is applied to the last `message.usage` entry before the
 * same boundary, printed alongside as `reconstructed`. They come from
 * different accounting and are not expected to match exactly; a large gap is
 * itself a finding, not a bug in one or the other.
 *
 * Project names printed are the transcript's containing directory name only
 * (how Claude Code names a project folder from its path) — never message
 * content, never file contents beyond the two JSON fields named above.
 *
 * Exit code: 2 and a STOP banner if any AUTO boundary's preTokens fraction
 * of CONTEXT_WINDOW_TOKENS is below SOFT_LIMIT_FRACTION — the guard's soft
 * limit could never fire before Claude Code itself was already forced to
 * compact, which means CONTEXT_WINDOW_TOKENS is wrong and is a call for the
 * user, not a tuning exercise. Exit 0 otherwise, including when there is no
 * AUTO evidence at all.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  CONTEXT_WINDOW_TOKENS,
  SOFT_LIMIT_FRACTION,
  occupiedTokens,
} from './context-guard.mjs';

const HELP = `Usage: node scripts/session/calibrate-context-guard.mjs [--projects-dir <dir>]

Scans every local Claude Code transcript for real compaction boundaries and
reports each one's trigger, model, and pre-compaction token count against
CONTEXT_WINDOW_TOKENS. Read-only; touches nothing. Numbers only — no message
content is read or printed beyond trigger/model/token fields.

Exits 2 (STOP) if an AUTO boundary's occupancy fraction is below the guard's
SOFT_LIMIT_FRACTION, which would mean the window constant is wrong.
`;

function findTranscripts(projectsDir) {
  const results = [];
  let projectDirs;
  try {
    projectDirs = readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const projectPath = join(projectsDir, entry.name);
    let files;
    try {
      files = readdirSync(projectPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      results.push({ path: join(projectPath, file), project: entry.name });
    }
  }
  return results;
}

/**
 * Pure: one transcript's lines in, its compaction boundaries out. Each
 * result carries the boundary's own compactMetadata plus a same-definition
 * reconstruction from the nearest preceding message.usage, so the two
 * sources sit side by side without either overwriting the other.
 */
export function findBoundaries(lines, { project } = {}) {
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!entry || entry.type !== 'system' || entry.subtype !== 'compact_boundary') continue;
    if (!entry.compactMetadata) continue;

    let model;
    let reconstructed;
    for (let j = i - 1; j >= 0; j--) {
      let e;
      try {
        e = JSON.parse(lines[j]);
      } catch {
        continue;
      }
      if (!e || e.isSidechain === true) continue;
      const usage = e.message && e.message.usage;
      if (!usage) continue;
      if (reconstructed === undefined) reconstructed = occupiedTokens(usage);
      if (model === undefined && e.message && e.message.model) model = e.message.model;
      if (reconstructed !== undefined && model !== undefined) break;
    }

    boundaries.push({
      project,
      trigger: entry.compactMetadata.trigger ?? 'unknown',
      preTokens: entry.compactMetadata.preTokens,
      postTokens: entry.compactMetadata.postTokens,
      model: model ?? 'unknown',
      reconstructed,
    });
  }
  return boundaries;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const dirFlagIdx = process.argv.indexOf('--projects-dir');
  const projectsDir =
    dirFlagIdx !== -1 && process.argv[dirFlagIdx + 1]
      ? process.argv[dirFlagIdx + 1]
      : join(homedir(), '.claude', 'projects');

  const transcripts = findTranscripts(projectsDir);
  const allBoundaries = [];

  for (const { path, project } of transcripts) {
    let content;
    try {
      content = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const boundaries = findBoundaries(lines, { project });
    allBoundaries.push(...boundaries);
  }

  console.log(`Scanned ${transcripts.length} transcripts under ${projectsDir}.`);
  console.log(`CONTEXT_WINDOW_TOKENS = ${CONTEXT_WINDOW_TOKENS.toLocaleString()}`);
  console.log(`Found ${allBoundaries.length} compaction boundaries.\n`);

  if (allBoundaries.length === 0) {
    console.log('No evidence either way — CONTEXT_WINDOW_TOKENS is neither confirmed nor refuted.');
    return;
  }

  let violatesSoft = false;
  for (const b of allBoundaries) {
    const fraction = typeof b.preTokens === 'number' ? b.preTokens / CONTEXT_WINDOW_TOKENS : NaN;
    const pct = Number.isFinite(fraction) ? `${(fraction * 100).toFixed(1)}%` : 'unknown';
    console.log(
      `${b.project} :: trigger=${b.trigger} model=${b.model} preTokens=${b.preTokens} ` +
        `postTokens=${b.postTokens} reconstructed=${b.reconstructed ?? 'n/a'} fraction=${pct}`,
    );
    if (b.trigger === 'auto' && Number.isFinite(fraction) && fraction < SOFT_LIMIT_FRACTION) {
      violatesSoft = true;
    }
    if (b.trigger !== 'auto' && b.trigger !== 'manual') {
      console.log(
        `  trigger could not be determined as auto or manual ("${b.trigger}") — this sample proves nothing about the window.`,
      );
    } else if (b.trigger === 'manual') {
      console.log('  manual /compact — says nothing about the window, excluded from the check.');
    }
  }

  if (violatesSoft) {
    console.log(
      '\nSTOP: an AUTO compaction boundary occupied less than SOFT_LIMIT_FRACTION ' +
        `(${SOFT_LIMIT_FRACTION}) of CONTEXT_WINDOW_TOKENS. That means Claude Code itself ` +
        'was already forced to compact before the guard would even reach its soft limit — ' +
        'CONTEXT_WINDOW_TOKENS is wrong. This is the user\'s call, not a tuning exercise.',
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && process.argv[1].endsWith('calibrate-context-guard.mjs')) {
  main();
}
