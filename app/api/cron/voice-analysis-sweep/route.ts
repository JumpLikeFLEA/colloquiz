import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sttFromEnv } from "@/lib/voice/analysis/server";

/**
 * GET /api/cron/voice-analysis-sweep — the daily sweep of analyses stuck for over 24 hours
 * (VOICE-012, docs/decisions/0187), scheduled in vercel.json.
 *
 * voice_analysis_sweep() (migration 097, service_role only) fails every analysis that is
 * still not finished after 24 hours, with the reason `timeout`, and gives each send back.
 * It returns their job ids, and this route deletes the transcripts still held at AssemblyAI:
 * a stuck row is exactly the one whose run died before it could.
 *
 * Same guard as voice-purge: without CRON_SECRET, and its Bearer header, it refuses
 * everything.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("voice_analysis_sweep");
  if (error) {
    console.error("voice_analysis_sweep:", error);
    return NextResponse.json({ error: "voice_analysis_sweep failed" }, { status: 500 });
  }

  const swept = (data ?? []) as { submission_id: string; stt_job_id: string | null }[];
  const jobs = swept.flatMap((s) => (s.stt_job_id ? [s.stt_job_id] : []));

  let deleted = 0;
  let notDeleted = 0;
  const stt = sttFromEnv();
  if (stt) {
    for (const job of jobs) {
      if ((await stt.delete(job)).deleted) deleted++;
      else notDeleted++;
    }
  } else if (jobs.length > 0) {
    notDeleted = jobs.length;
    console.error("voice analysis sweep: ASSEMBLYAI_API_KEY is not set; provider transcripts not deleted");
  }
  if (notDeleted > 0) console.error(`voice analysis sweep: ${notDeleted} provider transcript(s) not deleted`);

  return NextResponse.json(
    { swept: swept.length, providerJobs: jobs.length, providerDeleted: deleted, providerNotDeleted: notDeleted },
    { status: notDeleted > 0 ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
