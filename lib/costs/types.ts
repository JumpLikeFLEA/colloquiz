import type { UsageFeature, UsageProvider } from "./usageEvent";

/**
 * The shapes the costs dashboard and the sponsor report read (OPS-032, docs/decisions/0207),
 * already mapped from the RPCs' snake_case rows by lib/costs/server.ts.
 */

/** One row of admin_usage_summary (104): a UTC day x provider x feature x model x outcome. */
export type UsageRow = {
  day: string;
  provider: UsageProvider;
  feature: UsageFeature;
  model: string;
  outcome: "ok" | "failed";
  calls: number;
  /** Claude calls in this row whose usage the SDK dropped (0207 Decision 4). */
  unknownCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  audioSeconds: number;
};

export const EXPENSE_CATEGORIES = ["hosting", "database", "ai", "speech", "domain", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  hosting: "Hosting",
  database: "Database",
  ai: "AI (Claude)",
  speech: "Speech to text",
  domain: "Domain",
  other: "Other",
};

/** A manual_expenses row (105). */
export type Expense = {
  id: string;
  incurredOn: string;
  vendor: string;
  category: ExpenseCategory;
  kind: "bill" | "credit_topup";
  creditProvider: UsageProvider | null;
  amountUsd: number;
  periodStart: string | null;
  periodEnd: string | null;
  reference: string | null;
  note: string | null;
};

export const LIMIT_UNITS = ["MB", "GB", "count", "hours", "USD"] as const;
export type LimitUnit = (typeof LIMIT_UNITS)[number];

/** A resource_limits row (105). */
export type ResourceLimit = {
  id: string;
  provider: string;
  metric: string;
  plan: string | null;
  limitValue: number | null;
  unit: LimitUnit;
  measured: "db_bytes" | "storage_bytes" | null;
  manualReading: number | null;
  readOn: string | null;
  note: string | null;
};

/** admin_resource_usage() (105). */
export type ResourceUsage = {
  measuredAt: string;
  dbBytes: number;
  buckets: { bucket: string; objects: number; bytes: number }[];
};

export const PROVIDER_LABELS: Record<UsageProvider, string> = { anthropic: "Anthropic (Claude)", assemblyai: "AssemblyAI" };
export const FEATURE_LABELS: Record<UsageFeature, string> = { voice_analysis: "Voice feedback", course_import: "Course import" };
