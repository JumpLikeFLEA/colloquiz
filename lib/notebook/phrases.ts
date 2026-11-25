import { newestFirst } from "./newest";
import type { NotebookEntry, OwnEntry, SaidEntry } from "./types";

/**
 * The Phrases tab (0236 section 4): said phrases merged by (course, phrase_key) with the newest
 * take's quote, and own notes, never merged, in one list, newest first. `close` is the shown
 * quote's `exact: false`.
 *
 * The merge uses the stored key, because deleting a merged phrase deletes by it (112). So what is
 * merged here is exactly what one delete removes.
 */
export type SaidPhrase = SaidEntry & { close: boolean; takes: number };
export type PhraseRow = SaidPhrase | OwnEntry;

export function phraseRows(entries: readonly NotebookEntry[]): PhraseRow[] {
  const merged = new Map<string, { row: SaidPhrase; takes: Set<string> }>();
  const rows: PhraseRow[] = [];
  for (const e of newestFirst(entries, (x) => x.createdAt)) {
    if (e.kind === "own") rows.push(e);
    if (e.kind !== "said") continue;
    const key = JSON.stringify([e.courseId, e.phraseKey]);
    const shown = merged.get(key);
    if (shown) {
      // Two listed expressions can share a key inside one take, so takes are counted, not rows.
      shown.row.takes = shown.takes.add(e.submissionId).size;
      continue;
    }
    const row: SaidPhrase = { ...e, close: !e.exact, takes: 1 };
    merged.set(key, { row, takes: new Set([e.submissionId]) });
    rows.push(row);
  }
  return rows;
}
