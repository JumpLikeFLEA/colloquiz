/**
 * Months as half-open UTC day ranges (OPS-032). The ledger groups by UTC day (104,
 * admin_usage_summary), so every period here is in UTC days too.
 */

export type Period = { from: string; to: string };

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "2026-10" -> { from: "2026-10-01", to: "2026-11-01" }; null for anything else. */
export function monthPeriod(month: string): Period | null {
  const m = MONTH.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (year < 2000 || year > 2100) return null;
  return { from: `${m[1]}-${m[2]}-01`, to: firstOfNextMonth(year, mon) };
}

/** The months from `fromMonth` to `toMonth`, both included, as one period; null if unreadable or reversed. */
export function monthsPeriod(fromMonth: string, toMonth: string): Period | null {
  const a = monthPeriod(fromMonth);
  const b = monthPeriod(toMonth);
  if (!a || !b || a.from > b.from) return null;
  return { from: a.from, to: b.to };
}

/** "YYYY-MM" of a Date, in UTC. */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const p = monthPeriod(month);
  if (!p) return month;
  const d = new Date(`${p.from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return monthOf(d);
}

/** Every "YYYY-MM" a period touches, in order. */
export function monthsIn(period: Period): string[] {
  const out: string[] = [];
  let month = period.from.slice(0, 7);
  while (`${month}-01` < period.to) {
    out.push(month);
    month = shiftMonth(month, 1);
  }
  return out;
}

/** Every UTC day of a period, in order. */
export function daysIn(period: Period): string[] {
  const out: string[] = [];
  const d = new Date(`${period.from}T00:00:00Z`);
  for (;;) {
    const day = d.toISOString().slice(0, 10);
    if (day >= period.to) return out;
    out.push(day);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function firstOfNextMonth(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
