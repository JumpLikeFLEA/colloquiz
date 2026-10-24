import { after, NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runImportById } from "@/lib/courseImport/server";
import { shouldReclaim } from "@/lib/courseImport/steps";
import { IMPORT_STATUS_COLUMNS, importStatusView, type ImportStatusRow } from "@/lib/courseImport/status";

/**
 * GET /api/studio/imports/<id> — where one import stands (CNT-018, docs/decisions/0203). The
 * import page polls it.
 *
 * Read under the caller's own session: course_imports' RLS (103) lets the owner read their own
 * rows, and only the granted columns (no lease, no drafted lessons, no object name).
 *
 * It is also the way a stalled run is picked up again, since there is no webhook and no queue:
 * a row that is not finished and has not moved for 10 s is offered to the pipeline. The offer is
 * only a hint. course_import_claim is atomic and refuses while any lease is live, so a poll that
 * arrives while a run is working changes nothing.
 */
export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers });

  try {
    const { data, error } = await supabase.from("course_imports").select(IMPORT_STATUS_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers });

    const row = data as ImportStatusRow;
    if (shouldReclaim(row.status, row.updated_at, Date.now())) {
      after(() => runImportById(id));
    }
    return NextResponse.json(importStatusView(row), { headers });
  } catch (error) {
    // A malformed UUID is a cast error, and to the caller the same as "no such import".
    if ((error as { code?: string }).code === "22P02") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers });
    }
    console.error("course import status read:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500, headers });
  }
}
