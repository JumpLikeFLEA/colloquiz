import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseExpenseInput, parseLimitInput } from "@/lib/costs/input";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OPS-032 (docs/decisions/0207) — the costs editor's writes as JSON:
 *   { action: "expense-save", id?, incurredOn, vendor, category, kind, creditProvider?, amountUsd,
 *     periodStart?, periodEnd?, reference?, note? }                     -> { id }
 *   { action: "expense-delete", id }                                    -> { ok }
 *   { action: "limit-save", id?, provider, metric, plan?, limitValue?, unit, measured?,
 *     manualReading?, readOn?, note? }                                  -> { id }
 *   { action: "limit-delete", id }                                      -> { ok }
 *
 * Each RPC (105) checks is_admin itself and raises otherwise; this route checks the shape and
 * turns the database's answer into a message. It is not the gate.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let call: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
  switch (body.action) {
    case "expense-save": {
      const parsed = parseExpenseInput(body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const v = parsed.value;
      call = supabase.rpc("admin_expense_save", {
        p_id: v.id,
        p_incurred_on: v.incurredOn,
        p_vendor: v.vendor,
        p_category: v.category,
        p_kind: v.kind,
        p_credit_provider: v.creditProvider,
        p_amount_usd: v.amountUsd,
        p_period_start: v.periodStart,
        p_period_end: v.periodEnd,
        p_reference: v.reference,
        p_note: v.note,
      });
      break;
    }
    case "limit-save": {
      const parsed = parseLimitInput(body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const v = parsed.value;
      call = supabase.rpc("admin_limit_save", {
        p_id: v.id,
        p_provider: v.provider,
        p_metric: v.metric,
        p_plan: v.plan,
        p_limit_value: v.limitValue,
        p_unit: v.unit,
        p_measured: v.measured,
        p_manual_reading: v.manualReading,
        p_read_on: v.readOn,
        p_note: v.note,
      });
      break;
    }
    case "expense-delete":
    case "limit-delete": {
      if (typeof body.id !== "string" || !UUID.test(body.id)) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }
      call = supabase.rpc(body.action === "expense-delete" ? "admin_expense_delete" : "admin_limit_delete", { p_id: body.id });
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await call;
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: "Only an admin can change costs." }, { status: 403 });
    if (error.code === "23505") {
      return NextResponse.json({ error: "There is already a limit for that provider and metric." }, { status: 409 });
    }
    if (error.code === "23514") return NextResponse.json({ error: "Check the fields: one is not allowed." }, { status: 400 });
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  if (body.action === "expense-delete" || body.action === "limit-delete") {
    return data === true ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "It was already gone." }, { status: 404 });
  }
  if (typeof data !== "string") return NextResponse.json({ error: "It was already gone." }, { status: 404 });
  return NextResponse.json({ id: data });
}
