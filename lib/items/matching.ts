import { z } from "zod";
import { authoredString } from "../courseContent";
import { ItemResponseError } from "./errors";
import {
  ItemEnvelopeSchema,
  type ItemScoreResult,
  type ItemTypeModule,
  type MatchingItem,
  type ParseError,
  type ParseResult,
} from "./types";

/**
 * `matching` — a set of pairs between a `left` side and a `right` side,
 * authored independently: either side may carry elements the other has no
 * partner for (distractors), and `left`/`right` sizes need not match.
 * Word-to-definition and word-to-image are the same type; an element's
 * `content` is a `text`/`image` union that `score` never reads — see
 * docs/decisions/0013-matching-scoring.md, which also covers the two
 * questions this card left open: subResult identity (the pair's own `id`,
 * not either element's) and the many-to-one case (legal, both authored and
 * answered).
 */

const MatchingContentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: authoredString() }),
  z.strictObject({ kind: z.literal("image"), src: authoredString(), alt: authoredString() }),
]);

/** An element's presentation content — never read by `score`. */
export type MatchingContent = z.infer<typeof MatchingContentSchema>;

const MatchingElementSchema = z.strictObject({
  id: z.string().min(1),
  content: MatchingContentSchema,
});

export type MatchingElement = z.infer<typeof MatchingElementSchema>;

const MatchingPairSchema = z.strictObject({
  id: z.string().min(1),
  /** References `left[].id`. */
  left: z.string().min(1),
  /** References `right[].id`. */
  right: z.string().min(1),
  /** A REFERENCE into the item's authored explanations; ITEM-009 resolves it. */
  explanationRef: z.string().min(1),
});

export type MatchingPair = z.infer<typeof MatchingPairSchema>;

const MatchingPayloadSchema = z
  .strictObject({
    prompt: authoredString(),
    left: z.array(MatchingElementSchema).min(1),
    right: z.array(MatchingElementSchema).min(1),
    // A left element with no pair is a legal distractor (see decision 0013),
    // so `pairs` is not required to cover every `left` element — but at
    // least one pair is required, or the item measures nothing.
    pairs: z.array(MatchingPairSchema).min(1),
  })
  .superRefine((payload, ctx) => {
    const leftIds = payload.left.map((element) => element.id);
    if (new Set(leftIds).size !== leftIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["left"],
        message: "left element ids must be distinct — a response id must identify exactly one element",
      });
    }

    const rightIds = payload.right.map((element) => element.id);
    if (new Set(rightIds).size !== rightIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["right"],
        message: "right element ids must be distinct — a response id must identify exactly one element",
      });
    }

    const pairIds = payload.pairs.map((pair) => pair.id);
    if (new Set(pairIds).size !== pairIds.length) {
      ctx.addIssue({ code: "custom", path: ["pairs"], message: "pair ids must be distinct" });
    }

    const pairLeftIds = payload.pairs.map((pair) => pair.left);
    if (new Set(pairLeftIds).size !== pairLeftIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["pairs"],
        message: "each left element may be the subject of at most one pair",
      });
    }

    const leftIdSet = new Set(leftIds);
    const rightIdSet = new Set(rightIds);
    payload.pairs.forEach((pair, index) => {
      if (!leftIdSet.has(pair.left)) {
        ctx.addIssue({
          code: "custom",
          path: ["pairs", index, "left"],
          message: `pair references a left element id not in "left": "${pair.left}"`,
        });
      }
      if (!rightIdSet.has(pair.right)) {
        ctx.addIssue({
          code: "custom",
          path: ["pairs", index, "right"],
          message: `pair references a right element id not in "right": "${pair.right}"`,
        });
      }
    });
  });

/** The authored shape of a `matching` item's payload. */
export type MatchingPayload = z.infer<typeof MatchingPayloadSchema>;

const MatchingResponseSchema = z.array(
  z.strictObject({
    left: z.string().min(1),
    right: z.string().min(1),
  }),
);

/** What a learner submits for a `matching` item: one entry per left element
 * they have paired. A left element with no entry is unpaired, not absent. */
export type MatchingResponse = z.infer<typeof MatchingResponseSchema>;

/** Renders a zod issue path as a field string: `payload.left[0].content`. */
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

function parse(input: unknown): ParseResult<MatchingItem> {
  const envelope = ItemEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, errors: toParseErrors(envelope.error, "") };
  }
  if (envelope.data.type !== "matching") {
    return {
      ok: false,
      errors: [{ field: "type", message: `expected "matching", got "${envelope.data.type}"` }],
    };
  }

  const payload = MatchingPayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, errors: toParseErrors(payload.error, "payload") };
  }

  return {
    ok: true,
    item: { id: envelope.data.id, type: "matching", payload: payload.data },
  };
}

/**
 * Validates a response against the item and returns a lookup from left
 * element id to the right element id it was paired with. Unattempted
 * (null/undefined, or an empty array) reads as "nothing paired".
 *
 * A repeated `left` id is rejected (`duplicate_id`) — which of two answers
 * for the same left element would count is genuinely ambiguous. A repeated
 * `right` id is NOT rejected: see docs/decisions/0013-matching-scoring.md.
 */
function readResponse(item: MatchingItem, response: unknown): Map<string, string> {
  if (response === null || response === undefined) return new Map();

  const parsed = MatchingResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ItemResponseError(
      "malformed",
      item.id,
      "matching",
      `response is not a matching response: ${parsed.error.issues.map((i) => `${formatPath(i.path, "", "(response)")}: ${i.message}`).join("; ")}`,
    );
  }

  const leftIds = parsed.data.map((entry) => entry.left);
  if (new Set(leftIds).size !== leftIds.length) {
    throw new ItemResponseError(
      "duplicate_id",
      item.id,
      "matching",
      `response pairs the same left element more than once: ${leftIds.join(", ")}`,
    );
  }

  const knownLeft = new Set(item.payload.left.map((element) => element.id));
  const unknownLeft = leftIds.filter((id) => !knownLeft.has(id));
  if (unknownLeft.length > 0) {
    throw new ItemResponseError(
      "unknown_id",
      item.id,
      "matching",
      `response pairs left element(s) not on this item: ${unknownLeft.join(", ")}`,
    );
  }

  const knownRight = new Set(item.payload.right.map((element) => element.id));
  const rightIds = parsed.data.map((entry) => entry.right);
  const unknownRight = rightIds.filter((id) => !knownRight.has(id));
  if (unknownRight.length > 0) {
    throw new ItemResponseError(
      "unknown_id",
      item.id,
      "matching",
      `response pairs right element(s) not on this item: ${unknownRight.join(", ")}`,
    );
  }

  return new Map(parsed.data.map((entry) => [entry.left, entry.right]));
}

function score(item: MatchingItem, response: unknown): ItemScoreResult {
  const { pairs } = item.payload;

  // Not an ItemResponseError: the RESPONSE is fine, the ITEM is broken, and
  // `parse` rejects this shape (min(1) on `pairs`). Only a hand-built item
  // that skipped `parse` can reach here.
  if (pairs.length === 0) {
    throw new Error(`matching item "${item.id}" has no pairs — it did not come from parse()`);
  }

  const answers = readResponse(item, response);

  // `possible` counts only left elements with a correct partner — a left
  // distractor (no pair) is never scored, same as a right distractor is
  // never scored, per this card's acceptance.
  const subResults = pairs.map((pair) => {
    const answered = answers.get(pair.left);
    const correct = answered === pair.right;
    return { id: pair.id, correct, earned: correct ? 1 : 0, possible: 1, explanationRef: pair.explanationRef };
  });

  return {
    earned: subResults.reduce((sum, r) => sum + r.earned, 0),
    possible: subResults.reduce((sum, r) => sum + r.possible, 0),
    subResults,
  };
}

export const matchingModule: ItemTypeModule<MatchingItem> = {
  parse,
  score,
  rendererNeeds: { inputs: ["drag"] },
};
