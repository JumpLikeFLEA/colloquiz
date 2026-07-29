import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { FEEDBACK_STATUSES } from "@/lib/feedback";

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES),
});

/**
 * POST { id, status } → move one feedback item between new / triaged / closed.
 *
 * DOUBLE-GATED, deliberately. The role check below produces a clean 403 for a
 * non-admin, and "feedback: admin update" (migration 026) is what actually
 * enforces it — a non-admin who reached the UPDATE anyway would match no policy
 * and silently affect zero rows. Neither gate is load-bearing alone: the RLS
 * policy is the boundary, the check is the error message.
 *
 * This is the only mutation the admin surface has. Feedback is never edited and
 * never deleted from here — the text is the user's words, and a triage queue
 * has no business rewriting them.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
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

    const json = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
    }
    const { id, status } = parsed.data;

    // .select() so a row that matched no policy (or no id) is distinguishable
    // from a successful update — without it, both look like success.
    const { data, error } = await supabase
      .from("feedback")
      .update({ status })
      .eq("id", id)
      .select("id, status");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: data[0].status });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
