import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN_PATTERN, invitePath } from "@/lib/runInvites";

/**
 * COH-003 (docs/decisions/0107) — the claim page's "Join" button posts a
 * plain HTML form here, so claiming needs no client JS on the page (the
 * /auth/sign-out precedent, docs/decisions/0086).
 *
 * claim_run_invite (059) does all of it in one call: it locks the invite,
 * checks it, writes ONE run_enrolments row and marks the invite claimed.
 * On success the browser is sent to the course page with a 303. On any
 * refusal it goes back to the claim page, which asks run_invite_preview
 * again and renders that state (used, expired, revoked, already in the
 * run), so the reason shown is SQL's, not a copy of it here.
 *
 * POST only, for the same reason as sign-out: a GET that writes can be
 * fired by a link preview or a prefetch. A cross-site POST carries no
 * session, because @supabase/ssr's cookies are SameSite=Lax (see
 * app/auth/sign-out/route.ts), so it can only reach the signed-out branch.
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
  if (!INVITE_TOKEN_PATTERN.test(token)) {
    return NextResponse.redirect(`${origin}/`, 303);
  }
  const back = `${origin}${invitePath(token)}`;

  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) {
    const params = new URLSearchParams({ next: invitePath(token) });
    return NextResponse.redirect(`${origin}/login?${params.toString()}`, 303);
  }

  const { data, error } = await supabase.rpc("claim_run_invite", { p_token: token });
  if (error) {
    console.error("claim_run_invite failed", error.message);
    return NextResponse.redirect(back, 303);
  }
  const result = data as { ok: boolean; course_slug?: string };
  if (result.ok && typeof result.course_slug === "string") {
    return NextResponse.redirect(`${origin}/courses/${encodeURIComponent(result.course_slug)}`, 303);
  }
  return NextResponse.redirect(back, 303);
}
