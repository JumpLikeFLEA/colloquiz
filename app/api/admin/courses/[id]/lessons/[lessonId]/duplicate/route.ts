import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { discardCopies, prepareLessonCopy } from "@/lib/duplicateServer";

// POST → duplicate_lesson (107): a copy of the lesson's latest draft, in the
// same course, unpublished. Its images are copied to objects of their own
// first (lib/duplicateServer.ts); a refused or failed RPC removes them again.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { id, lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prepared = await prepareLessonCopy(supabase, user.id, id, lessonId);
    if ("refusal" in prepared) return NextResponse.json(prepared.refusal.body, { status: prepared.refusal.status });

    const { data, error } = await supabase.rpc("duplicate_lesson", { p_lesson_id: lessonId, p_url_map: prepared.urlMap });
    const result = data as { ok: boolean; error?: string; lesson_id?: string } | null;
    if (error || !result?.ok) {
      await discardCopies(prepared.plan);
      if (error) throw new Error(error.message);
      const { status, body } = courseAuthoringErrorResponse(result?.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true, lessonId: result.lesson_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
