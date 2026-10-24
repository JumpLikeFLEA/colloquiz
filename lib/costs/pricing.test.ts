import { describe, expect, it } from "vitest";
import { PRICES, rateFor } from "./prices";
import { priceRow } from "./pricing";
import type { UsageRow } from "./types";

const row = (over: Partial<UsageRow>): UsageRow => ({
  day: "2026-10-24",
  provider: "anthropic",
  feature: "voice_analysis",
  model: "claude-sonnet-5-5",
  outcome: "ok",
  calls: 1,
  unknownCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  audioSeconds: 0,
  ...over,
});

describe("rateFor", () => {
  it("knows the two Claude models and the STT model the pipelines use", () => {
    expect(rateFor("anthropic", "claude-sonnet-5-5", "2026-10-24")).toMatchObject({ input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 });
    expect(rateFor("anthropic", "claude-opus-5-5", "2026-10-24")).toMatchObject({ input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 });
    expect(rateFor("assemblyai", "universal-3-5-pro", "2026-10-24")).toMatchObject({ perHour: 0.21 });
  });

  it("an unknown model has no rate", () => {
    expect(rateFor("anthropic", "claude-opus-5", "2026-10-24")).toBeNull();
    expect(rateFor("assemblyai", "claude-opus-5-5", "2026-10-24")).toBeNull();
  });

  it("a day before the first entry gets the first entry; a later entry takes over from its own day", () => {
    const saved = PRICES.anthropic["claude-sonnet-5-5"];
    PRICES.anthropic["claude-sonnet-5-5"] = [
      { kind: "tokens", effectiveFrom: "2026-11-01", input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
      saved[0],
    ];
    try {
      expect(rateFor("anthropic", "claude-sonnet-5-5", "2026-01-01")).toMatchObject({ input: 2 });
      expect(rateFor("anthropic", "claude-sonnet-5-5", "2026-10-31")).toMatchObject({ input: 2 });
      expect(rateFor("anthropic", "claude-sonnet-5-5", "2026-11-01")).toMatchObject({ input: 3 });
    } finally {
      PRICES.anthropic["claude-sonnet-5-5"] = saved;
    }
  });
});

describe("priceRow", () => {
  it("prices each token class at its own rate", () => {
    // 1M of each class on Sonnet 5.5: 2 + 2.5 + 0.1 + 10.
    const usd = priceRow(row({ inputTokens: 1e6, cacheWriteTokens: 1e6, cacheReadTokens: 1e6, outputTokens: 1e6 }));
    expect(usd).toBeCloseTo(14.6, 10);
  });

  it("a take-sized call adds its classes up: 3k input, 2k cache write, 1k output", () => {
    const usd = priceRow(row({ inputTokens: 3000, cacheWriteTokens: 2000, outputTokens: 1000 }))!;
    expect(usd).toBeCloseTo(0.006 + 0.005 + 0.01, 10);
  });

  it("prices audio by the hour", () => {
    expect(priceRow(row({ provider: "assemblyai", model: "universal-3-5-pro", audioSeconds: 3600 }))).toBeCloseTo(0.21, 10);
    expect(priceRow(row({ provider: "assemblyai", model: "universal-3-5-pro", audioSeconds: 60 }))).toBeCloseTo(0.0035, 10);
  });

  it("an unknown model is null, never 0", () => {
    expect(priceRow(row({ model: "claude-opus-5", inputTokens: 1000 }))).toBeNull();
  });

  it("a row with no tokens is a real $0, not null", () => {
    expect(priceRow(row({}))).toBe(0);
  });
});
