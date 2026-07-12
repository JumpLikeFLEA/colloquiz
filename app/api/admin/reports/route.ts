import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ResolveSchema = z.object({
  questionId: z.string().min(1),
  resolution: z.enum(["edited", "removed", "dismissed"]),
  note: z.string().trim().max(2000).optional(),
});

// POST { questionId, resolution, note? } → close ALL open reports on a
// question. Delegates to the resolve_question_reports() SECURITY DEFINER RPC,
// which atomically resolves reports, rejects the question when resolution is
// "removed", and writes a notification per distinct reporter.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json();
    const parsed = ResolveSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { questionId, resolution, note } = parsed.data;

    const { data, error } = await supabase.rpc("resolve_question_reports", {
      p_question_id: questionId,
      p_resolution: resolution,
      p_note: note ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as { ok: boolean; error?: string; resolved_count?: number };
    if (!result.ok) {
      const statusByError: Record<string, number> = {
        forbidden: 403,
        question_not_found: 404,
        no_open_reports: 409,
        invalid_resolution: 400,
      };
      return NextResponse.json(
        { error: result.error ?? "Could not resolve reports" },
        { status: statusByError[result.error ?? ""] ?? 400 }
      );
    }

    return NextResponse.json({ ok: true, resolvedCount: result.resolved_count ?? 0 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
