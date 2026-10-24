import { rateFor } from "./prices";
import type { UsageRow } from "./types";

/**
 * What one usage row cost at list price (OPS-032, docs/decisions/0207 Decision 6). `usd` is
 * null when the model has no price, so the caller shows it as unpriced instead of adding $0.
 */
export function priceRow(row: UsageRow): number | null {
  const rate = rateFor(row.provider, row.model, row.day);
  if (rate === null) return null;
  if (rate.kind === "audio") {
    return row.provider === "assemblyai" ? (row.audioSeconds / 3600) * rate.perHour : null;
  }
  return (
    (row.inputTokens * rate.input +
      row.cacheWriteTokens * rate.cacheWrite +
      row.cacheReadTokens * rate.cacheRead +
      row.outputTokens * rate.output) /
    1_000_000
  );
}
