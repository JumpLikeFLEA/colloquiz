import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import { estimateCredit, type CreditCaveat } from "@/lib/costs/balance";
import { formatBytes, formatDay, formatMonth, formatUsd } from "@/lib/costs/format";
import { monthOf, monthPeriod, shiftMonth } from "@/lib/costs/period";
import { PRICES_READ_ON } from "@/lib/costs/prices";
import { resourceRows, storageBytes } from "@/lib/costs/resources";
import { getExpenses, getLedgerStart, getLimits, getResourceUsage, getUsage } from "@/lib/costs/server";
import { summarizePeriod } from "@/lib/costs/summary";
import { CATEGORY_LABELS, FEATURE_LABELS, PROVIDER_LABELS } from "@/lib/costs/types";
import { pluralize } from "@/lib/format";
import { CARD, PILL } from "./costsClasses";
import { ExpensesPanel } from "./ExpensesPanel";
import { LimitsPanel } from "./LimitsPanel";

// /studio/costs (OPS-032, docs/decisions/0207). Admin only: anyone else gets
// Studio's 404, as on /studio/authors. getCourseAccess() picks the 404; the
// data boundary is the RPCs (104, 105), which raise for a non-admin.
//
// "Paid" (bills and top-ups the admin entered) and "used" (the ledger at list
// price) are shown side by side and never added (0207 Decision 9).

export const metadata = { title: "Costs" };

const CAVEATS: Record<CreditCaveat, string> = {
  ledger_started_after_topup: "usage from before the ledger started is not subtracted",
  unpriced_usage: "some usage has no price and is not subtracted",
};

const NAV_LINK =
  "inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-accent transition-colors";

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const access = await getCourseAccess();
  if (!access.isAdmin) notFound();

  const now = new Date();
  const thisMonth = monthOf(now);
  const asked = (await searchParams).month;
  const month = asked && monthPeriod(asked) ? asked : thisMonth;
  const period = monthPeriod(month)!;

  const [expenses, limits, resources, ledgerStart] = await Promise.all([
    getExpenses(),
    getLimits(),
    getResourceUsage(),
    getLedgerStart(),
  ]);

  // One usage read covers the month and everything since the first top-up, for the credit estimate.
  const firstTopup = expenses.filter((e) => e.kind === "credit_topup").map((e) => e.incurredOn).sort()[0];
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const usage = await getUsage({
    from: firstTopup && firstTopup < period.from ? firstTopup : period.from,
    to: period.to > tomorrow ? period.to : tomorrow,
  });

  const summary = summarizePeriod({ period, usage, expenses });
  const credit = estimateCredit({ expenses, usage, ledgerStart });
  const rows = resourceRows(limits, resources);
  const maxDaily = Math.max(0, ...summary.usage.daily.map((d) => d.usd));
  const monthExpenses = summary.paid.expenses;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Costs</h1>
        <p className="text-sm text-muted-foreground">
          What the project paid, what the app used, and what is left. &ldquo;Paid&rdquo; is the bills and credit
          top-ups entered below. &ldquo;Used&rdquo; is every Claude and AssemblyAI call the app made, at list price.
          Most usage was paid for in advance by a top-up, so the two are never added together.
        </p>
      </div>

      {/* Month */}
      <div className="flex items-center justify-between gap-2">
        <Link href={`/studio/costs?month=${shiftMonth(month, -1)}`} className={NAV_LINK} aria-label="Previous month">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <h2 className="text-base font-semibold text-foreground">{formatMonth(month)}</h2>
          {month !== thisMonth && (
            <Link href="/studio/costs" className="text-xs text-muted-foreground hover:text-foreground underline">
              This month
            </Link>
          )}
        </div>
        <Link href={`/studio/costs?month=${shiftMonth(month, 1)}`} className={NAV_LINK} aria-label="Next month">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* Tiles */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Paid" value={formatUsd(summary.paid.total)} note={pluralize(monthExpenses.length, "entry", "entries")} />
        <Tile label="Bills" value={formatUsd(summary.paid.bills)} note={`Top-ups ${formatUsd(summary.paid.topups)}`} />
        <Tile label="Used (estimate)" value={formatUsd(summary.usage.usd)} note={pluralize(summary.usage.calls, "provider call")} />
        <Tile
          label="Credit left (estimate)"
          value={credit.length === 0 ? "—" : formatUsd(credit.reduce((s, c) => s + c.left, 0))}
          note={credit.length === 0 ? "No top-up entered" : "All providers, now"}
        />
      </dl>

      {(summary.usage.unpriced.length > 0 || summary.usage.unknownCalls > 0) && (
        <div className="rounded-2xl border border-border bg-warning-subtle px-4 py-3 text-sm space-y-1">
          <p className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Not in the estimate
          </p>
          {summary.usage.unpriced.map((u) => (
            <p key={`${u.provider}:${u.model}`} className="text-foreground break-words">
              {pluralize(u.calls, "call")} to <span className="font-mono">{u.model}</span>, which has no price in the app.
            </p>
          ))}
          {summary.usage.unknownCalls > 0 && (
            <p className="text-foreground">
              {pluralize(summary.usage.unknownCalls, "failed call")} whose size the provider&rsquo;s library did not keep.
            </p>
          )}
        </div>
      )}

      {/* Used */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Used this month</h2>
        {summary.usage.calls === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No provider calls this month.
          </p>
        ) : (
          <>
            <ul className={`${CARD} divide-y divide-border p-0`}>
              {summary.usage.byFeature.map((f) => (
                <li key={f.feature} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{FEATURE_LABELS[f.feature]}</p>
                    <p className="text-xs text-muted-foreground">
                      {pluralize(f.modelCalls, "Claude call")}
                      {f.failedCalls > 0 && ` (${f.failedCalls} failed)`}
                      {f.transcripts > 0 && ` · ${pluralize(f.transcripts, "transcript")}`}
                      {f.perModelCall !== null && ` · ${formatUsd(f.perModelCall)} per call`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatUsd(f.usd)}</span>
                </li>
              ))}
              {summary.usage.byProvider.map((p) => (
                <li key={p.provider} className="flex items-baseline justify-between gap-4 px-4 py-2 bg-muted/40">
                  <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[p.provider]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatUsd(p.usd)}</span>
                </li>
              ))}
            </ul>

            <div className={CARD}>
              <p className="text-xs text-muted-foreground mb-2">By day (UTC)</p>
              <div className="flex items-end gap-px h-24" aria-hidden>
                {summary.usage.daily.map((d) => (
                  <div
                    key={d.day}
                    title={`${formatDay(d.day)}: ${formatUsd(d.usd)}`}
                    className={`flex-1 rounded-t-sm ${d.usd > 0 ? "bg-brand" : "bg-muted"}`}
                    style={{ height: d.usd > 0 && maxDaily > 0 ? `${Math.max(4, (d.usd / maxDaily) * 100)}%` : "2px" }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{formatDay(period.from)}</span>
                <span>Highest day {formatUsd(maxDaily)}</span>
              </div>
              <ul className="sr-only">
                {summary.usage.daily
                  .filter((d) => d.usd > 0)
                  .map((d) => (
                    <li key={d.day}>
                      {formatDay(d.day)}: {formatUsd(d.usd)}
                    </li>
                  ))}
              </ul>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          List prices as read on {formatDay(PRICES_READ_ON)}.{" "}
          {ledgerStart ? `The ledger starts on ${formatDay(ledgerStart)}; nothing before it is counted.` : "The ledger is empty."}
        </p>
      </section>

      {/* Credit */}
      {credit.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Credit left (estimate)</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {credit.map((c) => (
              <li key={c.provider} className={`${CARD} space-y-1`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{PROVIDER_LABELS[c.provider]}</p>
                  <span className={`text-base font-semibold tabular-nums ${c.left < 0 ? "text-destructive-text" : "text-foreground"}`}>
                    {formatUsd(c.left)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatUsd(c.toppedUp)} topped up since {formatDay(c.since)}, {formatUsd(c.used)} used.
                </p>
                {c.caveats.length > 0 && (
                  <p className="text-xs text-warning">Probably lower: {c.caveats.map((k) => CAVEATS[k]).join("; ")}.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Paid */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Paid this month</h2>
        {summary.paid.byCategory.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {summary.paid.byCategory.map((c) => (
              <li key={c.category} className={`${PILL} bg-muted text-muted-foreground`}>
                {CATEGORY_LABELS[c.category]} {formatUsd(c.usd)}
              </li>
            ))}
          </ul>
        )}
        <ExpensesPanel expenses={monthExpenses} defaultDay={month === thisMonth ? null : period.from} />
      </section>

      {/* Resources */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Resources</h2>
        <div className={`${CARD} space-y-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Measured now</p>
            <p className="text-xs text-muted-foreground">Database {formatBytes(resources.dbBytes)} · Storage {formatBytes(storageBytes(resources))}</p>
          </div>
          {resources.buckets.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {resources.buckets.map((b) => (
                <li key={b.bucket} className="flex justify-between gap-2">
                  <span className="font-mono break-all">{b.bucket}</span>
                  <span className="shrink-0 tabular-nums">
                    {pluralize(b.objects, "file")} · {formatBytes(b.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <LimitsPanel rows={rows} />
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${CARD} min-w-0`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold text-foreground tabular-nums break-words">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}
