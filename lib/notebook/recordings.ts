import { keptUntil } from "./keptUntil";
import { newestFirst } from "./newest";
import type { NotebookEntry, NotebookSummary, NotebookTake, SummaryKind } from "./types";

/**
 * The Recordings row's list, newest first. Audio is either kept (until a date, or with no date when
 * the run's end is not readable) or deleted; `hasNotes` says whether the notebook still holds
 * anything copied from the take, so "notes kept" is never said of a take with none.
 */
export type RecordingRow = {
  take: NotebookTake;
  /** From the copied summary; null with none (no analysis, hidden, or deleted by the learner). */
  kind: SummaryKind | null;
  hasNotes: boolean;
  audio: { state: "kept"; until: string | null } | { state: "deleted" };
};

export function recordingRows(
  takes: readonly NotebookTake[],
  entries: readonly NotebookEntry[],
  summaries: readonly NotebookSummary[],
): RecordingRow[] {
  const kinds = new Map(summaries.map((s) => [s.submissionId, s.kind]));
  const noted = new Set(entries.flatMap((e) => (e.kind === "own" ? [] : [e.submissionId])));
  return newestFirst(takes, (t) => t.submittedAt).map((take) => ({
    take,
    kind: kinds.get(take.id) ?? null,
    hasNotes: kinds.has(take.id) || noted.has(take.id),
    audio: take.objectName === null ? { state: "deleted" } : { state: "kept", until: keptUntil(take) },
  }));
}
