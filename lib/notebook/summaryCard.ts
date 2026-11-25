import { newestFirst } from "./newest";
import type { NotebookSummary } from "./types";

/**
 * The summary card: the newest copied summary, with the goal of a first take or the next step of a
 * final or interim one. A take with neither (0156 Decision 10: no goal card without a slot) is
 * `none`. A blank goal or next step reads as absent, and a summary with no text at all draws
 * nothing, so the next newest is used.
 */
export type SummaryCard = {
  summary: NotebookSummary;
  text: string | null;
  follow: { kind: "goal" | "next_step"; text: string } | { kind: "none" };
};

const filled = (s: string | null): string | null => (s !== null && s.trim() !== "" ? s : null);

function toCard(summary: NotebookSummary): SummaryCard | null {
  const first = summary.kind === "first";
  const follow = filled(first ? summary.goal : summary.nextStep);
  const text = filled(summary.summary);
  if (text === null && follow === null) return null;
  return {
    summary,
    text,
    follow: follow === null ? { kind: "none" } : { kind: first ? "goal" : "next_step", text: follow },
  };
}

export function summaryCard(summaries: readonly NotebookSummary[]): SummaryCard | null {
  for (const s of newestFirst(summaries, (x) => x.takenAt)) {
    const card = toCard(s);
    if (card) return card;
  }
  return null;
}
