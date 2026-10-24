import { daysIn, type Period } from "./period";
import { priceRow } from "./pricing";
import type { Expense, ExpenseCategory, UsageRow } from "./types";
import type { UsageFeature, UsageProvider } from "./usageEvent";

/**
 * One period's figures for the dashboard and the sponsor report (OPS-032, docs/decisions/0207
 * Decision 9): what was PAID (bills and credit top-ups entered by an admin) and, beside it,
 * what the app USED at list price (the ledger). The two are never added together: most usage
 * was paid for in advance by a top-up.
 */

export type UnpricedModel = { provider: UsageProvider; model: string; calls: number };

export type FeatureUsage = {
  feature: UsageFeature;
  usd: number;
  /** Claude calls, failed ones included. */
  modelCalls: number;
  failedCalls: number;
  /** AssemblyAI transcripts. */
  transcripts: number;
  /** usd / modelCalls, or null with no call. */
  perModelCall: number | null;
};

export type PeriodSummary = Period & {
  paid: {
    total: number;
    bills: number;
    topups: number;
    byCategory: { category: ExpenseCategory; usd: number }[];
    /** The period's expenses, oldest first. */
    expenses: Expense[];
  };
  usage: {
    /** Priced usage only. */
    usd: number;
    calls: number;
    /** Claude calls whose usage is unknown: counted, not priced (0207 Decision 4). */
    unknownCalls: number;
    unpriced: UnpricedModel[];
    byProvider: { provider: UsageProvider; usd: number; calls: number }[];
    byFeature: FeatureUsage[];
    /** Every day of the period, zero-filled. */
    daily: { day: string; usd: number }[];
  };
};

export function summarizePeriod(input: { period: Period; usage: UsageRow[]; expenses: Expense[] }): PeriodSummary {
  const { period } = input;
  const inPeriod = (day: string) => day >= period.from && day < period.to;

  // ── Paid ──
  const expenses = input.expenses
    .filter((e) => inPeriod(e.incurredOn))
    .sort((a, b) => a.incurredOn.localeCompare(b.incurredOn) || a.vendor.localeCompare(b.vendor));
  const byCategory = new Map<ExpenseCategory, number>();
  let bills = 0;
  let topups = 0;
  for (const e of expenses) {
    if (e.kind === "bill") bills += e.amountUsd;
    else topups += e.amountUsd;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountUsd);
  }

  // ── Used ──
  const daily = new Map(daysIn(period).map((d) => [d, 0]));
  const byProvider = new Map<UsageProvider, { usd: number; calls: number }>();
  const byFeature = new Map<UsageFeature, FeatureUsage>();
  const unpriced = new Map<string, UnpricedModel>();
  let usd = 0;
  let calls = 0;
  let unknownCalls = 0;

  for (const row of input.usage) {
    if (!inPeriod(row.day)) continue;
    calls += row.calls;
    unknownCalls += row.unknownCalls;

    const feature = byFeature.get(row.feature) ?? {
      feature: row.feature,
      usd: 0,
      modelCalls: 0,
      failedCalls: 0,
      transcripts: 0,
      perModelCall: null,
    };
    if (row.provider === "anthropic") {
      feature.modelCalls += row.calls;
      if (row.outcome === "failed") feature.failedCalls += row.calls;
    } else {
      feature.transcripts += row.calls;
    }
    byFeature.set(row.feature, feature);

    const provider = byProvider.get(row.provider) ?? { usd: 0, calls: 0 };
    provider.calls += row.calls;
    byProvider.set(row.provider, provider);

    const cost = priceRow(row);
    if (cost === null) {
      const key = `${row.provider}:${row.model}`;
      const entry = unpriced.get(key) ?? { provider: row.provider, model: row.model, calls: 0 };
      entry.calls += row.calls;
      unpriced.set(key, entry);
      continue;
    }
    usd += cost;
    feature.usd += cost;
    provider.usd += cost;
    daily.set(row.day, (daily.get(row.day) ?? 0) + cost);
  }

  for (const f of byFeature.values()) f.perModelCall = f.modelCalls > 0 ? f.usd / f.modelCalls : null;

  return {
    ...period,
    paid: {
      total: bills + topups,
      bills,
      topups,
      byCategory: [...byCategory].map(([category, v]) => ({ category, usd: v })).sort((a, b) => b.usd - a.usd),
      expenses,
    },
    usage: {
      usd,
      calls,
      unknownCalls,
      unpriced: [...unpriced.values()].sort((a, b) => b.calls - a.calls),
      byProvider: [...byProvider].map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.usd - a.usd),
      byFeature: [...byFeature.values()].sort((a, b) => b.usd - a.usd),
      daily: [...daily].map(([day, v]) => ({ day, usd: v })),
    },
  };
}
