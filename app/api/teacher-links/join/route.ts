import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { JOIN_TOKEN_PATTERN, joinPath } from "@/lib/teacherLinks";

/**
 * TCH-001 (docs/decisions/0148) — the join page's "Join" button posts a plain
 * HTML form here, the /api/invites/claim precedent: no client JS on the page,
 * and a POST so a link preview or prefetch can't link anyone.
 *
 * join_teacher (076) does all of it: it resolves the token, refuses a
 * teacher joining themselves and writes ONE active link (a second join is a
 * no-op). Success goes to /my, where the new teacher is listed with Leave;
 * any refusal goes back to the join page, which asks teacher_join_preview
 * again and renders that state, so the reason shown is SQL's.
 */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  let token = "";
  try {
    const raw = (await request.formData()).get("token");
    if (typeof raw === "string") token = raw;
  } catch {
    // Not a form body: treated as a malformed token below.
  }
  if (!JOIN_TOKEN_PATTERN.test(token)) return NextResponse.redirect(`${origin}/`, 303);
  const back = `${origin}${joinPath(token)}`;

  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) {
    const params = new URLSearchParams({ next: joinPath(token) });
    return NextResponse.redirect(`${origin}/login?${params.toString()}`, 303);
  }

  const { data, error } = await supabase.rpc("join_teacher", { p_token: token });
  if (error) {
    console.error("join_teacher failed", error.message);
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.redirect((data as { ok?: boolean })?.ok ? `${origin}/my` : back, 303);
}
