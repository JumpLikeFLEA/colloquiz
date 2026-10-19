import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PEER_ID_PATTERN } from "@/lib/messages/messages";

/**
 * docs/decisions/0178 — POST { studentId } -> { ok: true, dismissed }.
 *
 * "No reply needed" on a Studio thread. The caller is the teacher;
 * dismiss_conversation (092) takes the teacher from auth.uid(), records the
 * thread's last message when it is the student's, and message_threads then
 * stops counting the thread as unanswered until the student writes again.
 * A caller who is not that conversation's teacher gets not_found from SQL,
 * mapped to a 404 here.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let json: { studentId?: unknown };
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { studentId } = json;
  if (typeof studentId !== "string" || !PEER_ID_PATTERN.test(studentId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("dismiss_conversation", { p_student: studentId });
  if (error) {
    console.error("dismiss_conversation failed", error.message);
    return NextResponse.json({ error: "Could not update the conversation." }, { status: 500 });
  }
  const result = data as { ok?: boolean; error?: string; dismissed?: boolean } | null;
  if (!result?.ok) {
    const status = result?.error === "unauthenticated" ? 401 : 404;
    return NextResponse.json({ error: "Conversation not found." }, { status });
  }
  return NextResponse.json({ ok: true, dismissed: result.dismissed === true }, { headers: { "Cache-Control": "no-store" } });
}
