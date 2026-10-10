import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

// AUTH-010 — the shared body of the cohort editor's routes. Each route is a
// thin wrapper over one of 058's editor RPCs (docs/decisions/0105): the RPC
// checks can_edit_course and every schedule rule, and returns { ok, error }.
// A route only parses input and maps that result, so no rule lives here.
// Not a route file: Next only treats `route.ts` as one.

/** An instant with an explicit offset; the client converts the editor's wall
 * clock before sending (lib/cohortSchedule.ts `fromLocalDateTime`). */
export const InstantSchema = z.iso.datetime({ offset: true });

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  return parsed.success ? parsed.data : null;
}

export const INVALID_INPUT = () => NextResponse.json({ error: "Invalid input" }, { status: 400 });

type RpcResult = { ok: boolean; error?: string } & Record<string, unknown>;

/** Calls one editor RPC as the signed-in caller. Returns the RPC's result
 * (ok or a mapped refusal), or a 401 / 500 response. */
export async function callCohortRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ result: RpcResult } | { response: NextResponse }> {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(error);
    return { response: NextResponse.json({ error: "Internal server error" }, { status: 500 }) };
  }
  return { result: data as RpcResult };
}

/** One RPC, one response: its fields on success, the mapped refusal otherwise. */
export async function cohortRpcResponse(fn: string, args: Record<string, unknown>): Promise<NextResponse> {
  const called = await callCohortRpc(fn, args);
  if ("response" in called) return called.response;
  const { ok, error, ...rest } = called.result;
  if (!ok) {
    const { status, body } = courseAuthoringErrorResponse(error);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json({ ok: true, ...rest });
}
