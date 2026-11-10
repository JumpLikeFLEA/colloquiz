import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { checkWritingBody, WRITING_ERROR_STATUS } from "@/lib/writing/answer";

/**
 * POST /api/writing/submissions — send (or resend) a written answer
 * (WRITE-002, docs/decisions/0225). Body: { lessonId, blockId, body }.
 *
 * Every rule that matters is submit_writing_answer's (migration 109), run
 * under the caller's session: a published writing task with the send ticked,
 * the lesson open, a route (cohort or linked), the slot not locked. This route
 * only normalises the text (CRLF to LF, trimmed, at most 4,000 characters)
 * and maps each refusal to a status. The body is never logged.
 */

type SubmitResult =
  | { ok: true; submission_id: string; route: string; resent: boolean }
  | { ok: false; error: string };

function id(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= 128 ? v : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let input: Record<string, unknown> = {};
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    // Treated as missing fields below.
  }
  const lessonId = id(input.lessonId);
  const blockId = id(input.blockId);
  if (!lessonId || !blockId) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const checked = checkWritingBody(input.body);
  if (!checked.ok) {
    return NextResponse.json({ ok: false, error: checked.error }, { status: 422 });
  }

  const { data, error } = await supabase.rpc("submit_writing_answer", {
    p_lesson_id: lessonId,
    p_block_id: blockId,
    p_body: checked.body,
  });
  if (error) {
    // A malformed UUID is a cast error before the function body runs.
    if (error.code === "22P02") {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }
    console.error("submit_writing_answer:", error.code, error.message);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }

  const result = data as SubmitResult;
  if (!result.ok) {
    return NextResponse.json(result, { status: WRITING_ERROR_STATUS[result.error] ?? 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { ok: true, submissionId: result.submission_id, route: result.route, resent: result.resent },
    { headers: { "Cache-Control": "no-store" } },
  );
}
