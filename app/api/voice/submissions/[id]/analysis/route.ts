import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseVoiceAnalysisMode } from "@/lib/voice/analysis/mode";
import { runAnalysisForSubmission } from "@/lib/voice/analysis/server";
import { shouldReclaim } from "@/lib/voice/analysis/staging";
import { readAnalysisStatus, type StatusDeps } from "@/lib/voice/analysis/status";

/**
 * GET /api/voice/submissions/<id>/analysis — where one take's analysis stands (VOICE-012,
 * docs/decisions/0187; the learner's view, VOICE-014, 0189). The feedback view polls it.
 *
 * Read under the caller's own session: 096's RLS lets the owner read their own NON-hidden
 * analysis (and an editor read the course's), and only the granted columns. What RLS hides from
 * the owner (withdrawn, a send past a cap, paused) is answered by lib/voice/analysis/status.ts
 * with a service-role read, after the caller is proved to own the take, and only as a state word.
 *
 * It is also the way a stalled run is picked up again, since there is no webhook and no
 * queue: a row that is not finished and has not moved for 30 s is offered to the pipeline.
 * The offer is only a hint. voice_analysis_claim is atomic and refuses while any lease is
 * live, so a poll that arrives while a run is working changes nothing.
 */

function statusDeps(supabase: SupabaseClient, userId: string, admin: () => SupabaseClient) {
  // The row as RLS showed it, kept for the re-claim check below (per request, never shared).
  const seen: { status: string; updatedAt: string } = { status: "", updatedAt: "" };
  const deps: StatusDeps = {
    async ownsTake(id) {
      const { data, error } = await supabase
        .from("voice_submissions")
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async readVisible(id) {
      const { data, error } = await supabase
        .from("voice_analyses")
        .select("status, transcript, result, updated_at")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      seen.status = data.status as string;
      seen.updatedAt = data.updated_at as string;
      return { status: data.status as string, transcript: data.transcript as string | null, result: data.result };
    },
    async readHidden(id) {
      const { data, error } = await admin()
        .from("voice_analyses")
        .select("hidden_at")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      return data?.hidden_at != null;
    },
    async readLedger(id) {
      const { data, error } = await admin()
        .from("voice_analysis_sends")
        .select("analysed, uncounted_reason")
        .eq("submission_id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? { analysed: data.analysed as boolean, uncountedReason: data.uncounted_reason as string | null } : null;
    },
    async readBaselineId(id) {
      const { data, error } = await admin()
        .from("voice_analyses")
        .select("baseline_submission_id")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      return (data?.baseline_submission_id as string | null) ?? null;
    },
    async readBaseline(id) {
      // Under the caller's session again: a hidden or purged first analysis simply is not there.
      const { data, error } = await supabase
        .from("voice_analyses")
        .select("status, transcript, result")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.status !== "done" || typeof data.transcript !== "string") return null;
      return { transcript: data.transcript as string, result: data.result };
    },
  };
  return { deps, seen };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const headers = { "Cache-Control": "no-store" };
  try {
    const mode = parseVoiceAnalysisMode(process.env.VOICE_ANALYSIS_MODE);
    const { deps, seen } = statusDeps(supabase, user.id, createAdminClient);
    const body = await readAnalysisStatus(id, mode, deps);

    // Judged on the row itself, not on the word sent back: under `off` the word is "off".
    if (seen.updatedAt && shouldReclaim(seen.status, seen.updatedAt, Date.now())) {
      after(() => runAnalysisForSubmission(id));
    }
    return NextResponse.json(body, { headers });
  } catch (error) {
    // A malformed UUID is a cast error, and to the caller the same as "no analysis".
    if ((error as { code?: string }).code === "22P02") return NextResponse.json({ ok: true, status: "none" }, { headers });
    console.error("voice analysis status read:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
