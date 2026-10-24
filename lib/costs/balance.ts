import { priceRow } from "./pricing";
import type { Expense, UsageRow } from "./types";
import type { UsageProvider } from "./usageEvent";

/**
 * Prepaid credit left per provider, ESTIMATED (OPS-032, docs/decisions/0207 Decision 7):
 * every top-up entered for the provider, minus the priced usage since the first of them.
 * Neither provider's real balance is readable without an admin key (Decision 1).
 *
 * The estimate errs high, never silently: `caveats` says when usage it cannot price, or usage
 * from before the ledger started, is missing from the subtraction.
 */

export type CreditCaveat = "ledger_started_after_topup" | "unpriced_usage";

export type CreditEstimate = {
  provider: UsageProvider;
  toppedUp: number;
  used: number;
  left: number;
  since: string;
  caveats: CreditCaveat[];
};

export function estimateCredit(input: {
  expenses: Expense[];
  /** Usage rows from at least the earliest top-up's day onwards. */
  usage: UsageRow[];
  /** First day the ledger holds (admin_usage_ledger_start), or null when it is empty. */
  ledgerStart: string | null;
}): CreditEstimate[] {
  const providers: UsageProvider[] = ["anthropic", "assemblyai"];
  const out: CreditEstimate[] = [];

  for (const provider of providers) {
    const topups = input.expenses.filter((e) => e.kind === "credit_topup" && e.creditProvider === provider);
    if (topups.length === 0) continue;
    const since = topups.map((e) => e.incurredOn).sort()[0];
    const toppedUp = topups.reduce((s, e) => s + e.amountUsd, 0);

    let used = 0;
    let unpriced = false;
    for (const row of input.usage) {
      if (row.provider !== provider || row.day < since) continue;
      const cost = priceRow(row);
      if (cost === null || row.unknownCalls > 0) unpriced = true;
      used += cost ?? 0;
    }

    const caveats: CreditCaveat[] = [];
    if (input.ledgerStart === null || input.ledgerStart > since) caveats.push("ledger_started_after_topup");
    if (unpriced) caveats.push("unpriced_usage");
    out.push({ provider, toppedUp, used, left: toppedUp - used, since, caveats });
  }
  return out;
}
