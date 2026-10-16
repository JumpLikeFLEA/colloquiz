import { parseItem } from "../items";
import type {
  Item,
  MatchingItem,
  OrderingItem,
  SelectionGridItem,
  SelectionItem,
  SlotsItem,
} from "../items";

/**
 * A linked student's stored answer as text a teacher reads (TCH-003,
 * docs/decisions/0150). One function per item type, each reading the response
 * against the item as it stood in the version the attempt was made on (the
 * block comes from linked_student_attempts(), 078), never the current lesson.
 *
 * Pure: no rule about who may see an answer lives here, SQL decides that.
 * Marking right or wrong is not repeated here either: the row's earned and
 * possible are the score.
 */

export type AnswerText =
  /** The attempt stored no answer (older than 074, over the cap, or sent without one). */
  | { status: "no_response" }
  /** An answer exists but the block or the answer cannot be read back. */
  | { status: "unreadable" }
  | { status: "ok"; prompt: string; lines: string[] };

const NO_ANSWER = "no answer";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

function selectionText(item: SelectionItem, response: unknown): string[] | null {
  if (!isRecord(response)) return null;
  const ids = stringArray(response.selectedOptionIds);
  if (!ids) return null;
  if (ids.length === 0) return ["Nothing selected"];
  const text = new Map(item.payload.options.map((o) => [o.id, o.text]));
  return ids.map((id) => text.get(id) ?? "(an option that is no longer in the lesson)");
}

function selectionGridText(item: SelectionGridItem, response: unknown): string[] | null {
  if (!Array.isArray(response)) return null;
  const answers = new Map<string, boolean>();
  for (const r of response) {
    if (!isRecord(r) || typeof r.rowId !== "string" || typeof r.answer !== "boolean") return null;
    answers.set(r.rowId, r.answer);
  }
  return item.payload.rows.map((row) => {
    const a = answers.get(row.id);
    return `${row.statement}: ${a === undefined ? NO_ANSWER : a ? "True" : "False"}`;
  });
}

function orderingText(item: OrderingItem, response: unknown): string[] | null {
  if (!isRecord(response)) return null;
  const order = stringArray(response.order);
  if (!order) return null;
  if (order.length === 0) return ["No order given"];
  const text = new Map(item.payload.elements.map((e) => [e.id, e.text]));
  return order.map((id, i) => `${i + 1}. ${text.get(id) ?? "(an element that is no longer in the lesson)"}`);
}

function matchingText(item: MatchingItem, response: unknown): string[] | null {
  if (!Array.isArray(response)) return null;
  const picked = new Map<string, string>();
  for (const r of response) {
    if (!isRecord(r) || typeof r.left !== "string" || typeof r.right !== "string") return null;
    picked.set(r.left, r.right);
  }
  const label = (c: { kind: "text"; text: string } | { kind: "image"; src: string; alt: string }) =>
    c.kind === "text" ? c.text : `[image: ${c.alt}]`;
  const right = new Map(item.payload.right.map((e) => [e.id, label(e.content)]));
  return item.payload.left.map((l) => {
    const r = picked.get(l.id);
    return `${label(l.content)} → ${r === undefined ? NO_ANSWER : (right.get(r) ?? "(an option that is no longer in the lesson)")}`;
  });
}

function slotsText(item: SlotsItem, response: unknown): string[] | null {
  if (!Array.isArray(response)) return null;
  const answers = new Map<string, string>();
  for (const r of response) {
    if (!isRecord(r) || typeof r.gapId !== "string" || typeof r.answer !== "string") return null;
    answers.set(r.gapId, r.answer);
  }
  return item.payload.gaps.map((g, i) => {
    const a = answers.get(g.id);
    return `Gap ${i + 1}: ${a === undefined || a.trim() === "" ? NO_ANSWER : a}`;
  });
}

function linesFor(item: Item, response: unknown): string[] | null {
  switch (item.type) {
    case "selection":
      return selectionText(item, response);
    case "selection_grid":
      return selectionGridText(item, response);
    case "ordering":
      return orderingText(item, response);
    case "matching":
      return matchingText(item, response);
    case "slots":
      return slotsText(item, response);
  }
}

/**
 * `block` is the practice block JSON from the attempt's own version
 * (`{ id, kind: 'practice', type, payload }`); `response` is
 * lesson_attempts.response.
 */
export function answerText(block: unknown, response: unknown): AnswerText {
  if (response === null || response === undefined) return { status: "no_response" };
  if (!isRecord(block)) return { status: "unreadable" };
  const parsed = parseItem({ id: block.id, type: block.type, payload: block.payload });
  if (!parsed.ok) return { status: "unreadable" };
  const lines = linesFor(parsed.item, response);
  if (!lines) return { status: "unreadable" };
  return { status: "ok", prompt: parsed.item.payload.prompt, lines };
}
