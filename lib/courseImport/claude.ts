import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { CallUsage, ImportAnswer, ImportClaude, ImportDocument } from "./claudeTypes";
import { ImportStepError, isTransientStatus } from "./errors";

/**
 * The drafting calls (CNT-018, docs/decisions/0203 Decisions 4-5), shaped like
 * lib/voice/analysis/claude.ts: the model is data (COURSE_IMPORT_MODEL), effort `high`, the
 * server-side refusal fallback, a stop reason that is a failure when it is not an end of turn.
 * Differences, all forced by the size of the work: the calls are streamed (a lesson is tens of
 * thousands of output tokens, which a plain request would time out on), and the answer is
 * the model's text, parsed and validated by the caller, because a lesson document is a union
 * of dozens of block shapes that the output schema format cannot hold.
 *
 * The file is uploaded once to the Files API and referenced by id in every call; the system
 * block is the same in every call and the document comes first in the user turn, with a cache
 * breakpoint after it, so the file is read from cache after the first call.
 *
 * The client is built on the first call, not on import: a route that imports this module must
 * still load when ANTHROPIC_API_KEY is absent (the mode is checked first, and `off` never
 * reaches here).
 */

export const DEFAULT_COURSE_IMPORT_MODEL = "claude-opus-5-5";

export function courseImportModel(env: Record<string, string | undefined> = process.env): string {
  return env.COURSE_IMPORT_MODEL?.trim() || DEFAULT_COURSE_IMPORT_MODEL;
}

const BETAS = ["files-api-2025-04-14", "server-side-fallback-2026-07-01"];

export function createImportClaude(options: {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
}): ImportClaude {
  let client: Anthropic | null = null;
  const getClient = () => {
    // A step is bounded by the 300 s function limit; one retry keeps a flaky connection from
    // eating the whole budget.
    client ??= new Anthropic({ apiKey: options.apiKey, fetch: options.fetchFn, maxRetries: 1, timeout: 280_000 });
    return client;
  };

  return {
    async uploadFile({ bytes, filename, mediaType }) {
      try {
        const file = await toFile(Buffer.from(bytes), filename, { type: mediaType });
        const meta = await getClient().beta.files.upload({ file, betas: ["files-api-2025-04-14"] });
        return meta.id;
      } catch (e) {
        throw classify(e);
      }
    },

    async deleteFile(fileId) {
      try {
        await getClient().beta.files.delete(fileId, { betas: ["files-api-2025-04-14"] });
        return true;
      } catch (e) {
        // Already gone counts as deleted: the sweep would only find the same 404.
        if (e instanceof Anthropic.NotFoundError) return true;
        console.error("course import: Anthropic file not deleted:", e instanceof Error ? e.message : e);
        return false;
      }
    },

    async converse({ system, document, turns, maxTokens }): Promise<ImportAnswer> {
      const model = options.model ?? courseImportModel();
      const messages = buildMessages(document, turns);

      let res;
      try {
        res = await getClient()
          .beta.messages.stream({
            model,
            max_tokens: maxTokens,
            betas: BETAS,
            // The "default" form is newer than this SDK's types (0.104.1 types the array form
            // only); the API accepts it (docs/decisions/0182 Decision 11, the voice analysis).
            // Drop the cast when the SDK catches up.
            fallbacks: "default" as unknown as undefined,
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            messages,
            output_config: { effort: "high" },
          })
          .finalMessage();
      } catch (e) {
        throw classify(e, document.kind === "file");
      }

      // Checked before the text is read: a refused or cut-off answer is a failure whatever
      // it contains, and saying it again would cost the same again.
      if (res.stop_reason === "refusal") throw new ImportStepError("Claude refused", "llm_refusal", false);
      if (res.stop_reason === "max_tokens") throw new ImportStepError("Claude answer cut off", "llm_max_tokens", false);

      const text = res.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");

      const u = res.usage;
      const usage: Omit<CallUsage, "step"> = {
        model: res.model,
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        effort: "high",
        stopReason: res.stop_reason,
        fallbackRan: (u as { iterations?: { type: string }[] }).iterations?.some((i) => i.type === "fallback_message") ?? false,
        ms: 0,
      };
      return { text, model: res.model, usage };
    },
  };
}

/** The document, with the cache breakpoint, leads the first user turn; every other turn is plain text. */
export function buildMessages(document: ImportDocument, turns: { role: "user" | "assistant"; text: string }[]): BetaMessageParam[] {
  return turns.map((turn, i): BetaMessageParam => {
    if (i === 0 && turn.role === "user") {
      const docBlock: BetaContentBlockParam =
        document.kind === "file"
          ? { type: "document", source: { type: "file", file_id: document.fileId }, cache_control: { type: "ephemeral" } }
          : {
              type: "document",
              source: { type: "text", media_type: "text/plain", data: document.text },
              cache_control: { type: "ephemeral" },
            };
      return { role: "user", content: [docBlock, { type: "text", text: turn.text }] };
    }
    return { role: turn.role, content: turn.text };
  });
}

function classify(e: unknown, fileInvolved = false): ImportStepError {
  if (e instanceof ImportStepError) return e;
  if (e instanceof Anthropic.APIConnectionError) return new ImportStepError("Claude connection failed", "llm_network", true);
  if (fileInvolved && e instanceof Anthropic.NotFoundError) return new ImportStepError("Claude file not found", "file_expired", false);
  if (e instanceof Anthropic.APIError) {
    // The SDK already retried 429 and 5xx before throwing.
    const status = e.status;
    return new ImportStepError("Claude request failed", status ? `llm_http_${status}` : "llm_http", status === undefined || isTransientStatus(status));
  }
  return new ImportStepError("Claude call failed", "llm_unknown", true);
}
