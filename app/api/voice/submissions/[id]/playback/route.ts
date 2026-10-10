import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";

/**
 * GET /api/voice/submissions/<id>/playback — a fresh signed URL for one take
 * (VOICE-005, docs/decisions/0111). The lesson page signs one at render;
 * a page left open past its 15 minutes (0110 Decision 5) asks here when the
 * audio element fails to load.
 *
 * Takes only the id. The row is read and the URL signed under the caller's
 * own session, so 060's RLS on voice_submissions and the bucket's SELECT
 * policy decide: the owner and the course's editors get a URL, anyone else
 * a 404 (the row is invisible to them), never a hint that it exists.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase.from("voice_submissions").select("object_name").eq("id", id).maybeSingle();
  if (error) {
    // A malformed UUID is a cast error, and to the caller the same as "no such take".
    if (error.code === "22P02") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    console.error("voice playback read:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!data.object_name) return NextResponse.json({ ok: false, error: "removed" }, { status: 410 });

  const signed = await signVoicePlaybackUrl(supabase, data.object_name);
  if (!signed) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json(
    { ok: true, url: signed.url, expiresAt: signed.expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
