import { after, NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pingForHomework } from "@/lib/telegram/homeworkPings";
import { HOMEWORK_NOTE_MAX, homeworkErrorMessage, isHomeworkId, parseAssignInput, parseDueDate } from "@/lib/homework/homework";

/**
 * TCH-005 (docs/decisions/0152) — Studio's homework actions as JSON:
 *   { action: "assign", courseId, lessonId?, dueOn?, note?, studentIds?, groupIds? } -> { id }
 *   { action: "update", assignmentId, dueOn?, note? }                              -> { ok }
 *   { action: "delete", assignmentId }                                             -> { ok }
 *
 * Each is a SECURITY DEFINER RPC (080) that decides who may do it (a teacher;
 * the assignment's own teacher; students linked to that teacher; groups that
 * are theirs). This route validates the shape and relays the RPC's error code
 * as a message.
 *
 * TCH-013 (docs/decisions/0199): once an assign has succeeded, after() asks SQL which of
 * the linked, not-stopped recipients to tell on Telegram and sends it. It runs after the
 * response, never throws, and cannot change the answer above.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const relay = async (call: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await call;
    if (error) return { failure: NextResponse.json({ error: "Something went wrong." }, { status: 500 }) };
    const r = (data ?? {}) as { ok?: boolean; error?: string } & Record<string, unknown>;
    if (!r.ok) {
      const status = r.error === "not_found" ? 404 : r.error === "forbidden" || r.error === "seat_lapsed" ? 403 : 400;
      return { failure: NextResponse.json({ error: homeworkErrorMessage(r.error) }, { status }) };
    }
    return { result: r };
  };

  if (body.action === "assign") {
    const parsed = parseAssignInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const i = parsed.input;
    const out = await relay(
      supabase.rpc("assign_homework", {
        p_course: i.courseId,
        p_lesson: i.lessonId,
        p_due: i.dueOn,
        p_note: i.note,
        p_students: i.studentIds,
        p_groups: i.groupIds,
      }),
    );
    if (out.failure) return out.failure;
    const assignmentId = String(out.result.id);
    after(async () => {
      const summary = await pingForHomework(assignmentId);
      if (summary.claimFailed || summary.notSent > 0 || summary.unreadable > 0) {
        console.error(
          `telegram homework pings: ${summary.notSent} of ${summary.messages} not sent, ${summary.unreadable} unreadable, claim ${summary.claimFailed ? "failed" : "ok"}`,
        );
      }
    });
    return NextResponse.json({ id: out.result.id });
  }

  if (body.action === "update" && isHomeworkId(body.assignmentId)) {
    const dueOn = body.dueOn == null || body.dueOn === "" ? null : parseDueDate(body.dueOn);
    if (body.dueOn != null && body.dueOn !== "" && !dueOn) {
      return NextResponse.json({ error: "That due date isn't a date." }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim() : null;
    if (note && note.length > HOMEWORK_NOTE_MAX) {
      return NextResponse.json({ error: homeworkErrorMessage("invalid_note") }, { status: 400 });
    }
    const out = await relay(
      supabase.rpc("update_homework", { p_assignment: body.assignmentId, p_due: dueOn, p_note: note || null }),
    );
    return out.failure ?? NextResponse.json({ ok: true });
  }

  if (body.action === "delete" && isHomeworkId(body.assignmentId)) {
    const out = await relay(supabase.rpc("delete_homework", { p_assignment: body.assignmentId }));
    return out.failure ?? NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
