import type { Item } from "../items";
import { resolveExplanations } from "../items";
import type { LessonDocument } from "../lessons/parseLessonDocument";
import type { LessonSessionResults } from "./session";

/**
 * PLAY-016 — one line of the completion card's "Answer review": which
 * exercise and sub-part an explanation belongs to, and the statement or
 * prompt it explains, so a learner can map it back on a long lesson
 * (docs/decisions/0132). Only wrong sub-parts appear (0058 Decision 2),
 * in document order.
 */
export interface ReviewEntry {
  key: string;
  /** The practice block's id; the page anchors the exercise card on it. */
  blockId: string;
  /** 1-based, counting practice blocks only (the "Exercise N of M" pill). */
  exerciseNumber: number;
  /** The sub-part: a row/pair/element number, or "Gap N". Null for a
   * `selection` item, which has exactly one sub-part (0009). */
  subPart: string | null;
  /** The statement, prompt or pair text the explanation is about. */
  context: string;
  explanation: string;
}

function indexOfId(list: ReadonlyArray<{ id: string }>, id: string): number {
  return list.findIndex((entry) => entry.id === id);
}

function subPartContext(item: Item, subResultId: string): { subPart: string | null; context: string } {
  switch (item.type) {
    case "selection":
      return { subPart: null, context: item.payload.prompt };
    case "selection_grid": {
      const rows = item.payload.rows;
      const i = indexOfId(rows, subResultId);
      return { subPart: i >= 0 ? String(i + 1) : null, context: i >= 0 ? rows[i].statement : item.payload.prompt };
    }
    case "ordering": {
      const elements = item.payload.elements;
      const i = indexOfId(elements, subResultId);
      return { subPart: i >= 0 ? String(i + 1) : null, context: i >= 0 ? elements[i].text : item.payload.prompt };
    }
    case "matching": {
      const { pairs, left } = item.payload;
      const i = indexOfId(pairs, subResultId);
      const leftEl = i >= 0 ? left.find((el) => el.id === pairs[i].left) : undefined;
      const context = leftEl ? (leftEl.content.kind === "text" ? leftEl.content.text : leftEl.content.alt) : item.payload.prompt;
      return { subPart: i >= 0 ? String(i + 1) : null, context };
    }
    case "slots": {
      const i = indexOfId(item.payload.gaps, subResultId);
      return { subPart: i >= 0 ? `Gap ${i + 1}` : null, context: item.payload.prompt };
    }
  }
}

export function reviewEntriesForSession(document: LessonDocument, results: LessonSessionResults): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  let exerciseNumber = 0;
  for (const block of document) {
    if (block.kind !== "practice") continue;
    exerciseNumber += 1;
    const result = results[block.id];
    if (result === undefined) continue;
    for (const { subResultId, explanation } of resolveExplanations(block.item, result)) {
      entries.push({
        key: `${block.id}:${subResultId}`,
        blockId: block.id,
        exerciseNumber,
        ...subPartContext(block.item, subResultId),
        explanation,
      });
    }
  }
  return entries;
}
