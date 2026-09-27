/**
 * OPS-015 — read-only cleanup report for insert-only rate-limit log tables.
 *
 * ANON-006's privilege review (docs/decisions/0066) found
 * `pending_claims_creation_log` (049) has no cleanup path at all. Checking
 * the other insert-only rate-limit logs found the same shape: a row is
 * inserted on every rate-limited call and nothing schedules its removal.
 * `funnel_events_creation_log` (051) and `pending_claims_creation_log` (052,
 * written but not yet applied — see docs/decisions/0072) each prune their
 * own past-window rows, but ONLY as a side effect of the next INSERT
 * (051:217, 052:50) — a quiet period after the last request leaves rows
 * sitting past the 1-hour window privacy-policy.md §3.4/§7 promises they are
 * "deleted automatically after one hour". `account_export_log` (038) has no
 * pruning at all, inline or scheduled. `feedback` (026) is NOT a bookkeeping
 * log — it is real content an admin triages (026's header: "Admins read and
 * update everything; that is the whole consumer") — so its retention window
 * is privacy-policy.md §7's 24 months, not a 1-hour rate-limit window, and it
 * is reported on a completely different threshold from the other three.
 *
 * This script only REPORTS. It never deletes a row — see docs/decisions/0072
 * for why a deletion/scheduling step is deferred to a follow-up card rather
 * than built here, same precedent as AUTH-006's sweep-lesson-images.ts.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/sweep-rate-limit-logs.ts
 *
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set — none of
 * these tables grants SELECT to `authenticated`, so only the service-role
 * key can read them (same precedent as scripts/sweep-lesson-images.ts).
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!url || !key) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const HOUR_MS = 60 * 60 * 1000;

type RateLimitTable = {
  table: string;
  /** How the table is pruned today, for the report's own context line. */
  pruning: "none" | "lazy-on-next-insert";
  windowMs: number;
  windowLabel: string;
};

const RATE_LIMIT_LOGS: RateLimitTable[] = [
  { table: "pending_claims_creation_log", pruning: "lazy-on-next-insert", windowMs: HOUR_MS, windowLabel: "1 hour" },
  { table: "account_export_log", pruning: "none", windowMs: HOUR_MS, windowLabel: "1 hour" },
  { table: "funnel_events_creation_log", pruning: "lazy-on-next-insert", windowMs: HOUR_MS, windowLabel: "1 hour" },
];

// feedback (026) is real admin-triaged content, not a bookkeeping log — its
// retention promise is privacy-policy.md §7's 24 months, not a 1-hour
// rate-limit window. Reported separately, never folded into the loop above.
const FEEDBACK_RETENTION_MS = 24 * 30 * 24 * HOUR_MS; // 24 months, 30-day months

function formatAge(ms: number): string {
  const hours = ms / HOUR_MS;
  if (hours < 48) return `${hours.toFixed(1)} hour(s)`;
  return `${(hours / 24).toFixed(1)} day(s)`;
}

async function oldestNewest(table: string): Promise<{ oldest: string | null; newest: string | null }> {
  const [{ data: oldestRows, error: oldestErr }, { data: newestRows, error: newestErr }] = await Promise.all([
    supabase.from(table).select("created_at").order("created_at", { ascending: true }).limit(1),
    supabase.from(table).select("created_at").order("created_at", { ascending: false }).limit(1),
  ]);
  if (oldestErr) die(`${table}: oldest-row read failed: ${oldestErr.message}`);
  if (newestErr) die(`${table}: newest-row read failed: ${newestErr.message}`);
  return {
    oldest: oldestRows?.[0]?.created_at ?? null,
    newest: newestRows?.[0]?.created_at ?? null,
  };
}

async function countTotal(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) die(`${table}: count failed: ${error.message}`);
  return count ?? 0;
}

async function countPastCutoff(table: string, cutoffIso: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .lte("created_at", cutoffIso);
  if (error) die(`${table}: past-window count failed: ${error.message}`);
  return count ?? 0;
}

async function reportRateLimitLog(t: RateLimitTable): Promise<void> {
  const cutoff = new Date(Date.now() - t.windowMs);
  const [total, pastWindow, { oldest, newest }] = await Promise.all([
    countTotal(t.table),
    countPastCutoff(t.table, cutoff.toISOString()),
    oldestNewest(t.table),
  ]);

  console.log(`\n${t.table} (rate-limit window: ${t.windowLabel}, pruning: ${t.pruning})`);
  console.log(`  total rows: ${total}`);
  console.log(`  rows past their ${t.windowLabel} window: ${pastWindow}`);
  if (oldest) {
    const ageMs = Date.now() - new Date(oldest).getTime();
    console.log(`  oldest row: ${oldest} (${formatAge(ageMs)} old)`);
  } else {
    console.log("  oldest row: none (table is empty)");
  }
  if (newest) console.log(`  newest row: ${newest}`);
}

async function reportFeedback(): Promise<void> {
  const cutoff = new Date(Date.now() - FEEDBACK_RETENTION_MS);
  const [total, pastRetention, { oldest, newest }] = await Promise.all([
    countTotal("feedback"),
    countPastCutoff("feedback", cutoff.toISOString()),
    oldestNewest("feedback"),
  ]);

  console.log(`\nfeedback (retention: 24 months per privacy-policy.md §7 — NOT a rate-limit log)`);
  console.log(`  total rows: ${total}`);
  console.log(`  rows past 24 months (candidates for the separate retention-enforcement card): ${pastRetention}`);
  if (oldest) {
    const ageMs = Date.now() - new Date(oldest).getTime();
    console.log(`  oldest row: ${oldest} (${formatAge(ageMs)} old)`);
  } else {
    console.log("  oldest row: none (table is empty)");
  }
  if (newest) console.log(`  newest row: ${newest}`);
}

async function main() {
  console.log("Read-only report. No rows are deleted by this script.");

  for (const t of RATE_LIMIT_LOGS) {
    await reportRateLimitLog(t);
  }
  await reportFeedback();

  console.log("\nDone. No rows were deleted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
