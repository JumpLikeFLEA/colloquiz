import type { UsageProvider } from "./usageEvent";

/**
 * List prices in USD (OPS-032, docs/decisions/0207 Decisions 6 and 10), read on 2026-10-24
 * from https://platform.claude.com/docs/en/about-claude/pricing and
 * https://www.assemblyai.com/pricing.
 *
 * A model has one entry per price change, each with the first UTC day it applies to. A day
 * before a model's first entry gets that first entry: these are the earliest prices on record
 * here, not a claim about what the provider charged before them. Add an entry when a price
 * changes; never edit an old one, or past months change.
 *
 * Both Claude pipelines cache with the default 5-minute TTL, so a cache write is priced at the
 * 5-minute rate. A model missing from this table is unpriced, never $0 (Decision 6).
 */

/** USD per million tokens. */
export type TokenRate = {
  kind: "tokens";
  effectiveFrom: string;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
};

export type AudioRate = { kind: "audio"; effectiveFrom: string; perHour: number };

export type Rate = TokenRate | AudioRate;

export const PRICES_READ_ON = "2026-10-24";

export const PRICES: Record<UsageProvider, Record<string, Rate[]>> = {
  anthropic: {
    "claude-opus-5-5": [
      { kind: "tokens", effectiveFrom: "2026-10-24", input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
    ],
    "claude-sonnet-5-5": [
      { kind: "tokens", effectiveFrom: "2026-10-24", input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
    ],
  },
  assemblyai: {
    "universal-3-5-pro": [{ kind: "audio", effectiveFrom: "2026-10-24", perHour: 0.21 }],
  },
};

/** The rate in force on `day` (YYYY-MM-DD), or null for a model the table does not know. */
export function rateFor(provider: UsageProvider, model: string, day: string): Rate | null {
  const entries = PRICES[provider]?.[model];
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let rate = sorted[0];
  for (const entry of sorted) if (entry.effectiveFrom <= day) rate = entry;
  return rate;
}
