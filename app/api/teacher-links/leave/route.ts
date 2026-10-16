import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TCH-001 (docs/decisions/0148) — "Leave" on /my, a plain form POST after a
 * native confirm step on the page. end_teacher_link (076) ends the link only
 * if the caller is a party to it; anyone else gets `not_found`, so a guessed
 * id reveals nothing. Always returns to /my, which re-reads the list.
 */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  let linkId = "";
  try {
    const raw = (await request.formData()).get("linkId");
    if (typeof raw === "string") linkId = raw;
  } catch {
    // Not a form body: ignored below.
  }

  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) {
    return NextResponse.redirect(`${origin}/login?${new URLSearchParams({ next: "/my" }).toString()}`, 303);
  }
  if (UUID.test(linkId)) {
    const { error } = await supabase.rpc("end_teacher_link", { p_link_id: linkId });
    if (error) console.error("end_teacher_link failed", error.message);
  }
  return NextResponse.redirect(`${origin}/my`, 303);
}
