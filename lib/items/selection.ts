import { z } from "zod";
import { authoredString } from "../courseContent";
import {
  ItemEnvelopeSchema,
  type ItemScoreResult,
  type ItemTypeModule,
  type ParseError,
  type ParseResult,
  type SelectionItem,
} from "./types";

/**
 * `selection` — MCQ single, MCQ multi and True/False as ONE type, not three.
 * The surface form is a consequence of two authored fields: `multi` (one
 * choice or several) and the number of options (True/False is `multi: false`
 * with two options). No `variant` discriminator exists, because nothing in
 * scoring or parsing branches on the surface form — only on `multi`.
 *
 * Scoring rule and the error-channel choice: see
 * docs/decisions/0008-selection-scoring.md. In short:
 *
 *   earned = correctSelected / max(totalCorrectOptions, selectedCount)
 *
 * which is a plain "fraction of the correct options you found" whenever the
 * learner does not over-select, and only grows its denominator when they
 * select MORE options than the item has correct ones (the shotgun case).
 * There is no penalty term: a wrong tick never subtracts from a right one.
 */

const SelectionOptionSchema = z.strictObject({
  id: z.string().min(1),
  text: authoredString(),
});

/** One selectable option. `id` is what a response references; `text` is what
 * the learner reads — scoring never reads `text`. */
export type SelectionOption = z.infer<typeof SelectionOptionSchema>;

const SelectionPayloadSchema = z
  .strictObject({
    prompt: authoredString(),
    /** true = several options may be selected; false = exactly one (MCQ single, True/False). */
    multi: z.boolean(),
    options: z.array(SelectionOptionSchema).min(2),
    correctOptionIds: z.array(z.string().min(1)).min(1),
    /** A REFERENCE into the item's authored explanations; ITEM-009 resolves it. */
    explanationRef: z.string().min(1),
  })
  .superRefine((payload, ctx) => {
    const ids = payload.options.map((option) => option.id);

    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "option ids must be distinct — a response id must identify exactly one option",
      });
    }

    // Same rule as lib/exerciseValidate.ts: two options with identical text are
    // indistinguishable to the learner, so one of them is unpickable-on-purpose.
    const texts = payload.options.map((option) => option.text);
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "options must be textually distinct",
      });
    }

    if (new Set(payload.correctOptionIds).size !== payload.correctOptionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["correctOptionIds"],
        message: "correctOptionIds must be distinct — a repeated id would inflate the denominator",
      });
    }

    const unknown = payload.correctOptionIds.filter((id) => !ids.includes(id));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["correctOptionIds"],
        message: `correctOptionIds reference options that do not exist: ${unknown.join(", ")}`,
      });
    }

    // An item whose every option is correct cannot be answered wrongly, so it
    // measures nothing and "select everything" scores 100% legitimately. That
    // is an authoring mistake, not a scoring edge case — reject it here.
    if (unknown.length === 0 && payload.correctOptionIds.length >= payload.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["correctOptionIds"],
        message: "at least one option must be incorrect — an item with no wrong answer measures nothing",
      });
    }

    if (!payload.multi && payload.correctOptionIds.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["correctOptionIds"],
        message: `a single-answer item (multi: false) needs exactly one correct option, got ${payload.correctOptionIds.length}`,
      });
    }
  });

/** The authored shape of a `selection` item's payload. */
export type SelectionPayload = z.infer<typeof SelectionPayloadSchema>;

const SelectionResponseSchema = z.strictObject({
  /** Empty = unattempted. Order is not significant and is never scored. */
  selectedOptionIds: z.array(z.string().min(1)),
});

/** What a learner submits for a `selection` item. */
export type SelectionResponse = z.infer<typeof SelectionResponseSchema>;

export type SelectionResponseErrorCode =
  /** Not the response shape at all — a client serialization bug. */
  | "malformed"
  /** Names an option id the item does not have. */
  | "unknown_option"
  /** The same option id appears twice — a checkbox cannot be ticked twice. */
  | "duplicate_selection"
  /** More than one selection on a single-answer item — a radio group cannot. */
  | "too_many_selections";

/**
 * Thrown by `score` for a response that no learner could have produced.
 *
 * `ItemTypeModule.score` returns `ItemScoreResult` with no error channel, and
 * widening that shared contract would touch every type module — see
 * docs/decisions/0008. So a broken response throws instead of scoring zero:
 * acceptance requires that "a client bug and a wrong answer must not look
 * identical", and a thrown typed error is distinguishable from a real (possibly
 * zero) score by construction.
 *
 * Note what does NOT throw: a null/undefined response, and an empty
 * `selectedOptionIds`, both mean "unattempted" and score 0 — a learner really
 * can submit nothing.
 */
export class SelectionResponseError extends Error {
  readonly code: SelectionResponseErrorCode;
  readonly itemId: string;

  constructor(code: SelectionResponseErrorCode, itemId: string, message: string) {
    super(message);
    this.name = "SelectionResponseError";
    this.code = code;
    this.itemId = itemId;
  }
}

/** Renders a zod issue path as a field string: `payload.options[0].text`.
 * `emptyLabel` names the whole value when the issue has no path — which reads
 * differently for an item ("(item)") and a response ("(response)"). */
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

function parse(input: unknown): ParseResult<SelectionItem> {
  const envelope = ItemEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, errors: toParseErrors(envelope.error, "") };
  }
  if (envelope.data.type !== "selection") {
    return {
      ok: false,
      errors: [{ field: "type", message: `expected "selection", got "${envelope.data.type}"` }],
    };
  }

  const payload = SelectionPayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, errors: toParseErrors(payload.error, "payload") };
  }

  return {
    ok: true,
    item: { id: envelope.data.id, type: "selection", payload: payload.data },
  };
}

/**
 * Validates a response against the item and returns the selected ids.
 * Unattempted (null/undefined) reads as no selections rather than an error.
 */
function readSelection(item: SelectionItem, response: unknown): string[] {
  if (response === null || response === undefined) return [];

  const parsed = SelectionResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new SelectionResponseError(
      "malformed",
      item.id,
      `response is not a selection response: ${parsed.error.issues.map((i) => `${formatPath(i.path, "", "(response)")}: ${i.message}`).join("; ")}`,
    );
  }

  const selected = parsed.data.selectedOptionIds;

  if (new Set(selected).size !== selected.length) {
    throw new SelectionResponseError(
      "duplicate_selection",
      item.id,
      `response selects the same option more than once: ${selected.join(", ")}`,
    );
  }

  const known = new Set(item.payload.options.map((option) => option.id));
  const unknown = selected.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new SelectionResponseError(
      "unknown_option",
      item.id,
      `response names option(s) not on this item: ${unknown.join(", ")}`,
    );
  }

  if (!item.payload.multi && selected.length > 1) {
    throw new SelectionResponseError(
      "too_many_selections",
      item.id,
      `item is single-answer (multi: false) but the response selects ${selected.length} options`,
    );
  }

  return selected;
}

function score(item: SelectionItem, response: unknown): ItemScoreResult {
  const { correctOptionIds, explanationRef } = item.payload;

  // Not a SelectionResponseError: the RESPONSE is fine, the ITEM is broken, and
  // `parse` rejects this shape. Only a hand-built item that skipped `parse` can
  // reach here, and scoring it would divide by zero and put NaN in a lesson total.
  if (correctOptionIds.length === 0) {
    throw new Error(`selection item "${item.id}" has no correct options — it did not come from parse()`);
  }

  const selected = readSelection(item, response);
  const correct = new Set(correctOptionIds);
  const correctSelected = selected.filter((id) => correct.has(id)).length;

  // The denominator only exceeds the number of correct options when the learner
  // selected more options than the item has correct ones. Below that it is inert
  // and this is a plain correctSelected / totalCorrect.
  const denominator = Math.max(correct.size, selected.length);
  const earned = correctSelected / denominator;
  const possible = 1;

  return {
    earned,
    possible,
    subResults: [{ id: item.id, correct: earned === possible, earned, possible, explanationRef }],
  };
}

export const selectionModule: ItemTypeModule<SelectionItem> = {
  parse,
  score,
  // One affordance for all three surface forms; the renderer reads `multi` from
  // the payload to decide checkbox vs radio. A separate input kind per surface
  // form would re-introduce the three-types split this type exists to avoid.
  rendererNeeds: { inputs: ["choice"] },
};
