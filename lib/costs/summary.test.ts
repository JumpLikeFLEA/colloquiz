import { describe, expect, it } from "vitest";
import { summarizePeriod } from "./summary";
import type { Expense, UsageRow } from "./types";

const OCT = { from: "2026-10-01", to: "2026-11-01" };

const usage = (over: Partial<UsageRow>): UsageRow => ({
  day: "2026-10-05",
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

const expense = (over: Partial<Expense>): Expense => ({
  id: "e",
  incurredOn: "2026-10-03",
  vendor: "Vendor",
  category: "hosting",
  kind: "bill",
  creditProvider: null,
  amountUsd: 10,
  periodStart: null,
  periodEnd: null,
  reference: null,
  note: null,
  ...over,
});

describe("summarizePeriod: paid", () => {
  it("adds bills and top-ups in the period, and only those", () => {
    const s = summarizePeriod({
      period: OCT,
      usage: [],
      expenses: [
        expense({ id: "1", amountUsd: 20, category: "hosting" }),
        expense({ id: "2", amountUsd: 25, kind: "credit_topup", creditProvider: "anthropic", category: "ai", incurredOn: "2026-10-10" }),
        expense({ id: "3", amountUsd: 999, incurredOn: "2026-11-01" }),
        expense({ id: "4", amountUsd: 999, incurredOn: "2026-09-30" }),
      ],
    });
    expect(s.paid).toMatchObject({ total: 45, bills: 20, topups: 25 });
    expect(s.paid.expenses.map((e) => e.id)).toEqual(["1", "2"]);
    expect(s.paid.byCategory).toEqual([
      { category: "ai", usd: 25 },
      { category: "hosting", usd: 20 },
    ]);
  });
});

describe("summarizePeriod: used", () => {
  const rows = [
    usage({ inputTokens: 1e6 }), // $2
    usage({ outcome: "failed", calls: 2, unknownCalls: 1, outputTokens: 1e5 }), // $1
    usage({ provider: "assemblyai", model: "universal-3-5-pro", calls: 3, audioSeconds: 3600 }), // $0.21
    usage({ feature: "course_import", model: "claude-opus-5-5", day: "2026-10-20", outputTokens: 1e6 }), // $20
    usage({ model: "claude-opus-5", calls: 4, inputTokens: 1e6 }), // unpriced
    usage({ day: "2026-11-02", inputTokens: 1e9 }), // outside
  ];
  const s = summarizePeriod({ period: OCT, usage: rows, expenses: [] });

  it("prices what it knows and counts every call", () => {
    expect(s.usage.usd).toBeCloseTo(23.21, 10);
    expect(s.usage.calls).toBe(11);
    expect(s.usage.unknownCalls).toBe(1);
  });

  it("lists an unknown model as unpriced instead of adding $0", () => {
    expect(s.usage.unpriced).toEqual([{ provider: "anthropic", model: "claude-opus-5", calls: 4 }]);
  });

  it("splits by feature: model calls, failures, transcripts and the cost per model call", () => {
    const voice = s.usage.byFeature.find((f) => f.feature === "voice_analysis")!;
    expect(voice).toMatchObject({ modelCalls: 7, failedCalls: 2, transcripts: 3 });
    expect(voice.usd).toBeCloseTo(3.21, 10);
    expect(voice.perModelCall).toBeCloseTo(3.21 / 7, 10);
    expect(s.usage.byFeature[0].feature).toBe("course_import");
  });

  it("splits by provider", () => {
    expect(s.usage.byProvider.find((p) => p.provider === "assemblyai")).toMatchObject({ calls: 3 });
    expect(s.usage.byProvider.find((p) => p.provider === "assemblyai")!.usd).toBeCloseTo(0.21, 10);
  });

  it("has one zero-filled entry per day of the month", () => {
    expect(s.usage.daily.length).toBe(31);
    expect(s.usage.daily.find((d) => d.day === "2026-10-05")!.usd).toBeCloseTo(3.21, 10);
    expect(s.usage.daily.find((d) => d.day === "2026-10-20")!.usd).toBeCloseTo(20, 10);
    expect(s.usage.daily.find((d) => d.day === "2026-10-06")!.usd).toBe(0);
  });

  it("never adds usage into what was paid", () => {
    expect(s.paid.total).toBe(0);
  });
});
