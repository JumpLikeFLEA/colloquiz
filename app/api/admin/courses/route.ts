import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { CEFR_LEVELS } from "@/lib/courseLevels";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const CreateCourseSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  level: z.enum(CEFR_LEVELS),
  description: z.string().trim().optional(),
});

// POST { slug, title, level, description? } → create a course. Admin-only —
// see create_course's authorization note (migration 044): a course has no
// editors yet at creation time, so this is gated on is_admin, not
// can_edit_course. The RPC is the authority; this route only shapes the
// request and maps its error back to HTTP.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = CreateCourseSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { slug, title, level, description } = parsed.data;

    const { data, error } = await supabase.rpc("create_course", {
      p_slug: slug,
      p_title: title,
      p_level: level,
      p_description: description ?? null,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; course_id?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ courseId: result.course_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
