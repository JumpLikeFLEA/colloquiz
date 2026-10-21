import { z } from "zod";

/**
 * The shape Claude is asked to return, and the shape we store (VOICE-012,
 * docs/decisions/0156 "Claude output", 0182). Two layers:
 *
 * - `FirstAnalysisSchema` / `FinalAnalysisSchema` are the MODEL's output, handed to
 *   `messages.parse` as the output format. Nothing in them is trusted.
 * - `StoredAnalysis` is what validate.ts builds from it and what lands in
 *   voice_analyses.result: only quotes found verbatim, each with its offsets, and every
 *   count computed by us (the model has no field for a count).
 *
 * The fields mirror prompts/voice-analysis/{first,final}-v0.md; change one, change both
 * and bump VOICE_ANALYSIS_PROMPT_VERSION.
 */

/** Stored in voice_analyses.prompt_version as `<instruction>-<this>`. VOICE-013 ships v1. */
export const VOICE_ANALYSIS_PROMPT_VERSION = "v0";

export const VOICE_ANALYSIS_INSTRUCTIONS = ["first", "final"] as const;
export type VoiceAnalysisInstruction = (typeof VOICE_ANALYSIS_INSTRUCTIONS)[number];

/** What a learner's take is analysed against: the first 180 s only (0182 Decision 5). */
export const VOICE_ANALYSIS_MAX_SECONDS = 180;

export const HIGHLIGHT_KINDS = ["strength", "self_correction", "hesitation"] as const;
export const ERROR_CATEGORIES = ["grammar", "vocabulary", "word_order", "collocation", "other"] as const;

const Quote = z.string().describe("Copied character for character from the transcript");

const base = {
  summary: z.string(),
  expressions_used: z.array(z.object({ expression: z.string(), quote: Quote, exact: z.boolean() })),
  highlights: z.array(z.object({ quote: Quote, kind: z.enum(HIGHLIGHT_KINDS), note: z.string() })),
  errors: z.array(
    z.object({
      quote: Quote,
      correction: z.string(),
      category: z.enum(ERROR_CATEGORIES),
      explanation: z.string(),
    }),
  ),
  main_error: z.number().int().nullable(),
  how_it_sounds: z.string(),
  goal: z.string(),
};

export const FirstAnalysisSchema = z.object(base);
export const FinalAnalysisSchema = z.object({
  ...base,
  then_now: z.array(z.object({ then: z.string(), now: z.string(), note: z.string() })),
});

export type RawFirstAnalysis = z.infer<typeof FirstAnalysisSchema>;
export type RawFinalAnalysis = z.infer<typeof FinalAnalysisSchema>;
export type RawAnalysis = RawFirstAnalysis | RawFinalAnalysis;

/** Character offsets into the transcript the analysis was made on (UTF-16 units, end exclusive). */
export type Span = { start: number; end: number };

export type StoredAnalysis = {
  v: 1;
  kind: VoiceAnalysisInstruction;
  summary: string;
  howItSounds: string;
  /** Only a `before` task or a final comparison carries a goal (0156 Decision 10). */
  goal: string | null;
  expressionsUsed: { expression: string; quote: string; exact: boolean; span: Span }[];
  highlights: { quote: string; kind: (typeof HIGHLIGHT_KINDS)[number]; note: string; span: Span }[];
  errors: {
    quote: string;
    correction: string;
    category: (typeof ERROR_CATEGORIES)[number];
    explanation: string;
    span: Span;
  }[];
  /** Index into `errors` after dropping, or null. */
  mainError: number | null;
  /** `thenSpan` is an offset into the BASELINE take's transcript, not this one. */
  thenNow: { then: string; now: string; note: string; thenSpan: Span; nowSpan: Span }[];
  /** Computed from the kept items, never taken from the model. */
  counts: {
    errors: number;
    highlights: number;
    hesitations: number;
    expressionsUsed: number;
    expressionsListed: number;
    thenNow: number;
  };
  /** How much of the take the analysis covered. `truncated`: the take was longer. */
  coverage: { analysedSeconds: number | null; truncated: boolean };
  /** What validation threw away, so a model that starts inventing quotes shows in the data. */
  dropped: { expressions: number; highlights: number; errors: number; thenNow: number };
};
