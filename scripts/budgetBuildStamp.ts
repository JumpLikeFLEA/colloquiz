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
 * OPS-042 (docs/decisions/0245): the stamp also records the Supabase URL the
 * build was made against and the BUILD_ID it produced. NEXT_PUBLIC_SUPABASE_URL
 * is frozen into the client bundle, and the .env* files are not the only place
 * it comes from (a process env var wins over them), so hashing the files alone
 * let a build made against one project be served against another. A BUILD_ID
 * that differs from the stamp's means `next build` ran outside the guard since
 * the stamp was written, with whatever env that run had.
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

/** What the guard writes to `.next/budget-source-fingerprint` after its own build. */
export type BudgetStamp = {
  fingerprint: string;
  /** null on a stamp written by a guard older than OPS-042 (a bare hash). */
  supabaseUrl: string | null;
  buildId: string | null;
};

export function formatStamp(stamp: { fingerprint: string; supabaseUrl: string; buildId: string }): string {
  return JSON.stringify(stamp);
}

/** Reads a stamp; a bare hash (the pre-OPS-042 format) carries no URL and no build id. */
export function parseStamp(raw: string): BudgetStamp {
  const text = raw.trim();
  if (text.startsWith("{")) {
    try {
      const v = JSON.parse(text) as Partial<Record<keyof BudgetStamp, unknown>>;
      return {
        fingerprint: typeof v.fingerprint === "string" ? v.fingerprint : "",
        supabaseUrl: typeof v.supabaseUrl === "string" ? v.supabaseUrl : null,
        buildId: typeof v.buildId === "string" ? v.buildId : null,
      };
    } catch {
      return { fingerprint: "", supabaseUrl: null, buildId: null };
    }
  }
  return { fingerprint: text, supabaseUrl: null, buildId: null };
}

function normaliseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** A Supabase URL for printing: a hosted project's ref is masked, a local URL is shown as it is. */
export function describeSupabaseUrl(url: string | null | undefined): string {
  if (!url) return "(no NEXT_PUBLIC_SUPABASE_URL)";
  return normaliseUrl(url).replace(/^(https?:\/\/)[^./]+(\.supabase\.(co|in))/i, "$1*$2");
}

export type BuildDecision = { action: "build" | "reuse"; reason: string };

export function buildDecision(input: {
  /** .next/BUILD_ID's content, or null when there is no build. */
  buildId: string | null;
  /** The stamp file's raw content, or null when it is missing. */
  stamp: string | null;
  /** sourceFingerprint() of the sources now. */
  current: string;
  /** The NEXT_PUBLIC_SUPABASE_URL this run will build with and serve. */
  supabaseUrl: string;
}): BuildDecision {
  if (input.buildId === null) {
    return { action: "build", reason: "no .next build found" };
  }
  if (input.stamp === null) {
    return {
      action: "build",
      reason: ".next has no budget source stamp (built outside `npm run budget`, or by an older guard)",
    };
  }
  const stamp = parseStamp(input.stamp);
  if (stamp.supabaseUrl === null || stamp.buildId === null) {
    return { action: "build", reason: "the stamp records no Supabase URL (written by a guard older than OPS-042)" };
  }
  if (stamp.buildId !== input.buildId.trim()) {
    return {
      action: "build",
      reason: "BUILD_ID changed since the stamp: `next build` ran outside `npm run budget`, with an env the guard did not see",
    };
  }
  if (normaliseUrl(stamp.supabaseUrl) !== normaliseUrl(input.supabaseUrl)) {
    return {
      action: "build",
      reason: `the build was made against ${describeSupabaseUrl(stamp.supabaseUrl)}, and this run serves ${describeSupabaseUrl(input.supabaseUrl)}`,
    };
  }
  if (stamp.fingerprint !== input.current) {
    return { action: "build", reason: "sources changed since the last budget build" };
  }
  return { action: "reuse", reason: "sources and Supabase URL unchanged since the last budget build" };
}
