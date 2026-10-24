import { describe, expect, it } from "vitest";
import { estimateCredit } from "./balance";
import type { Expense, UsageRow } from "./types";

const topup = (over: Partial<Expense>): Expense => ({
  id: "t",
  incurredOn: "2026-10-01",
  vendor: "Anthropic",
  category: "ai",
  kind: "credit_topup",
  creditProvider: "anthropic",
  amountUsd: 25,
  periodStart: null,
  periodEnd: null,
  reference: null,
  note: null,
  ...over,
});

const usage = (over: Partial<UsageRow>): UsageRow => ({
  day: "2026-10-05",
  provider: "anthropic",
  feature: "voice_analysis",
  model: "claude-sonnet-5-5",
  outcome: "ok",
  calls: 1,
  unknownCalls: 0,
  inputTokens: 1e6, // $2
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  audioSeconds: 0,
  ...over,
});

describe("estimateCredit", () => {
  it("is every top-up minus the priced usage since the first one", () => {
    const [e] = estimateCredit({
      expenses: [topup({}), topup({ id: "t2", incurredOn: "2026-10-15", amountUsd: 10 })],
      usage: [usage({}), usage({ day: "2026-09-30" }), usage({ day: "2026-10-20" })],
      ledgerStart: "2026-09-01",
    });
    expect(e).toMatchObject({ provider: "anthropic", toppedUp: 35, since: "2026-10-01", caveats: [] });
    expect(e.used).toBeCloseTo(4, 10);
    expect(e.left).toBeCloseTo(31, 10);
  });

  it("a provider with no top-up gets no estimate; a bill is not a top-up", () => {
    const out = estimateCredit({
      expenses: [topup({ kind: "bill", creditProvider: null })],
      usage: [usage({})],
      ledgerStart: "2026-09-01",
    });
    expect(out).toEqual([]);
  });

  it("each provider is subtracted only its own usage", () => {
    const out = estimateCredit({
      expenses: [topup({ creditProvider: "assemblyai", vendor: "AssemblyAI", amountUsd: 5 })],
      usage: [usage({}), usage({ provider: "assemblyai", model: "universal-3-5-pro", inputTokens: 0, audioSeconds: 3600 })],
      ledgerStart: "2026-09-01",
    });
    expect(out.map((e) => e.provider)).toEqual(["assemblyai"]);
    expect(out[0].left).toBeCloseTo(4.79, 10);
  });

  it("says so when it errs high: a ledger younger than the top-up, unpriced or unknown usage", () => {
    const [late] = estimateCredit({ expenses: [topup({})], usage: [], ledgerStart: "2026-10-10" });
    expect(late.caveats).toEqual(["ledger_started_after_topup"]);
    const [empty] = estimateCredit({ expenses: [topup({})], usage: [], ledgerStart: null });
    expect(empty.caveats).toEqual(["ledger_started_after_topup"]);
    const [unpriced] = estimateCredit({ expenses: [topup({})], usage: [usage({ model: "claude-opus-5" })], ledgerStart: "2026-09-01" });
    expect(unpriced.caveats).toEqual(["unpriced_usage"]);
    const [unknown] = estimateCredit({ expenses: [topup({})], usage: [usage({ unknownCalls: 1 })], ledgerStart: "2026-09-01" });
    expect(unknown.caveats).toEqual(["unpriced_usage"]);
  });
});
