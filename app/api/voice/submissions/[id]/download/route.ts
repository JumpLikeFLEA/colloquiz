import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { decideRecordingDownload } from "@/lib/voice/download";
import { signVoiceDownloadUrl } from "@/lib/voice/storage";

/**
 * GET /api/voice/submissions/<id>/download — the owner's own take as a file (PROG-019,
 * docs/decisions/0235 "Playback and downloads", 0243). Redirects to a 60-second signed URL that
 * downloads under a readable name.
 *
 * Unlike playback, a course editor may NOT: RLS lets them read the row and the bucket policy lets
 * them sign it (060), so the owner is checked twice, in the query (`user_id` = caller) and in
 * `decideRecordingDownload`, BEFORE anything is signed. Anyone but the owner gets the same 404 as
 * for no take; the owner's purged take is 410.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });

  const { data, error } = await supabase
    .from("voice_submissions")
    .select("user_id, object_name, content_type, submitted_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
    console.error("voice download read:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500, headers: NO_STORE });
  }

  const decision = decideRecordingDownload(data, user.id);
  if (decision.kind === "not_found") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
  if (decision.kind === "gone") return NextResponse.json({ ok: false, error: "removed" }, { status: 410, headers: NO_STORE });

  const url = await signVoiceDownloadUrl(supabase, decision.objectName, decision.fileName);
  if (!url) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE });
}
