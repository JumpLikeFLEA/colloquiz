import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { grantErrorMessage } from "@/lib/courseGrants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * TCH-009 (docs/decisions/0164) — a teacher opens or closes a self-paced course
 * for a linked student, as JSON:
 *   { action: "grant" | "revoke", courseId, studentId } -> { ok, already? }
 *
 * Both are SECURITY DEFINER RPCs (087) that decide everything: that the caller
 * edits the course, that the seat can write, that the student is a live link,
 * which rows are teacher-made. This route validates the shape and relays the
 * RPC's error code as a message. It never writes course_entitlements itself.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { action?: unknown; courseId?: unknown; studentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if ((body.action !== "grant" && body.action !== "revoke") || !isId(body.courseId) || !isId(body.studentId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } =
    body.action === "grant"
      ? await supabase.rpc("teacher_grant_course", { p_course: body.courseId, p_student: body.studentId })
      : await supabase.rpc("teacher_revoke_course_grant", { p_course: body.courseId, p_student: body.studentId });
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });

  const r = (data ?? {}) as { ok?: boolean; error?: string; already?: boolean };
  if (!r.ok) {
    const status = r.error === "forbidden" || r.error === "seat_lapsed" ? 403 : 400;
    return NextResponse.json({ error: grantErrorMessage(r.error) }, { status });
  }
  return NextResponse.json({ ok: true, already: r.already === true });
}
