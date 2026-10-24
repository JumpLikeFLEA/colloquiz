import { bytesIn } from "./format";
import type { ResourceLimit, ResourceUsage } from "./types";

/**
 * A plan limit next to how much of it is used (OPS-032, docs/decisions/0207): measured by
 * admin_resource_usage() for database and Storage size, else the admin's last manual reading
 * with its date, else nothing ("not read").
 */

export type ResourceRow = {
  limit: ResourceLimit;
  /** In the limit's own unit; null when nothing measured or read it. */
  used: number | null;
  source: "measured" | "manual" | "none";
  /** used / limit, capped at 1 for the bar; null without both numbers or with a zero limit. */
  fraction: number | null;
  over: boolean;
};

export function storageBytes(usage: ResourceUsage): number {
  return usage.buckets.reduce((s, b) => s + b.bytes, 0);
}

export function resourceRows(limits: ResourceLimit[], usage: ResourceUsage | null): ResourceRow[] {
  return limits.map((limit) => {
    let used: number | null = null;
    let source: ResourceRow["source"] = "none";
    if (limit.measured && usage && (limit.unit === "MB" || limit.unit === "GB")) {
      const bytes = limit.measured === "db_bytes" ? usage.dbBytes : storageBytes(usage);
      used = bytes / bytesIn(limit.unit, 1);
      source = "measured";
    } else if (limit.manualReading !== null) {
      used = limit.manualReading;
      source = "manual";
    }
    const hasBoth = used !== null && limit.limitValue !== null && limit.limitValue > 0;
    return {
      limit,
      used,
      source,
      fraction: hasBoth ? Math.min(1, used! / limit.limitValue!) : null,
      over: hasBoth && used! > limit.limitValue!,
    };
  });
}
