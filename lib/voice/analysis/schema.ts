import { z } from "zod";

/**
 * The shape Claude is asked to return, and the shape we store (VOICE-012,
 * docs/decisions/0156 "Claude output", 0182). Two layers:
 *
 * - `FirstAnalysisSchema` / `FinalAnalysisSchema` / `InterimAnalysisSchema` are the MODEL's output, handed to
 *   `messages.parse` as the output format. Nothing in them is trusted.
 * - `StoredAnalysis` is what validate.ts builds from it and what lands in
 *   voice_analyses.result: only quotes found verbatim, each with its offsets, and every
 *   count computed by us (the model has no field for a count).
 *
 * The fields mirror prompts/voice-analysis/{first,final,interim}-<version>.md (instructions.ts says
 * which version is live); change a field and the instruction together, and ship the pair as a
 * new version file.
 */

export const VOICE_ANALYSIS_INSTRUCTIONS = ["first", "final", "interim"] as const;
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
};

export const GOAL_REACHED_STATUSES = ["reached", "partly", "not_yet"] as const;

export const FirstAnalysisSchema = z.object({ ...base, goal: z.string() });
/**
 * The final comparison has no `goal`: the goal was set by the first take (VOICE-013). It
 * answers that goal instead (`goal_reached`, null when no first goal was given to it) and
 * names one thing to keep doing (`next_step`).
 */
export const FinalAnalysisSchema = z.object({
  ...base,
  then_now: z.array(z.object({ then: z.string(), now: z.string(), note: z.string() })),
  goal_reached: z.object({ status: z.enum(GOAL_REACHED_STATUSES), note: z.string() }).nullable(),
  next_step: z.string(),
});

/**
 * The end of a free first lesson (VOICE-017, docs/decisions/0229): a final's comparison fields,
 * plus up to two links from this take to later lessons (`lesson` is a number from the outline
 * the request carried). No `goal`: nothing judges an interim `next_step` until final-v2. The
 * limit of two is the instruction's and validate.ts's, not a `maxItems` here: structured
 * outputs do not take one, and the validator drops the rest either way.
 */
export const InterimAnalysisSchema = z.object({
  ...base,
  then_now: z.array(z.object({ then: z.string(), now: z.string(), note: z.string() })),
  goal_reached: z.object({ status: z.enum(GOAL_REACHED_STATUSES), note: z.string() }).nullable(),
  course_links: z.array(z.object({ lesson: z.number().int(), quote: Quote, note: z.string() })),
  next_step: z.string(),
});

export type RawFirstAnalysis = z.infer<typeof FirstAnalysisSchema>;
export type RawFinalAnalysis = z.infer<typeof FinalAnalysisSchema>;
export type RawInterimAnalysis = z.infer<typeof InterimAnalysisSchema>;
export type RawAnalysis = RawFirstAnalysis | RawFinalAnalysis | RawInterimAnalysis;

/** One later lesson the course outline offers an interim analysis (outline.ts). */
export type OutlineLesson = {
  /** The number the course page shows for it (docs/decisions/0229 Decision 19). */
  number: number;
  lessonId: string;
  title: string;
  about: string | null;
  expressions: string[];
};

/** Max links an interim analysis keeps (0229 Decision 11). */
export const MAX_COURSE_LINKS = 2;

/** What a final comparison is told about the first analysis it follows (VOICE-013). */
export type FirstAnalysisContext = {
  goal: string | null;
  mainError: { quote: string; correction: string; explanation: string } | null;
};

/** Character offsets into the transcript the analysis was made on (UTF-16 units, end exclusive). */
export type Span = { start: number; end: number };

export type StoredAnalysis = {
  v: 1;
  kind: VoiceAnalysisInstruction;
  summary: string;
  howItSounds: string;
  /** Only a `before` task carries a goal card (0156 Decision 10); every other analysis has null. */
  goal: string | null;
  /** Final and interim: how the goal the first analysis set went. Null with no first goal to judge. */
  goalReached: { status: (typeof GOAL_REACHED_STATUSES)[number]; note: string } | null;
  /** Final and interim: one thing to keep doing. Null for a first analysis. */
  nextStep: string | null;
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
  /**
   * Interim only (empty otherwise): links to later lessons, stored with the lesson's id so a
   * later reorder or rename cannot point one at the wrong lesson (0229 Decision 18). `lesson`
   * is the number the outline gave it, kept so a lesson that is gone still reads "Lesson N".
   * `span` is into this take's transcript.
   */
  courseLinks: { lessonId: string; lesson: number; quote: string; span: Span; note: string }[];
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
  dropped: { expressions: number; highlights: number; errors: number; thenNow: number; courseLinks: number };
};
