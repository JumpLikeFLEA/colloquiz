import { newestFirst } from "./newest";
import type { FixEntry, NotebookEntry } from "./types";

/** The Fixes tab: one row per recording with a main error, newest first. Never merged. */
export function fixRows(entries: readonly NotebookEntry[]): FixEntry[] {
  return newestFirst(
    entries.filter((e): e is FixEntry => e.kind === "fix"),
    (e) => e.createdAt,
  );
}
