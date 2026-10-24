import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordUsage } from "./usageEvent";

/**
 * The real RecordUsage (OPS-031): record_provider_usage (104), which only the service role
 * may call. Both pipelines already hold a service-role client, and pass it in.
 */
export function createUsageRecorder(admin: SupabaseClient): RecordUsage {
  return async (event) => {
    const { error } = await admin.rpc("record_provider_usage", {
      p_provider: event.provider,
      p_feature: event.feature,
      p_model: event.model,
      p_step: event.step,
      p_input_tokens: event.tokens?.inputTokens ?? null,
      p_output_tokens: event.tokens?.outputTokens ?? null,
      p_cache_write_tokens: event.tokens?.cacheWriteTokens ?? null,
      p_cache_read_tokens: event.tokens?.cacheReadTokens ?? null,
      p_audio_seconds: event.audioSeconds,
      p_outcome: event.outcome,
    });
    if (error) throw new Error(`record_provider_usage: ${error.message}`);
  };
}
