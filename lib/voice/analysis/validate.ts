import type { RawAnalysis, Span, StoredAnalysis, VoiceAnalysisInstruction } from "./schema";

/**
 * Model output is checked before it is stored (docs/decisions/0156 "Model output is
 * checked before it is shown"). Pure; the pipeline calls it between Claude and
 * voice_analysis_finish.
 *
 * - A quote is kept only if it is a substring of the transcript it claims to come from.
 *   Whitespace at its edges is forgiven, nothing else: a near match is a quote the model
 *   made up. Each kept item carries its offsets, so the view can mark the transcript.
 * - Items of one list that overlap each other are resolved in the model's own order: the
 *   first stays, the later one is dropped. Lists are not resolved against each other: an
 *   expression sits legitimately inside an error ("made my mind"), and how the layers
 *   draw over each other is the view's decision (VOICE-014).
 * - Every count is computed here from what was kept.
 * - Nothing is rewritten, escaped or stripped. A quote containing `<b>` stays that text;
 *   the view renders text, never HTML.
 */

/** A quote is the smallest stretch that shows the point (the instruction says 2 to 8 words). */
export const QUOTE_MAX_LENGTH = 200;
/** Free text the learner reads. Long enough never to cut a sentence the instruction allows. */
export const TEXT_MAX_LENGTH = 600;
/** "Hesitations are normal; describe them neutrally and never more than one" (instruction). */
export const MAX_HESITATIONS = 1;

export type ValidateContext = {
  kind: VoiceAnalysisInstruction;
  /** The transcript the model saw (request.ts promptSafeText). Offsets are into this. */
  transcript: string;
  /** The baseline take's transcript, for a final comparison's `then` quotes. */
  firstTranscript: string | null;
  /** The task's listenFor list: an expression the model reports must be one of these. */
  expressionsListed: readonly string[];
  /** A `before` task or a final comparison; any other task has no goal card. */
  includeGoal: boolean;
  /** Seconds of the take that were analysed (null when unknown), and whether it was longer. */
  analysedSeconds: number | null;
  truncated: boolean;
};

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * First place `quote` occurs in `text` that does not overlap any of `taken`, or null. An
 * occurrence that is taken is skipped, not given up on: the same words said twice can
 * both be marked, once each.
 */
export function findQuoteSpan(text: string, quote: string, taken: readonly Span[] = []): Span | null {
  const q = quote.trim();
  if (q.length === 0 || q.length > QUOTE_MAX_LENGTH) return null;
  for (let from = text.indexOf(q); from !== -1; from = text.indexOf(q, from + 1)) {
    const span = { start: from, end: from + q.length };
    if (!taken.some((t) => overlaps(t, span))) return span;
  }
  return null;
}

function clamp(text: string): string {
  const t = text.trim();
  return t.length > TEXT_MAX_LENGTH ? `${t.slice(0, TEXT_MAX_LENGTH - 1).trimEnd()}…` : t;
}

export function validateAnalysis(raw: RawAnalysis, ctx: ValidateContext): StoredAnalysis {
  const dropped = { expressions: 0, highlights: 0, errors: 0, thenNow: 0 };

  const exprTaken: Span[] = [];
  const seenExpressions = new Set<string>();
  const expressionsUsed: StoredAnalysis["expressionsUsed"] = [];
  for (const e of raw.expressions_used) {
    const span = ctx.expressionsListed.includes(e.expression) && !seenExpressions.has(e.expression)
      ? findQuoteSpan(ctx.transcript, e.quote, exprTaken)
      : null;
    if (!span) {
      dropped.expressions++;
      continue;
    }
    seenExpressions.add(e.expression);
    exprTaken.push(span);
    expressionsUsed.push({ expression: e.expression, quote: e.quote.trim(), exact: e.exact, span });
  }

  const hlTaken: Span[] = [];
  const highlights: StoredAnalysis["highlights"] = [];
  let hesitations = 0;
  for (const h of raw.highlights) {
    const note = clamp(h.note);
    const tooMany = h.kind === "hesitation" && hesitations >= MAX_HESITATIONS;
    const span = note && !tooMany ? findQuoteSpan(ctx.transcript, h.quote, hlTaken) : null;
    if (!span) {
      dropped.highlights++;
      continue;
    }
    if (h.kind === "hesitation") hesitations++;
    hlTaken.push(span);
    highlights.push({ quote: h.quote.trim(), kind: h.kind, note, span });
  }

  const errTaken: Span[] = [];
  const errors: StoredAnalysis["errors"] = [];
  // Raw index -> kept index, so `main_error` still points at the same error.
  const keptIndex = new Map<number, number>();
  raw.errors.forEach((e, i) => {
    const correction = e.correction.trim();
    const explanation = clamp(e.explanation);
    // A "correction" equal to the quote corrects nothing.
    const usable = correction.length > 0 && correction !== e.quote.trim() && explanation.length > 0;
    const span = usable ? findQuoteSpan(ctx.transcript, e.quote, errTaken) : null;
    if (!span) {
      dropped.errors++;
      return;
    }
    errTaken.push(span);
    keptIndex.set(i, errors.length);
    errors.push({
      quote: e.quote.trim(),
      correction: clamp(correction),
      category: e.category,
      explanation,
      span,
    });
  });
  const mainError = raw.main_error === null ? null : (keptIndex.get(raw.main_error) ?? null);

  const thenNow: StoredAnalysis["thenNow"] = [];
  if ("then_now" in raw && ctx.kind === "final" && ctx.firstTranscript !== null) {
    const thenTaken: Span[] = [];
    const nowTaken: Span[] = [];
    for (const p of raw.then_now) {
      const note = clamp(p.note);
      const thenSpan = note ? findQuoteSpan(ctx.firstTranscript, p.then, thenTaken) : null;
      const nowSpan = thenSpan ? findQuoteSpan(ctx.transcript, p.now, nowTaken) : null;
      if (!thenSpan || !nowSpan) {
        dropped.thenNow++;
        continue;
      }
      thenTaken.push(thenSpan);
      nowTaken.push(nowSpan);
      thenNow.push({ then: p.then.trim(), now: p.now.trim(), note, thenSpan, nowSpan });
    }
  } else if ("then_now" in raw) {
    // A comparison the model made without a baseline to compare with: nothing to keep.
    dropped.thenNow += raw.then_now.length;
  }

  const goal = ctx.includeGoal ? clamp(raw.goal) : "";

  return {
    v: 1,
    kind: ctx.kind,
    summary: clamp(raw.summary),
    howItSounds: clamp(raw.how_it_sounds),
    goal: goal.length > 0 ? goal : null,
    expressionsUsed,
    highlights,
    errors,
    mainError,
    thenNow,
    counts: {
      errors: errors.length,
      highlights: highlights.length,
      hesitations,
      expressionsUsed: expressionsUsed.length,
      expressionsListed: ctx.expressionsListed.length,
      thenNow: thenNow.length,
    },
    coverage: { analysedSeconds: ctx.analysedSeconds, truncated: ctx.truncated },
    dropped,
  };
}
