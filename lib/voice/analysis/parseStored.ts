import { z } from "zod";
import { ERROR_CATEGORIES, GOAL_REACHED_STATUSES, HIGHLIGHT_KINDS, type Span } from "./schema";
import type { ViewAnalysis } from "./view";

/**
 * Reads a stored `voice_analyses.result` into what the learner's feedback view draws (VOICE-014,
 * docs/decisions/0189): defensively, because the row is JSONB and old rows predate a field (final-v0
 * has no `goalReached`), so a missing field is "absent", an item that no longer points at the words
 * it quotes is dropped, and nothing is ever treated as HTML. The counts are recomputed from the
 * items that survived parsing, so a card never disagrees with the list under it.
 *
 * Split out of view.ts (PROG-007, docs/decisions/0191) because this is the part that needs zod, and
 * view.ts is imported by the feedback components that ship to the browser: a page that parses on the
 * server (the before/after screen) should not make the browser download the schema library to draw
 * a result. The lesson page parses in the browser, as before, and imports this module itself.
 */

const SpanSchema = z.object({ start: z.number().int().min(0), end: z.number().int().min(1) });

const ExpressionSchema = z.object({
  expression: z.string(),
  quote: z.string(),
  exact: z.boolean(),
  span: SpanSchema,
});
const HighlightSchema = z.object({
  quote: z.string(),
  kind: z.enum(HIGHLIGHT_KINDS),
  note: z.string(),
  span: SpanSchema,
});
const ErrorSchema = z.object({
  quote: z.string(),
  correction: z.string(),
  category: z.enum(ERROR_CATEGORIES),
  explanation: z.string(),
  span: SpanSchema,
});
const ThenNowSchema = z.object({
  then: z.string(),
  now: z.string(),
  note: z.string(),
  thenSpan: SpanSchema,
  nowSpan: SpanSchema,
});

/** An array whose bad members are left out instead of failing the whole read. */
function lenientList<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items): z.infer<T>[] => items.flatMap((i) => {
      const r = item.safeParse(i);
      return r.success ? [r.data] : [];
    }));
}

const StoredSchema = z.object({
  kind: z.enum(["first", "final"]),
  summary: z.string().catch(""),
  howItSounds: z.string().catch(""),
  goal: z.string().nullable().catch(null),
  goalReached: z
    .object({ status: z.enum(GOAL_REACHED_STATUSES), note: z.string() })
    .nullable()
    .catch(null),
  nextStep: z.string().nullable().catch(null),
  expressionsUsed: lenientList(ExpressionSchema),
  highlights: lenientList(HighlightSchema),
  errors: lenientList(ErrorSchema),
  mainError: z.number().int().nullable().catch(null),
  thenNow: lenientList(ThenNowSchema),
  counts: z.object({ expressionsListed: z.number().int().min(0) }).partial().catch({}),
  coverage: z
    .object({ analysedSeconds: z.number().nullable().catch(null), truncated: z.boolean().catch(false) })
    .catch({ analysedSeconds: null, truncated: false }),
});

function pointsAt(text: string, span: Span, quote: string): boolean {
  return span.end > span.start && span.end <= text.length && text.slice(span.start, span.end) === quote;
}

/**
 * A stored result as the view reads it, or null when it is not an analysis at all. `transcript`
 * is the text the offsets are into; `baselineTranscript` is the first take's, for a final's
 * `then` quotes (null drops the pairs: their `then` side cannot be checked).
 */
export function parseStoredAnalysis(
  raw: unknown,
  transcript: string,
  baselineTranscript: string | null = null,
): ViewAnalysis | null {
  const parsed = StoredSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  const expressionsUsed = r.expressionsUsed.filter((e) => pointsAt(transcript, e.span, e.quote));
  const highlights = r.highlights.filter((h) => pointsAt(transcript, h.span, h.quote));
  const errors: typeof r.errors = [];
  let mainError: number | null = null;
  r.errors.forEach((e, i) => {
    if (!pointsAt(transcript, e.span, e.quote)) return;
    if (r.mainError === i) mainError = errors.length;
    errors.push(e);
  });
  const thenNow =
    r.kind === "final" && baselineTranscript !== null
      ? r.thenNow.filter(
          (p) => pointsAt(baselineTranscript, p.thenSpan, p.then) && pointsAt(transcript, p.nowSpan, p.now),
        )
      : [];

  return {
    kind: r.kind,
    summary: r.summary,
    howItSounds: r.howItSounds,
    goal: r.kind === "first" ? r.goal : null,
    goalReached: r.kind === "final" ? r.goalReached : null,
    nextStep: r.kind === "final" ? r.nextStep : null,
    expressionsUsed,
    highlights,
    errors,
    mainError,
    thenNow,
    counts: {
      errors: errors.length,
      highlights: highlights.length,
      hesitations: highlights.filter((h) => h.kind === "hesitation").length,
      expressionsUsed: expressionsUsed.length,
      expressionsListed: r.counts.expressionsListed ?? 0,
      thenNow: thenNow.length,
    },
    coverage: r.coverage,
  };
}
