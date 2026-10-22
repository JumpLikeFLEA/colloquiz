import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeVoiceObjects } from "@/lib/voice/storage";

/**
 * GET /api/cron/voice-purge — the daily voice-recording purge (VOICE-004,
 * docs/decisions/0110 Decision 4), scheduled in vercel.json.
 *
 * voice_purge_due() (migration 060, service_role only) lists what is due:
 * - takes whose run ended 6 months ago or more (privacy-policy.md, "How
 *   long we keep it");
 * - queued names: a replaced take or an erased account whose immediate
 *   removal in its own route failed;
 * - uploads no submission references after 24 hours.
 * Each is removed through the Storage API, never by deleting
 * storage.objects rows, and only then marked in SQL. Marking a retention-purged
 * take also deletes its transcript and AI analysis (098, 0156 Decision 7).
 * Last, voice_purge_ledger() deletes the analysis send ledger's rows older than
 * 6 months (VOICE-016, docs/decisions/0195).
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var
 * is set on the project. Without it this route refuses everything, so an
 * unconfigured deployment purges nothing rather than being callable by
 * anyone.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("voice_purge_due");
  if (error) {
    console.error("voice_purge_due:", error);
    return NextResponse.json({ error: "voice_purge_due failed" }, { status: 500 });
  }

  const due = (data ?? []) as { object_name: string; reason: string }[];
  const byReason: Record<string, number> = {};
  for (const d of due) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;

  const { removed, failed } = await removeVoiceObjects(
    admin,
    due.map((d) => d.object_name),
  );
  if (failed.length > 0) {
    console.error(`voice purge: ${failed.length} object(s) not removed; retried next run`);
  }

  // Independent of the objects: a failed removal above must not keep the ledger's
  // rows past their 6 months.
  const { data: ledgerDeleted, error: ledgerError } = await admin.rpc("voice_purge_ledger");
  if (ledgerError) console.error("voice_purge_ledger:", ledgerError);

  return NextResponse.json(
    {
      due: due.length,
      byReason,
      removed: removed.length,
      failed: failed.length,
      ledgerDeleted: ledgerError ? null : ledgerDeleted,
    },
    { status: failed.length > 0 || ledgerError ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
