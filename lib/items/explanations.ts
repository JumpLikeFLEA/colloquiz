import { z } from "zod";
import { authoredString } from "../authoredString";
import type { Item, ItemScoreResult, SubResult } from "./types";

/**
 * ITEM-009 — explanation resolution. See
 * docs/decisions/0017-explanation-resolution.md for why the shape below is
 * what it is; in short:
 *
 * - Every `SubResult.explanationRef` (ITEM-001) is a key into the item's own
 *   `payload.explanations` map, OR falls back to `payload.fallbackExplanation`
 *   when no entry under that key exists.
 * - `explanations` and `fallbackExplanation` are declared on each type's own
 *   payload schema (selection/selectionGrid/ordering/matching/slots), not on
 *   the shared envelope — the same "each type owns its own authored fields"
 *   convention `explanationRef` itself already follows. This module only
 *   holds the ONE check and the ONE resolver every type's payload shares,
 *   so the rule lives in one place instead of five near-identical copies.
 * - An explanation is OPTIONAL (owner, 2026-11-20, docs/decisions/0230,
 *   revising 0017 Decision 3). A sub-part whose ref resolves to neither an
 *   entry nor the fallback simply has no explanation: the learner sees the
 *   right answer ("Correct: …", PLAY-015) and no "Why?". Parse still rejects
 *   an `explanations` key no sub-part references (a stale ref).
 */

/** An authored explanation is prose: multi-line allowed via authoredString's
 * `allowNewlines` option (lib/authoredString.ts) — a C0 control char other
 * than `\n` is still rejected. */
const explanationText = () => authoredString(1, { allowNewlines: true });

/** `payload.explanations` — every type's own schema declares this field with
 * this exact schema value (not merged in structurally, so each type's zod
 * error paths read `payload.explanations`, not something re-exported). */
export const ExplanationsSchema = z.record(z.string().min(1), explanationText());

export type ExplanationsMap = z.infer<typeof ExplanationsSchema>;

/** `payload.fallbackExplanation` — every type's own schema declares this
 * field with this exact schema value. Optional: a lesson that gives every
 * sub-part its own specific explanation need not also set a fallback. */
export const FallbackExplanationSchema = explanationText().optional();

/** The two fields every type's payload adds, structurally — `resolveExplanations`
 * and `checkExplanationCoverage` read the fields, not the type's own union member. */
export interface ItemExplanationFields {
  explanations: ExplanationsMap;
  fallbackExplanation?: string;
}

/**
 * Flags `explanations` entries that no sub-part references (`usedRefs` are
 * the `explanationRef` values an item's own sub-parts declare, e.g.
 * `payload.rows.map(r => r.explanationRef)`) — almost always a stale ref
 * after a row/pair/gap was renamed or removed, so it is rejected the same way
 * an unknown id anywhere else in this engine is rejected, not silently
 * ignored. A ref with no entry and no fallback is NOT flagged: explanations
 * are optional (docs/decisions/0230).
 */
export function checkExplanationCoverage(
  usedRefs: readonly string[],
  explanations: ExplanationsMap,
): { unusedKeys: string[] } {
  const used = new Set(usedRefs);
  const unusedKeys = Object.keys(explanations).filter((key) => !used.has(key));
  return { unusedKeys };
}

/** One resolved explanation for a wrong sub-response, in the order
 * `result.subResults` presents them (authored order — see each type's own
 * `score`, which builds `subResults` by mapping over its authored rows/
 * elements/pairs/gaps). A correct sub-response resolves to nothing: it is
 * simply absent from the returned array, not present with an empty string. */
export interface ResolvedExplanation {
  subResultId: string;
  explanation: string;
}

function resolveOne(fields: ItemExplanationFields, subResult: SubResult): string | undefined {
  return fields.explanations[subResult.explanationRef] ?? fields.fallbackExplanation;
}

/**
 * Maps a scored item's WRONG sub-responses to their resolved explanation
 * text, in presentation order. A correct sub-response is excluded, never
 * returned with an empty explanation; so is a wrong one the author gave no
 * explanation (no entry, no fallback — docs/decisions/0230).
 */
export function resolveExplanations(item: Item, result: ItemScoreResult): ResolvedExplanation[] {
  const fields: ItemExplanationFields = item.payload;
  const resolved: ResolvedExplanation[] = [];
  for (const subResult of result.subResults) {
    if (subResult.correct) continue;
    const explanation = resolveOne(fields, subResult);
    if (explanation !== undefined) resolved.push({ subResultId: subResult.id, explanation });
  }
  return resolved;
}
