import { z } from "zod";
import { authoredString } from "../authoredString";
import { checkExplanationCoverage, ExplanationsSchema, FallbackExplanationSchema } from "./explanations";
import { ItemResponseError } from "./errors";
import {
  ItemEnvelopeSchema,
  type ItemScoreResult,
  type ItemTypeModule,
  type OrderingItem,
  type ParseError,
  type ParseResult,
} from "./types";

/**
 * `ordering` — a permutation of N elements (sequencing, word order). Drag is
 * the presentation affordance (lib/items/shuffle.ts scrambles the DISPLAY
 * order); scoring never sees or depends on it, only on the id sequence the
 * learner submits — see shuffle.test.ts, "no scoring depends on presentation
 * order".
 *
 * `elements` is authored IN THE CORRECT ORDER — there is no separate
 * `correctOrder` field, the same convention `selection_grid`'s rows use
 * (a row's own `correct` flag, not a side table). Scoring rule and the
 * response-validity boundary: see docs/decisions/0011-ordering-scoring.md.
 */

const OrderingElementSchema = z.strictObject({
  id: z.string().min(1),
  text: authoredString(),
  /** A reference into `explanations` (or the `fallbackExplanation`) — see
   * lib/items/explanations.ts. Per-element, not per-item: a wrong position is
   * a wrong sub-response of its own (ITEM-009), the same as a grid row, a
   * matching pair or a slots gap. This moved off the item level in ITEM-009;
   * ordering shipped (ITEM-005) with a single item-level `explanationRef`,
   * which ITEM-009's acceptance ("an ordering position... carries its own
   * explanation") superseded — see docs/decisions/0017-explanation-resolution.md. */
  explanationRef: z.string().min(1),
});

export type OrderingElement = z.infer<typeof OrderingElementSchema>;

const OrderingPayloadSchema = z
  .strictObject({
    prompt: authoredString(),
    // Fewer than 2 elements has only one possible order and measures nothing
    // — the ordering analogue of selection's "every option correct" rejection.
    elements: z.array(OrderingElementSchema).min(2),
    explanations: ExplanationsSchema,
    fallbackExplanation: FallbackExplanationSchema,
  })
  .superRefine((payload, ctx) => {
    const ids = payload.elements.map((element) => element.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["elements"],
        message: "element ids must be distinct — a response id must identify exactly one element",
      });
    }

    const { missingRefs, unusedKeys } = checkExplanationCoverage(
      payload.elements.map((element) => element.explanationRef),
      payload.explanations,
      payload.fallbackExplanation,
    );
    if (missingRefs.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["explanations"],
        message: `explanationRef(s) resolve to no explanation and no fallbackExplanation is set: ${missingRefs.join(", ")}`,
      });
    }
    if (unusedKeys.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["explanations"],
        message: `explanations has key(s) no element's explanationRef references: ${unusedKeys.join(", ")}`,
      });
    }
  });

/** The authored shape of an `ordering` item's payload. */
export type OrderingPayload = z.infer<typeof OrderingPayloadSchema>;

const OrderingResponseSchema = z.strictObject({
  /** The learner's submitted sequence, by element id — never by position. */
  order: z.array(z.string().min(1)),
});

/** What a learner submits for an `ordering` item. */
export type OrderingResponse = z.infer<typeof OrderingResponseSchema>;

/** Renders a zod issue path as a field string: `payload.elements[0].text`. */
function formatPath(path: ReadonlyArray<PropertyKey>, prefix: string, emptyLabel = "(item)"): string {
  const rendered = path.reduce<string>(
    (acc, segment) =>
      typeof segment === "number" ? `${acc}[${segment}]` : acc ? `${acc}.${String(segment)}` : String(segment),
    prefix,
  );
  return rendered || emptyLabel;
}

function toParseErrors(error: z.ZodError, prefix: string): ParseError[] {
  return error.issues.map((issue) => ({
    field: formatPath(issue.path, prefix),
    message: issue.message,
  }));
}

function parse(input: unknown): ParseResult<OrderingItem> {
  const envelope = ItemEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, errors: toParseErrors(envelope.error, "") };
  }
  if (envelope.data.type !== "ordering") {
    return {
      ok: false,
      errors: [{ field: "type", message: `expected "ordering", got "${envelope.data.type}"` }],
    };
  }

  const payload = OrderingPayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, errors: toParseErrors(payload.error, "payload") };
  }

  return {
    ok: true,
    item: { id: envelope.data.id, type: "ordering", payload: payload.data },
  };
}

/**
 * Validates a response against the item and returns the submitted id
 * sequence, or `null` for unattempted. Anything else must be a COMPLETE
 * permutation of the item's element ids — a partial drag (some slots filled,
 * others not) has no well-defined per-position score the way a
 * `selection_grid`'s unanswered row does, because a missing element leaves a
 * gap in the sequence, not an independently-scorable "no answer" at a fixed
 * position. That is the acceptance line this enforces: duplicate and missing
 * cases are rejected before scoring, not scored as a wrong answer.
 */
function readOrder(item: OrderingItem, response: unknown): string[] | null {
  if (response === null || response === undefined) return null;

  const parsed = OrderingResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ItemResponseError(
      "malformed",
      item.id,
      "ordering",
      `response is not an ordering response: ${parsed.error.issues.map((i) => `${formatPath(i.path, "", "(response)")}: ${i.message}`).join("; ")}`,
    );
  }

  const order = parsed.data.order;

  if (new Set(order).size !== order.length) {
    throw new ItemResponseError(
      "duplicate_id",
      item.id,
      "ordering",
      `response places the same element more than once: ${order.join(", ")}`,
    );
  }

  const known = new Set(item.payload.elements.map((element) => element.id));
  const unknown = order.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ItemResponseError(
      "unknown_id",
      item.id,
      "ordering",
      `response places element(s) not on this item: ${unknown.join(", ")}`,
    );
  }

  const missing = [...known].filter((id) => !order.includes(id));
  if (missing.length > 0) {
    throw new ItemResponseError(
      "missing_element",
      item.id,
      "ordering",
      `response omits element(s) from this item: ${missing.join(", ")}`,
    );
  }

  return order;
}

function score(item: OrderingItem, response: unknown): ItemScoreResult {
  const { elements } = item.payload;

  // Not an ItemResponseError: the RESPONSE is fine, the ITEM is broken,
  // and `parse` rejects this shape. Only a hand-built item that skipped
  // `parse` can reach here.
  if (elements.length < 2) {
    throw new Error(`ordering item "${item.id}" has fewer than 2 elements — it did not come from parse()`);
  }

  const order = readOrder(item, response);

  // Unattempted: every position is wrong, same as a selection_grid row with
  // no matching response entry.
  const subResults = elements.map((element, position) => {
    const correct = order !== null && order[position] === element.id;
    return { id: element.id, correct, earned: correct ? 1 : 0, possible: 1, explanationRef: element.explanationRef };
  });

  return {
    earned: subResults.reduce((sum, r) => sum + r.earned, 0),
    possible: subResults.reduce((sum, r) => sum + r.possible, 0),
    subResults,
  };
}

export const orderingModule: ItemTypeModule<OrderingItem> = {
  parse,
  score,
  rendererNeeds: { inputs: ["drag", "typed"] },
};
