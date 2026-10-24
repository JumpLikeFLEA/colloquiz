import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { monthsPeriod } from "./period";
import { SponsorReport } from "./reportDocument";
import { buildReportModel } from "./reportModel";
import { summarizePeriod } from "./summary";
import type { Expense, UsageRow } from "./types";

const usage = (over: Partial<UsageRow>): UsageRow => ({
  day: "2026-10-05", provider: "anthropic", feature: "voice_analysis", model: "claude-sonnet-5-5", outcome: "ok",
  calls: 2, unknownCalls: 0, inputTokens: 1_000_000, outputTokens: 100_000, cacheWriteTokens: 0, cacheReadTokens: 0, audioSeconds: 0, ...over,
});
const expense = (over: Partial<Expense>): Expense => ({
  id: "e", incurredOn: "2026-10-03", vendor: "Vendor", category: "hosting", kind: "bill", creditProvider: null,
  amountUsd: 10, periodStart: null, periodEnd: null, reference: "INV-1", note: null, ...over,
});

const period = monthsPeriod("2026-09", "2026-10")!;
const inputs = {
  period,
  usage: [usage({}), usage({ model: "mystery-1", calls: 3 })],
  expenses: [
    expense({ amountUsd: 20.5 }),
    expense({ id: "f", incurredOn: "2026-09-12", category: "ai", kind: "credit_topup", creditProvider: "anthropic", amountUsd: 50, vendor: "Привет Ltd" }),
    expense({ id: "g", incurredOn: "2026-12-01", amountUsd: 999 }),
  ],
  ledgerStart: "2026-10-01",
  generatedOn: "2026-10-24",
  pricesReadOn: "2026-10-24",
};

describe("buildReportModel", () => {
  const model = buildReportModel(inputs);

  it("uses the dashboard's own summary for its totals", () => {
    expect(model.summary).toEqual(summarizePeriod({ period, usage: inputs.usage, expenses: inputs.expenses }));
    expect(model.summary.paid.total).toBe(70.5);
  });

  it("splits the period into months whose paid totals add up to the period's", () => {
    expect(model.months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(model.months.map((m) => m.paid)).toEqual([50, 20.5]);
    expect(model.months.reduce((s, m) => s + m.paid, 0)).toBe(model.summary.paid.total);
    expect(model.categories).toEqual(["hosting", "ai"]);
  });

  it("lists an unpriced model apart and names rates only for models used", () => {
    expect(model.summary.usage.unpriced).toEqual([{ provider: "anthropic", model: "mystery-1", calls: 3 }]);
    expect(model.rates.map((r) => r.model)).toEqual(["claude-sonnet-5-5"]);
  });
});

describe("SponsorReport", () => {
  it("renders a PDF with Cyrillic text", async () => {
    const buf = await renderToBuffer(SponsorReport({ model: buildReportModel(inputs) }));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(20_000);
  });
});
