import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PEER_ID_PATTERN, parseMessageBody, sendErrorResponse } from "@/lib/messages/messages";

/**
 * TCH-004 (docs/decisions/0151) — POST a message, as JSON:
 *   { teacherId, studentId, body, attachment? }  -> { ok: true }
 *
 * TCH-006 (docs/decisions/0153): `attachment` is the frozen exercise a student
 * asks about (lib/askTeacher). It is relayed as-is to the four-argument
 * send_teacher_message, which keeps only the version id, block and response
 * from it, requires the block to equal the version's own and writes the names
 * and number itself. Without one the three-argument form is called, so plain
 * messages work even before migration 081 is applied. This route only bounds
 * the size so an oversized request doesn't cost a round trip.
 *
 * The caller must be the teacher or the student; send_teacher_message (079)
 * decides everything else: that the link is live, that the teacher is still a
 * teacher, that the body fits the shape and the 2,000-character cap, and that
 * the author is under 30 messages an hour (a PT429 from the insert trigger).
 * This route only relays and maps the refusals to statuses. The body is
 * checked here too, against the same shape, so an obviously bad request
 * doesn't cost a round trip; the database is still the authority.
 */
/** Above the database's own 40,000-character cap on a stored snapshot, to leave
 * room for the display fields it rewrites; a request past this is not one. */
const ATTACHMENT_REQUEST_MAX_CHARS = 60_000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let json: { teacherId?: unknown; studentId?: unknown; body?: unknown; attachment?: unknown };
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { teacherId, studentId } = json;
  if (typeof teacherId !== "string" || !PEER_ID_PATTERN.test(teacherId) || typeof studentId !== "string" || !PEER_ID_PATTERN.test(studentId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parseMessageBody(json.body);
  if (!body) {
    const { status, message } = sendErrorResponse("invalid_body");
    return NextResponse.json({ error: message }, { status });
  }

  const attachment = json.attachment;
  if (attachment !== undefined && attachment !== null) {
    const size = typeof attachment === "object" && !Array.isArray(attachment) ? JSON.stringify(attachment).length : -1;
    if (size < 0 || size > ATTACHMENT_REQUEST_MAX_CHARS) {
      const { status, message } = sendErrorResponse("attachment_invalid");
      return NextResponse.json({ error: message }, { status });
    }
  }

  const { data, error } =
    attachment === undefined || attachment === null
      ? await supabase.rpc("send_teacher_message", { p_teacher: teacherId, p_student: studentId, p_body: body })
      : await supabase.rpc("send_teacher_message", {
          p_teacher: teacherId,
          p_student: studentId,
          p_body: body,
          p_attachment: attachment,
        });
  if (error) {
    // PT429 is the insert trigger's rate limit (079); matched on the code,
    // never the message.
    if (error.code === "PT429") {
      const { status, message } = sendErrorResponse("rate_limited");
      return NextResponse.json({ error: message }, { status, headers: { "Retry-After": "600" } });
    }
    console.error("send_teacher_message failed", error.message);
    return NextResponse.json({ error: "Could not send the message." }, { status: 500 });
  }

  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    const { status, message } = sendErrorResponse(result?.error ?? "");
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
