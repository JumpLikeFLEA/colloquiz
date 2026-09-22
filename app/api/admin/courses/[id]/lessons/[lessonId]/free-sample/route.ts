import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const FreeSampleSchema = z.object({ inFreeSample: z.boolean() });

// POST { inFreeSample } → set_lesson_free_sample (041). Its own explicit
// control, per AUTH-001's acceptance line — never touched by create_lesson,
// update_lesson or publish_lesson.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = FreeSampleSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("set_lesson_free_sample", {
      p_lesson_id: lessonId,
      p_in_free_sample: parsed.data.inFreeSample,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
