import { after, NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runAnalysisForSubmission } from "@/lib/voice/analysis/server";
import { shouldReclaim } from "@/lib/voice/analysis/staging";

/**
 * GET /api/voice/submissions/<id>/analysis — where one take's analysis stands (VOICE-012,
 * docs/decisions/0187). The learner's feedback view (VOICE-014) polls it.
 *
 * Read under the caller's own session: 096's RLS lets the owner read their own NON-hidden
 * analysis (and an editor read the course's), and only the granted columns, so a take with
 * no visible analysis is `none`. That is also what a hidden analysis looks like; the
 * "feedback withdrawn" state is VOICE-014's.
 *
 * It is also the way a stalled run is picked up again, since there is no webhook and no
 * queue: a row that is not finished and has not moved for 30 s is offered to the pipeline.
 * The offer is only a hint. voice_analysis_claim is atomic and refuses while any lease is
 * live, so a poll that arrives while a run is working changes nothing.
 */

const STATUSES = new Set(["pending", "transcribing", "analysing", "done", "failed"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("voice_analyses")
    .select("status, result, updated_at")
    .eq("submission_id", id)
    .maybeSingle();
  if (error) {
    // A malformed UUID is a cast error, and to the caller the same as "no analysis".
    if (error.code === "22P02") return NextResponse.json({ ok: true, status: "none" });
    console.error("voice analysis status read:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
  const headers = { "Cache-Control": "no-store" };
  if (!data || !STATUSES.has(data.status)) return NextResponse.json({ ok: true, status: "none" }, { headers });

  if (shouldReclaim(data.status, data.updated_at, Date.now())) {
    after(() => runAnalysisForSubmission(id));
  }

  return NextResponse.json(
    { ok: true, status: data.status, result: data.status === "done" ? data.result : null },
    { headers },
  );
}
