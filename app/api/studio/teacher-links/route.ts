import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TCH-001 (docs/decisions/0148) — Studio's two link actions as JSON:
 *   { action: "rotate" }            -> { token }   (create or replace the join link)
 *   { action: "remove", linkId }    -> { ok }      (end a student's link)
 *
 * Both are SECURITY DEFINER RPCs (076) that decide who may do it
 * (`_is_teacher` for rotate; party-to-the-link for remove). This route only
 * relays, so the raw token passes through once and is never logged.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { action?: unknown; linkId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action === "rotate") {
    const { data, error } = await supabase.rpc("rotate_teacher_join_token");
    if (error) return NextResponse.json({ error: "Could not create the link." }, { status: 500 });
    const r = data as { ok?: boolean; token?: string; error?: string };
    if (!r.ok || typeof r.token !== "string") {
      return NextResponse.json({ error: "You can't create a student link." }, { status: r.error === "forbidden" ? 403 : 400 });
    }
    return NextResponse.json({ token: r.token }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "remove" && typeof body.linkId === "string" && UUID.test(body.linkId)) {
    const { data, error } = await supabase.rpc("end_teacher_link", { p_link_id: body.linkId });
    if (error) return NextResponse.json({ error: "Could not remove the student." }, { status: 500 });
    if (!(data as { ok?: boolean })?.ok) return NextResponse.json({ error: "That link is already gone." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
