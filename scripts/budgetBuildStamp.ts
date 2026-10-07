/**
 * Build-staleness rule for the budget guard (OPS-017, docs/decisions/0089).
 *
 * scripts/budget.ts used to reuse any `.next` that had a BUILD_ID, so a run
 * after a source change measured the previous build: in SHELL-019 it printed
 * 178.0 KB on `/` for code that measured 241.3 KB rebuilt from scratch
 * (docs/decisions/0086). The rule here: a build is reused only when the stamp
 * the guard wrote after its own last successful build equals a fingerprint of
 * the current sources. Everything else rebuilds — the direction a mistake in
 * this rule fails in is a slower run, never a stale figure.
 *
 * Pure: the caller (budget.ts) lists and reads the files; this module only
 * hashes and decides, so it is unit-tested without a filesystem.
 */

import { createHash } from "node:crypto";

/** One input to the fingerprint. `content: null` means the path is listed but missing (a deleted tracked file). */
export type SourceEntry = { path: string; content: Uint8Array | null };

/**
 * sha256 over every entry, sorted by path so listing order never matters.
 * Each entry is framed (path, a marker, byte length, bytes) so two different
 * file sets can't concatenate to the same byte stream. Duplicate paths are
 * hashed once.
 */
export function sourceFingerprint(entries: SourceEntry[]): string {
  const byPath = new Map<string, Uint8Array | null>();
  for (const e of entries) {
    if (!byPath.has(e.path)) byPath.set(e.path, e.content);
  }
  const hash = createHash("sha256");
  for (const path of [...byPath.keys()].sort()) {
    const content = byPath.get(path) ?? null;
    hash.update(path);
    hash.update("\0");
    if (content === null) {
      hash.update("missing\0");
    } else {
      hash.update(`${content.byteLength}\0`);
      hash.update(content);
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

export type BuildDecision = { action: "build" | "reuse"; reason: string };

export function buildDecision(input: {
  buildIdExists: boolean;
  stamp: string | null;
  current: string;
}): BuildDecision {
  if (!input.buildIdExists) {
    return { action: "build", reason: "no .next build found" };
  }
  if (input.stamp === null) {
    return {
      action: "build",
      reason: ".next has no budget source stamp (built outside `npm run budget`, or by an older guard)",
    };
  }
  if (input.stamp.trim() !== input.current) {
    return { action: "build", reason: "sources changed since the last budget build" };
  }
  return { action: "reuse", reason: "sources unchanged since the last budget build" };
}
