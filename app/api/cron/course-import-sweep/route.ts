import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claudeFromEnv, createImportFiles } from "@/lib/courseImport/server";

/**
 * GET /api/cron/course-import-sweep — the daily sweep of course imports (CNT-018,
 * docs/decisions/0203), scheduled in vercel.json.
 *
 * course_import_sweep() (migration 103, service_role only) fails every import still unfinished
 * after 24 hours with the reason `timeout`, and returns what is left behind: finished imports
 * that still name a bucket object or an Anthropic file, and bucket objects no import refers to
 * (an upload that was never started). This route deletes them. An author's file is meant to
 * exist only while its import runs; this is what makes that true when a run died.
 *
 * Same guard as the voice crons: without CRON_SECRET, and its Bearer header, it refuses
 * everything.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("course_import_sweep");
  if (error) {
    console.error("course_import_sweep:", error);
    return NextResponse.json({ error: "course_import_sweep failed" }, { status: 500 });
  }

  const swept = data as {
    swept: number;
    leftovers: { id: string; object_name: string | null; anthropic_file_id: string | null }[];
    orphans: string[];
  };

  const files = createImportFiles(admin);
  const claude = process.env.ANTHROPIC_API_KEY?.trim() ? claudeFromEnv() : null;

  let failed = 0;
  const cleaned: string[] = [];
  for (const row of swept.leftovers) {
    let ok = true;
    if (row.anthropic_file_id) {
      if (claude) ok = (await claude.deleteFile(row.anthropic_file_id)) && ok;
      else ok = false;
    }
    if (row.object_name) ok = (await files.remove(row.object_name)) && ok;
    if (ok) cleaned.push(row.id);
    else failed++;
  }
  if (cleaned.length > 0) {
    const { error: cleanedError } = await admin.rpc("course_import_cleaned", { p_ids: cleaned });
    if (cleanedError) {
      console.error("course_import_cleaned:", cleanedError);
      failed++;
    }
  }

  let orphansRemoved = 0;
  for (const name of swept.orphans) {
    if (await files.remove(name)) orphansRemoved++;
    else failed++;
  }

  if (failed > 0) console.error(`course import sweep: ${failed} cleanup(s) failed; they are tried again tomorrow`);
  return NextResponse.json(
    { swept: swept.swept, leftovers: swept.leftovers.length, leftoversCleaned: cleaned.length, orphans: swept.orphans.length, orphansRemoved, failed },
    { status: failed > 0 ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
