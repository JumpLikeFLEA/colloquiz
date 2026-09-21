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
 * - Coverage is checked at PARSE TIME (each type's `superRefine` calls
 *   `checkExplanationCoverage` and turns a gap into a `ParseError`), so an
 *   item that fails to resolve every explanation it can produce never
 *   reaches `score`/`resolveExplanations` at all — see the decision doc for
 *   why that is a parse-time rejection, not a runtime blank or a warning.
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
 * Checks that every `usedRef` (the `explanationRef` values an item's own
 * sub-parts declare, e.g. `payload.rows.map(r => r.explanationRef)`)
 * resolves to either a specific entry in `explanations` or, absent that, to
 * `fallbackExplanation`. Also flags `explanations` entries that no sub-part
 * references — almost always a stale ref after a row/pair/gap was renamed
 * or removed, so it is rejected the same way an unknown id anywhere else in
 * this engine is rejected, not silently ignored.
 */
export function checkExplanationCoverage(
  usedRefs: readonly string[],
  explanations: ExplanationsMap,
  fallbackExplanation: string | undefined,
): { missingRefs: string[]; unusedKeys: string[] } {
  const used = new Set(usedRefs);
  const missingRefs =
    fallbackExplanation === undefined ? [...used].filter((ref) => !(ref in explanations)) : [];
  const unusedKeys = Object.keys(explanations).filter((key) => !used.has(key));
  return { missingRefs, unusedKeys };
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

/**
 * Thrown only when a `SubResult.explanationRef` resolves to neither a
 * specific entry nor a fallback — a state `checkExplanationCoverage`
 * guarantees cannot occur for any item that passed `parse()`. It exists as
 * an assertion, not a scoring outcome: reaching it means an `Item` was
 * constructed some way other than through `parseItem`/a type's own `parse`.
 */
export class ExplanationResolutionError extends Error {
  readonly itemId: string;
  readonly subResultId: string;
  readonly explanationRef: string;

  constructor(itemId: string, subResultId: string, explanationRef: string) {
    super(
      `item "${itemId}": subResult "${subResultId}" has explanationRef "${explanationRef}", which resolves to ` +
        "no specific explanation and no fallbackExplanation — this item did not pass parse()",
    );
    this.name = "ExplanationResolutionError";
    this.itemId = itemId;
    this.subResultId = subResultId;
    this.explanationRef = explanationRef;
  }
}

function resolveOne(
  itemId: string,
  fields: ItemExplanationFields,
  subResult: SubResult,
): string {
  const specific = fields.explanations[subResult.explanationRef];
  if (specific !== undefined) return specific;
  if (fields.fallbackExplanation !== undefined) return fields.fallbackExplanation;
  throw new ExplanationResolutionError(itemId, subResult.id, subResult.explanationRef);
}

/**
 * Maps a scored item's WRONG sub-responses to their resolved explanation
 * text, in presentation order. A correct sub-response is excluded, never
 * returned with an empty explanation.
 */
export function resolveExplanations(item: Item, result: ItemScoreResult): ResolvedExplanation[] {
  const fields: ItemExplanationFields = item.payload;
  return result.subResults
    .filter((subResult) => !subResult.correct)
    .map((subResult) => ({
      subResultId: subResult.id,
      explanation: resolveOne(item.id, fields, subResult),
    }));
}
