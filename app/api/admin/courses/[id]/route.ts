import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { CEFR_LEVELS } from "@/lib/courseLevels";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const UpdateCourseSchema = z.object({
  title: z.string().trim().min(1),
  level: z.enum(CEFR_LEVELS),
  description: z.string().trim().optional(),
});

// PATCH { title, level, description? } → update_course. can_edit_course-gated
// inside the RPC (admin or a delegated editor of this course).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = UpdateCourseSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { title, level, description } = parsed.data;

    const { data, error } = await supabase.rpc("update_course", {
      p_course_id: id,
      p_title: title,
      p_description: description ?? null,
      p_level: level,
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
