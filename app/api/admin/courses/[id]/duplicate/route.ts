import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { discardCopies, prepareCourseCopy } from "@/lib/duplicateServer";

// POST → duplicate_course (107): an unpublished, unlisted draft copy with its
// lessons' latest drafts and the caller as editor. The new course id is chosen
// here so the copied images can sit under its prefix before the row exists
// (lib/duplicateServer.ts); a refused or failed RPC removes them again.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const newCourseId = randomUUID();
    const prepared = await prepareCourseCopy(supabase, user.id, id, newCourseId);
    if ("refusal" in prepared) return NextResponse.json(prepared.refusal.body, { status: prepared.refusal.status });

    const { data, error } = await supabase.rpc("duplicate_course", {
      p_course_id: id,
      p_new_course_id: newCourseId,
      p_url_map: prepared.urlMap,
    });
    const result = data as { ok: boolean; error?: string; course_id?: string } | null;
    if (error || !result?.ok) {
      await discardCopies(prepared.plan);
      if (error) throw new Error(error.message);
      const { status, body } = courseAuthoringErrorResponse(result?.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true, courseId: result.course_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
