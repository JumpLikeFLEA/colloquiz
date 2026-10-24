/** Money and sizes for the costs dashboard and report (OPS-032). USD only (0207 Decision 8). */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdFine = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

/** "$12.50"; an amount under a cent and above zero shows its fractions ("$0.0035"), so it never reads as nothing. */
export function formatUsd(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.01) return usdFine.format(value);
  return usd.format(value);
}

/** "41.2 MB", "1.05 GB": decimal units, as the providers' dashboards count them. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let v = bytes;
  let i = -1;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

/** Bytes in a limit's unit, for comparing a measurement with it (MB and GB only). */
export function bytesIn(unit: "MB" | "GB", value: number): number {
  return value * (unit === "MB" ? 1e6 : 1e9);
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10-05" -> "5 Oct 2026" (Studio's date wording); the input echoed back if it is not a day. */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : dayFormat.format(d);
}

/** "2026-10" -> "October 2026". */
export function formatMonth(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? month : monthFormat.format(d);
}
