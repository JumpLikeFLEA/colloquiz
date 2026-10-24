/**
 * One paid provider call, as the ledger stores it (OPS-031, docs/decisions/0207, migration
 * 104). No user, take or import id: the ledger is not a record about a person (Decision 2).
 *
 * The pipelines build events and hand them to an injected RecordUsage, so the order and
 * the failure paths are tested with fakes; lib/costs/ledgerServer.ts is the real one.
 */

export type UsageProvider = "anthropic" | "assemblyai";
export type UsageFeature = "voice_analysis" | "course_import";

/** What the provider's `usage` reported, in the shape both Claude callers already store. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

/**
 * A call the model ran but whose answer was not usable (a refusal, a cut-off or unparsable
 * answer). Carried on the step error so the pipeline can still record it. `tokens` is null
 * when the SDK threw away the response, and its usage with it (0207 Decision 4).
 */
export type SpentCall = { model: string; tokens: TokenUsage | null };

export type UsageEvent = {
  provider: UsageProvider;
  feature: UsageFeature;
  model: string;
  step: string | null;
  /** Null on an AssemblyAI row, and on a Claude row whose usage is unknown. */
  tokens: TokenUsage | null;
  /** AssemblyAI only; null when the provider did not report a duration. */
  audioSeconds: number | null;
  outcome: "ok" | "failed";
};

export type RecordUsage = (event: UsageEvent) => Promise<void>;

export function claudeEvent(
  feature: UsageFeature,
  step: string,
  call: { model: string; tokens: TokenUsage | null },
  outcome: UsageEvent["outcome"],
): UsageEvent {
  return { provider: "anthropic", feature, model: call.model, step, tokens: call.tokens, audioSeconds: null, outcome };
}

export function tokensOf(usage: TokenUsage): TokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    cacheReadTokens: usage.cacheReadTokens,
  };
}

/**
 * Records an event and never throws: losing one ledger line is cheaper than failing a
 * learner's analysis or an author's import over it (0207 Decision 3).
 */
export async function recordSafely(record: RecordUsage, event: UsageEvent): Promise<void> {
  try {
    await record(event);
  } catch (e) {
    console.error(`usage ledger: ${event.feature}/${event.provider} not recorded:`, e instanceof Error ? e.message : e);
  }
}
