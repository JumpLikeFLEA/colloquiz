import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "./period";
import type { Expense, ResourceLimit, ResourceUsage, UsageRow } from "./types";

/**
 * Reads for the costs dashboard and the sponsor report (OPS-032, docs/decisions/0207). The
 * caller's own session: every RPC (104, 105) raises insufficient_privilege for a non-admin, so
 * this module is not the gate; the page's getCourseAccess() check only picks the 404.
 */

type UsageRpcRow = {
  day: string;
  provider: UsageRow["provider"];
  feature: UsageRow["feature"];
  model: string;
  outcome: UsageRow["outcome"];
  calls: number;
  unknown_calls: number;
  input_tokens: number | string;
  output_tokens: number | string;
  cache_write_tokens: number | string;
  cache_read_tokens: number | string;
  audio_seconds: number | string;
};

type ExpenseRpcRow = {
  id: string;
  incurred_on: string;
  vendor: string;
  category: Expense["category"];
  kind: Expense["kind"];
  credit_provider: Expense["creditProvider"];
  amount_usd: number | string;
  period_start: string | null;
  period_end: string | null;
  reference: string | null;
  note: string | null;
};

type LimitRpcRow = {
  id: string;
  provider: string;
  metric: string;
  plan: string | null;
  limit_value: number | string | null;
  unit: ResourceLimit["unit"];
  measured: ResourceLimit["measured"];
  manual_reading: number | string | null;
  read_on: string | null;
  note: string | null;
};

const num = (v: number | string) => Number(v);
const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));

function failed(name: string, error: { message: string }): never {
  throw new Error(`${name}: ${error.message}`);
}

export async function getUsage(period: Period): Promise<UsageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_usage_summary", {
    p_from: `${period.from}T00:00:00Z`,
    p_to: `${period.to}T00:00:00Z`,
  });
  if (error) failed("admin_usage_summary", error);
  return ((data ?? []) as UsageRpcRow[]).map((r) => ({
    day: r.day,
    provider: r.provider,
    feature: r.feature,
    model: r.model,
    outcome: r.outcome,
    calls: r.calls,
    unknownCalls: r.unknown_calls,
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheWriteTokens: num(r.cache_write_tokens),
    cacheReadTokens: num(r.cache_read_tokens),
    audioSeconds: num(r.audio_seconds),
  }));
}

/** The first UTC day the ledger holds, or null when it is empty. */
export async function getLedgerStart(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_usage_ledger_start");
  if (error) failed("admin_usage_ledger_start", error);
  return typeof data === "string" ? new Date(data).toISOString().slice(0, 10) : null;
}

export async function getExpenses(): Promise<Expense[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_expenses_list");
  if (error) failed("admin_expenses_list", error);
  return ((data ?? []) as ExpenseRpcRow[]).map((r) => ({
    id: r.id,
    incurredOn: r.incurred_on,
    vendor: r.vendor,
    category: r.category,
    kind: r.kind,
    creditProvider: r.credit_provider,
    amountUsd: num(r.amount_usd),
    periodStart: r.period_start,
    periodEnd: r.period_end,
    reference: r.reference,
    note: r.note,
  }));
}

export async function getLimits(): Promise<ResourceLimit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_limits_list");
  if (error) failed("admin_limits_list", error);
  return ((data ?? []) as LimitRpcRow[]).map((r) => ({
    id: r.id,
    provider: r.provider,
    metric: r.metric,
    plan: r.plan,
    limitValue: numOrNull(r.limit_value),
    unit: r.unit,
    measured: r.measured,
    manualReading: numOrNull(r.manual_reading),
    readOn: r.read_on,
    note: r.note,
  }));
}

export async function getResourceUsage(): Promise<ResourceUsage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_resource_usage");
  if (error) failed("admin_resource_usage", error);
  const r = data as { measured_at: string; db_bytes: number; buckets: { bucket: string; objects: number; bytes: number }[] };
  return {
    measuredAt: r.measured_at,
    dbBytes: Number(r.db_bytes),
    buckets: r.buckets.map((b) => ({ bucket: b.bucket, objects: Number(b.objects), bytes: Number(b.bytes) })),
  };
}
