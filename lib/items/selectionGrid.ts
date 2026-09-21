import { z } from "zod";
import { authoredString } from "../authoredString";
import { checkExplanationCoverage, ExplanationsSchema, FallbackExplanationSchema } from "./explanations";
import { ItemResponseError } from "./errors";
import {
  ItemEnvelopeSchema,
  type ItemScoreResult,
  type ItemTypeModule,
  type ParseError,
  type ParseResult,
  type SelectionGridItem,
} from "./types";

/**
 * `selection_grid` — inline True/False over N statements: one row, one
 * boolean choice each. Unlike `selection` (docs/decisions/0008), a grid's rows
 * are independent — no response-shaped denominator, no over-selection case —
 * so each row is simply right or wrong and the item's `possible` is its row
 * count, per this card's acceptance ("`possible` equals the number of rows").
 *
 * A row that is unanswered scores incorrect rather than being excluded: the
 * acceptance is explicit that a partial grid "does not throw and does not
 * score the item as unattempted" — an 8-of-10 grid where 2 rows were never
 * touched is indistinguishable, for scoring, from 2 rows answered wrongly.
 */

const SelectionGridRowSchema = z.strictObject({
  id: z.string().min(1),
  statement: authoredString(),
  /** The row's answer key: true = the statement is true. */
  correct: z.boolean(),
  /** A reference into `explanations` (or the `fallbackExplanation`) — see
   * lib/items/explanations.ts. */
  explanationRef: z.string().min(1),
});

export type SelectionGridRow = z.infer<typeof SelectionGridRowSchema>;

const SelectionGridPayloadSchema = z
  .strictObject({
    prompt: authoredString(),
    // Zero rows is rejected here, at parse, rather than reaching score() and
    // dividing 0/0 into NaN — this card's acceptance names that case explicitly.
    rows: z.array(SelectionGridRowSchema).min(1),
    explanations: ExplanationsSchema,
    fallbackExplanation: FallbackExplanationSchema,
  })
  .superRefine((payload, ctx) => {
    const ids = payload.rows.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["rows"],
        message: "row ids must be distinct — a response id must identify exactly one row",
      });
    }

    const { missingRefs, unusedKeys } = checkExplanationCoverage(
      payload.rows.map((row) => row.explanationRef),
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
        message: `explanations has key(s) no row's explanationRef references: ${unusedKeys.join(", ")}`,
      });
    }
  });

/** The authored shape of a `selection_grid` item's payload. */
export type SelectionGridPayload = z.infer<typeof SelectionGridPayloadSchema>;

const SelectionGridResponseSchema = z.array(
  z.strictObject({
    rowId: z.string().min(1),
    answer: z.boolean(),
  }),
);

/** What a learner submits for a `selection_grid` item: one entry per
 * ANSWERED row. A row with no entry is unanswered, not absent. */
export type SelectionGridResponse = z.infer<typeof SelectionGridResponseSchema>;

/** Renders a zod issue path as a field string: `payload.rows[0].statement`. */
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

function parse(input: unknown): ParseResult<SelectionGridItem> {
  const envelope = ItemEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, errors: toParseErrors(envelope.error, "") };
  }
  if (envelope.data.type !== "selection_grid") {
    return {
      ok: false,
      errors: [{ field: "type", message: `expected "selection_grid", got "${envelope.data.type}"` }],
    };
  }

  const payload = SelectionGridPayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, errors: toParseErrors(payload.error, "payload") };
  }

  return {
    ok: true,
    item: { id: envelope.data.id, type: "selection_grid", payload: payload.data },
  };
}

/**
 * Validates a response against the item and returns a lookup from row id to
 * answer. Unattempted (null/undefined, or simply an empty array) reads as
 * "no rows answered" rather than an error.
 */
function readResponse(item: SelectionGridItem, response: unknown): Map<string, boolean> {
  if (response === null || response === undefined) return new Map();

  const parsed = SelectionGridResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ItemResponseError(
      "malformed",
      item.id,
      "selection_grid",
      `response is not a selection_grid response: ${parsed.error.issues.map((i) => `${formatPath(i.path, "", "(response)")}: ${i.message}`).join("; ")}`,
    );
  }

  const rowIds = parsed.data.map((entry) => entry.rowId);
  if (new Set(rowIds).size !== rowIds.length) {
    throw new ItemResponseError(
      "duplicate_id",
      item.id,
      "selection_grid",
      `response answers the same row more than once: ${rowIds.join(", ")}`,
    );
  }

  const known = new Set(item.payload.rows.map((row) => row.id));
  const unknown = rowIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ItemResponseError(
      "unknown_id",
      item.id,
      "selection_grid",
      `response answers row(s) not on this item: ${unknown.join(", ")}`,
    );
  }

  return new Map(parsed.data.map((entry) => [entry.rowId, entry.answer]));
}

function score(item: SelectionGridItem, response: unknown): ItemScoreResult {
  const { rows } = item.payload;

  // Not an ItemResponseError: the RESPONSE is fine, the ITEM is broken,
  // and `parse` rejects this shape. Only a hand-built item that skipped `parse`
  // can reach here, and scoring it would report possible: 0 — the exact 0/0
  // shape this card's acceptance calls out.
  if (rows.length === 0) {
    throw new Error(`selection_grid item "${item.id}" has no rows — it did not come from parse()`);
  }

  const answers = readResponse(item, response);

  const subResults = rows.map((row) => {
    // A row absent from the response is unanswered: scored incorrect, not
    // excluded — this is what keeps a partial grid from throwing or from
    // scoring as if the whole item were unattempted.
    const answered = answers.get(row.id);
    const correct = answered === row.correct;
    return { id: row.id, correct, earned: correct ? 1 : 0, possible: 1, explanationRef: row.explanationRef };
  });

  return {
    earned: subResults.reduce((sum, r) => sum + r.earned, 0),
    possible: subResults.reduce((sum, r) => sum + r.possible, 0),
    subResults,
  };
}

export const selectionGridModule: ItemTypeModule<SelectionGridItem> = {
  parse,
  score,
  rendererNeeds: { inputs: ["choice"] },
};
