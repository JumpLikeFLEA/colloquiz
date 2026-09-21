import { z } from "zod";
import { authoredString } from "../courseContent";
import { checkExplanationCoverage, ExplanationsSchema, FallbackExplanationSchema } from "./explanations";
import { ItemResponseError } from "./errors";
import {
  ItemEnvelopeSchema,
  type ItemScoreResult,
  type ItemTypeModule,
  type ParseError,
  type ParseResult,
  type SlotsItem,
} from "./types";

/**
 * `slots` — N gaps, each with a list of accepted answers (cloze, word
 * insertion). `input: 'typed' | 'drag'` is presentation metadata ONLY —
 * `score` never reads it, and a test asserts the same response scores
 * identically under either value. How a gap's position within the prompt
 * text is conveyed to a renderer is a rendering-layer concern this card
 * does not decide; `prompt` is plain authored text and `gaps` is the
 * ordered, independently-scored list the renderer composes against.
 *
 * Normalisation (case, whitespace, curly apostrophes, trailing punctuation)
 * is this card's substance — see docs/decisions/0014-slots-normalization.md.
 * Fuzzy matching / typo tolerance is explicitly out of scope there.
 */

const SlotGapSchema = z.strictObject({
  id: z.string().min(1),
  // A list, not one string: docs/handoff.md's item-type table and this
  // card's acceptance both call this out explicitly.
  acceptedAnswers: z.array(authoredString()).min(1),
  /** A reference into `explanations` (or the `fallbackExplanation`) — see
   * lib/items/explanations.ts. */
  explanationRef: z.string().min(1),
});

export type SlotGap = z.infer<typeof SlotGapSchema>;

const SlotsPayloadSchema = z
  .strictObject({
    prompt: authoredString(),
    input: z.enum(["typed", "drag"]),
    gaps: z.array(SlotGapSchema).min(1),
    explanations: ExplanationsSchema,
    fallbackExplanation: FallbackExplanationSchema,
  })
  .superRefine((payload, ctx) => {
    const ids = payload.gaps.map((gap) => gap.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["gaps"],
        message: "gap ids must be distinct — a response id must identify exactly one gap",
      });
    }

    const { missingRefs, unusedKeys } = checkExplanationCoverage(
      payload.gaps.map((gap) => gap.explanationRef),
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
        message: `explanations has key(s) no gap's explanationRef references: ${unusedKeys.join(", ")}`,
      });
    }
  });

/** The authored shape of a `slots` item's payload. */
export type SlotsPayload = z.infer<typeof SlotsPayloadSchema>;

const SlotsResponseSchema = z.array(
  z.strictObject({
    gapId: z.string().min(1),
    // Not `authoredString`: this is a LEARNER'S raw typed/dropped input, not
    // authored content — an empty string is legal (a gap left blank) and no
    // control-character guard applies to it.
    answer: z.string(),
  }),
);

/** What a learner submits for a `slots` item: one entry per gap they have
 * touched. A gap with no entry is untouched, not absent. */
export type SlotsResponse = z.infer<typeof SlotsResponseSchema>;

/** Renders a zod issue path as a field string: `payload.gaps[0].acceptedAnswers`. */
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

// U+2018/U+2019/U+02BC — the "smart quote" substitutions an autocorrect
// keyboard (English or Russian layout) makes for a straight apostrophe. See
// docs/decisions/0014-slots-normalization.md for why only these three.
const CURLY_APOSTROPHES = /[‘’ʼ]/g;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

/** The comparison key for a typed answer — see docs/decisions/0014. Applied
 * to both the learner's response and every authored accepted answer. */
function normalizeSlotAnswer(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(CURLY_APOSTROPHES, "'")
    .replace(TRAILING_PUNCTUATION, "")
    .trim()
    .toLowerCase();
}

function parse(input: unknown): ParseResult<SlotsItem> {
  const envelope = ItemEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, errors: toParseErrors(envelope.error, "") };
  }
  if (envelope.data.type !== "slots") {
    return {
      ok: false,
      errors: [{ field: "type", message: `expected "slots", got "${envelope.data.type}"` }],
    };
  }

  const payload = SlotsPayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, errors: toParseErrors(payload.error, "payload") };
  }

  return {
    ok: true,
    item: { id: envelope.data.id, type: "slots", payload: payload.data },
  };
}

/**
 * Validates a response against the item and returns a lookup from gap id to
 * the learner's raw (not yet normalised) answer. Unattempted (null/
 * undefined, or an empty array) reads as "no gaps touched".
 */
function readResponse(item: SlotsItem, response: unknown): Map<string, string> {
  if (response === null || response === undefined) return new Map();

  const parsed = SlotsResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ItemResponseError(
      "malformed",
      item.id,
      "slots",
      `response is not a slots response: ${parsed.error.issues.map((i) => `${formatPath(i.path, "", "(response)")}: ${i.message}`).join("; ")}`,
    );
  }

  const gapIds = parsed.data.map((entry) => entry.gapId);
  if (new Set(gapIds).size !== gapIds.length) {
    throw new ItemResponseError(
      "duplicate_id",
      item.id,
      "slots",
      `response answers the same gap more than once: ${gapIds.join(", ")}`,
    );
  }

  const known = new Set(item.payload.gaps.map((gap) => gap.id));
  const unknown = gapIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ItemResponseError(
      "unknown_id",
      item.id,
      "slots",
      `response answers gap(s) not on this item: ${unknown.join(", ")}`,
    );
  }

  return new Map(parsed.data.map((entry) => [entry.gapId, entry.answer]));
}

function score(item: SlotsItem, response: unknown): ItemScoreResult {
  const { gaps } = item.payload;

  // Not an ItemResponseError: the RESPONSE is fine, the ITEM is broken, and
  // `parse` rejects this shape (min(1) on `gaps`). Only a hand-built item
  // that skipped `parse` can reach here.
  if (gaps.length === 0) {
    throw new Error(`slots item "${item.id}" has no gaps — it did not come from parse()`);
  }

  const answers = readResponse(item, response);

  const subResults = gaps.map((gap) => {
    // A gap absent from the response, or answered with "", is untouched:
    // scored incorrect, not excluded — same convention as selection_grid's
    // unanswered row.
    const raw = answers.get(gap.id);
    const normalizedAcceptedAnswers = gap.acceptedAnswers.map(normalizeSlotAnswer);
    const correct = raw !== undefined && normalizedAcceptedAnswers.includes(normalizeSlotAnswer(raw));
    return { id: gap.id, correct, earned: correct ? 1 : 0, possible: 1, explanationRef: gap.explanationRef };
  });

  return {
    earned: subResults.reduce((sum, r) => sum + r.earned, 0),
    possible: subResults.reduce((sum, r) => sum + r.possible, 0),
    subResults,
  };
}

export const slotsModule: ItemTypeModule<SlotsItem> = {
  parse,
  score,
  rendererNeeds: { inputs: ["typed", "drag"] },
};
