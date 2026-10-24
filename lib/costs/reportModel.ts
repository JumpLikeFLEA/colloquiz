import { monthPeriod, monthsIn, type Period } from "./period";
import { PRICES } from "./prices";
import { summarizePeriod, type PeriodSummary } from "./summary";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type UsageRow } from "./types";

/**
 * What the sponsor report prints (OPS-033, docs/decisions/0207 Decision 8), built from the same
 * summarizePeriod() the dashboard reads, so the PDF's totals are the page's totals. Pure: the
 * PDF layout (reportDocument.tsx) only draws this. No per-user row exists to leak: the ledger
 * carries no user (Decision 2).
 */

export type ReportMonth = {
  month: string;
  byCategory: Record<ExpenseCategory, number>;
  paid: number;
  usedUsd: number;
};

export type ReportModel = {
  period: Period;
  generatedOn: string;
  pricesReadOn: string;
  ledgerStart: string | null;
  summary: PeriodSummary;
  months: ReportMonth[];
  /** Categories with a non-zero total in the period, in the page's order. */
  categories: ExpenseCategory[];
  /** The list prices behind the usage estimate, for the models the period used. */
  rates: { provider: string; model: string; text: string }[];
};

export function buildReportModel(input: {
  period: Period;
  usage: UsageRow[];
  expenses: Expense[];
  ledgerStart: string | null;
  generatedOn: string;
  pricesReadOn: string;
}): ReportModel {
  const { period } = input;
  const summary = summarizePeriod({ period, usage: input.usage, expenses: input.expenses });

  const months: ReportMonth[] = monthsIn(period).map((month) => {
    const p = monthPeriod(month)!;
    const s = summarizePeriod({ period: p, usage: input.usage, expenses: input.expenses });
    const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
    for (const c of s.paid.byCategory) byCategory[c.category] = c.usd;
    return { month, byCategory, paid: s.paid.total, usedUsd: s.usage.usd };
  });

  const used = new Set(input.usage.filter((r) => r.day >= period.from && r.day < period.to).map((r) => `${r.provider}:${r.model}`));
  const rates: ReportModel["rates"] = [];
  for (const [provider, models] of Object.entries(PRICES)) {
    for (const [model, entries] of Object.entries(models)) {
      if (!used.has(`${provider}:${model}`)) continue;
      const text = entries
        .map((r) =>
          r.kind === "audio"
            ? `$${r.perHour} per audio hour`
            : `$${r.input} input, $${r.cacheWrite} cache write, $${r.cacheRead} cache read, $${r.output} output per million tokens`,
        )
        .join("; ");
      rates.push({ provider, model, text });
    }
  }

  return {
    period,
    generatedOn: input.generatedOn,
    pricesReadOn: input.pricesReadOn,
    ledgerStart: input.ledgerStart,
    summary,
    months,
    categories: EXPENSE_CATEGORIES.filter((c) => summary.paid.byCategory.some((x) => x.category === c)),
    rates,
  };
}
