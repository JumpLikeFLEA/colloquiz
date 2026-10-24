import { EXPENSE_CATEGORIES, LIMIT_UNITS, type Expense, type ResourceLimit } from "./types";

/**
 * The shape checks for the costs editor's writes (OPS-032), before the RPCs (105) check
 * again: the route answers 400 with a field's message instead of relaying a constraint name.
 * The database is the gate; this is the courtesy.
 */

export const VENDOR_MAX = 80;
export const REFERENCE_MAX = 300;
export const NOTE_MAX = 1000;
export const LIMIT_NOTE_MAX = 500;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const optionalDay = (v: unknown): string | null | undefined => (v === null || v === undefined || v === "" ? null : isDay(v) ? v : undefined);

/** A number from a field: a JS number or a numeric string; null for empty; undefined for anything else. */
function amount(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export type ExpenseInput = Omit<Expense, "id"> & { id: string | null };

export function parseExpenseInput(body: Record<string, unknown>): Parsed<ExpenseInput> {
  const id = body.id === null || body.id === undefined ? null : typeof body.id === "string" && UUID.test(body.id) ? body.id : undefined;
  if (id === undefined) return { ok: false, error: "Invalid request." };
  if (!isDay(body.incurredOn)) return { ok: false, error: "Choose the date of the expense." };
  const vendor = text(body.vendor);
  if (!vendor || vendor.length > VENDOR_MAX) return { ok: false, error: `Name the vendor (${VENDOR_MAX} characters at most).` };
  if (!EXPENSE_CATEGORIES.includes(body.category as never)) return { ok: false, error: "Choose a category." };
  if (body.kind !== "bill" && body.kind !== "credit_topup") return { ok: false, error: "Choose bill or credit top-up." };
  const creditProvider = body.kind === "credit_topup" ? body.creditProvider : null;
  if (body.kind === "credit_topup" && creditProvider !== "anthropic" && creditProvider !== "assemblyai") {
    return { ok: false, error: "Say whose credit the top-up bought." };
  }
  const usd = amount(body.amountUsd);
  if (usd === null || usd === undefined || usd <= 0 || usd >= 1e10) return { ok: false, error: "Enter an amount in USD above zero." };
  if (Math.round(usd * 100) !== usd * 100) return { ok: false, error: "Enter the amount to the cent." };
  const periodStart = optionalDay(body.periodStart);
  const periodEnd = optionalDay(body.periodEnd);
  if (periodStart === undefined || periodEnd === undefined) return { ok: false, error: "That is not a valid period." };
  if (periodStart && periodEnd && periodEnd < periodStart) return { ok: false, error: "The period ends before it starts." };
  const reference = text(body.reference);
  if (reference.length > REFERENCE_MAX) return { ok: false, error: `The reference is ${REFERENCE_MAX} characters at most.` };
  const note = text(body.note);
  if (note.length > NOTE_MAX) return { ok: false, error: `The note is ${NOTE_MAX} characters at most.` };

  return {
    ok: true,
    value: {
      id,
      incurredOn: body.incurredOn,
      vendor,
      category: body.category as Expense["category"],
      kind: body.kind,
      creditProvider: creditProvider as Expense["creditProvider"],
      amountUsd: usd,
      periodStart,
      periodEnd,
      reference: reference || null,
      note: note || null,
    },
  };
}

export type LimitInput = Omit<ResourceLimit, "id"> & { id: string | null };

export function parseLimitInput(body: Record<string, unknown>): Parsed<LimitInput> {
  const id = body.id === null || body.id === undefined ? null : typeof body.id === "string" && UUID.test(body.id) ? body.id : undefined;
  if (id === undefined) return { ok: false, error: "Invalid request." };
  const provider = text(body.provider);
  const metric = text(body.metric);
  if (!provider || provider.length > 40) return { ok: false, error: "Name the provider (40 characters at most)." };
  if (!metric || metric.length > 60) return { ok: false, error: "Name what is limited (60 characters at most)." };
  const plan = text(body.plan);
  if (plan.length > 40) return { ok: false, error: "The plan is 40 characters at most." };
  if (!LIMIT_UNITS.includes(body.unit as never)) return { ok: false, error: "Choose a unit." };
  const unit = body.unit as ResourceLimit["unit"];
  const measured = body.measured === null || body.measured === undefined || body.measured === "" ? null : body.measured;
  if (measured !== null && measured !== "db_bytes" && measured !== "storage_bytes") return { ok: false, error: "Invalid request." };
  if (measured !== null && unit !== "MB" && unit !== "GB") return { ok: false, error: "A measured size is compared in MB or GB." };
  const limitValue = amount(body.limitValue);
  if (limitValue === undefined) return { ok: false, error: "The limit is a number." };
  const manualReading = amount(body.manualReading);
  if (manualReading === undefined) return { ok: false, error: "The reading is a number." };
  const readOn = optionalDay(body.readOn);
  if (readOn === undefined) return { ok: false, error: "That is not a valid date." };
  if ((manualReading === null) !== (readOn === null)) return { ok: false, error: "A reading needs the date it was read, and a date needs a reading." };
  const note = text(body.note);
  if (note.length > LIMIT_NOTE_MAX) return { ok: false, error: `The note is ${LIMIT_NOTE_MAX} characters at most.` };

  return {
    ok: true,
    value: {
      id,
      provider,
      metric,
      plan: plan || null,
      limitValue,
      unit,
      measured: measured as ResourceLimit["measured"],
      manualReading,
      readOn,
      note: note || null,
    },
  };
}
