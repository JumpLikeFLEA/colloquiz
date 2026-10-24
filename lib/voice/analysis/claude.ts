import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { TokenUsage } from "../../costs/usageEvent";
import { AnalysisStepError, isTransientStatus } from "./errors";
import {
  FinalAnalysisSchema,
  FirstAnalysisSchema,
  type RawAnalysis,
  type VoiceAnalysisInstruction,
} from "./schema";

/**
 * The analysis call (VOICE-012, docs/decisions/0156 "Claude output", 0182). Shaped by what
 * VOICE-009 measured: `messages.parse` with a Zod output format, the instruction as a cached
 * system block, the transcript as data in the user message, effort `high` (Decision 4: `low`
 * made five times the doubtful corrections), and the server-side refusal fallback.
 *
 * The client is built on the first call, not on import: a route that imports this module
 * must still load when ANTHROPIC_API_KEY is absent (the pipeline checks the mode first, and
 * `off` never reaches here).
 */

export const DEFAULT_VOICE_ANALYSIS_MODEL = "claude-sonnet-5-5";

/**
 * VOICE_ANALYSIS_MODEL is the card's name for it; ANTHROPIC_MODEL_VOICE is the one 0182
 * Decision 9 told the owner to set, so it is read too. Either way the model is data, not a
 * constant: a retired model id is a changed variable, not a deploy.
 */
export function voiceAnalysisModel(env: Record<string, string | undefined> = process.env): string {
  return env.VOICE_ANALYSIS_MODEL?.trim() || env.ANTHROPIC_MODEL_VOICE?.trim() || DEFAULT_VOICE_ANALYSIS_MODEL;
}

/** Stored in voice_analyses.usage. Tokens only; what they cost is a calculation, not a fact. */
export type ClaudeUsage = TokenUsage & {
  effort: "high";
  stopReason: string | null;
  /** The server-side fallback model answered instead of the one asked for. */
  fallbackRan: boolean;
};

export type ClaudeAnalysis = { raw: RawAnalysis; model: string; usage: ClaudeUsage };

export type ClaudeAnalyser = {
  analyse(input: { kind: VoiceAnalysisInstruction; system: string; user: string }): Promise<ClaudeAnalysis>;
};

// A cut-off answer is cut off; 0182 measured at most 2,501 output tokens (600 s take).
const MAX_TOKENS = 8000;

export function createClaudeAnalyser(options: {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
}): ClaudeAnalyser {
  let client: Anthropic | null = null;
  const getClient = () => {
    client ??= new Anthropic({ apiKey: options.apiKey, fetch: options.fetchFn });
    return client;
  };

  return {
    async analyse({ kind, system, user }) {
      const model = options.model ?? voiceAnalysisModel();
      const schema = kind === "first" ? FirstAnalysisSchema : FinalAnalysisSchema;

      let res;
      try {
        res = await getClient().beta.messages.parse({
          model,
          max_tokens: MAX_TOKENS,
          // The "default" form is newer than this SDK's types (0.104.1 types the array form
          // only); the API accepted it on all 32 bench calls (0182 Decision 11). Drop the
          // cast when the SDK catches up.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as unknown as undefined,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
          output_config: { effort: "high", format: betaZodOutputFormat(schema) },
        });
      } catch (e) {
        // `parse` throws, rather than returning, when the text it was handed is not the
        // schema's JSON: a cut-off answer, an answer that breaks the schema, and a refusal
        // that came with words all land here (probed on SDK 0.104.1 with canned responses;
        // a refusal with no content is the one that returns, below). The stop reason is
        // lost, so all of them are `llm_unparsable`. None is retried: the same input would
        // fail the same way, and a retry per status poll would be a cost loop.
        if (e instanceof Anthropic.APIConnectionError) {
          throw new AnalysisStepError("Claude connection failed", "llm_network", true);
        }
        if (e instanceof Anthropic.APIError) {
          // The SDK already retried 429 and 5xx before throwing.
          const status = e.status;
          throw new AnalysisStepError(
            "Claude request failed",
            status ? `llm_http_${status}` : "llm_http",
            status === undefined || isTransientStatus(status),
          );
        }
        if (e instanceof Error && e.message.startsWith("Failed to parse structured output")) {
          // The model ran, but `parse` dropped the response and its usage with it: the ledger
          // records a call of unknown size (0207 Decision 4).
          throw new AnalysisStepError("Claude answer was not the schema's JSON", "llm_unparsable", false, {
            model,
            tokens: null,
          });
        }
        throw new AnalysisStepError("Claude call failed", "llm_unknown", true);
      }

      const u = res.usage;
      const tokens: TokenUsage = {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
      };
      // The send goes back to the learner for these (voice_analysis_fail); the call was paid
      // for all the same, so its usage travels on the error to the ledger.
      const spent = { model: res.model, tokens };
      if (res.stop_reason === "refusal") throw new AnalysisStepError("Claude refused", "llm_refusal", false, spent);
      if (res.stop_reason === "max_tokens") throw new AnalysisStepError("Claude answer cut off", "llm_max_tokens", false, spent);
      if (!res.parsed_output) throw new AnalysisStepError("Claude answer did not match the schema", "llm_unparsable", false, spent);

      return {
        raw: res.parsed_output as RawAnalysis,
        model: res.model,
        usage: {
          ...tokens,
          effort: "high",
          stopReason: res.stop_reason,
          fallbackRan: (u as { iterations?: { type: string }[] }).iterations?.some((i) => i.type === "fallback_message") ?? false,
        },
      };
    },
  };
}
