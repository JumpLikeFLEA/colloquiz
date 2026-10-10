import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { LESSON_ACCESS_LEVELS } from "@/lib/lessonAccessLevels";

const AccessLevelSchema = z.object({ accessLevel: z.enum(LESSON_ACCESS_LEVELS) });

// POST { accessLevel } → set_lesson_access_level (055, docs/decisions/0094
// Decision 1). Replaces the free-sample route (AUTH-009). Its own explicit
// control, never touched by create_lesson, update_lesson or publish_lesson
// (0018 Decision 4). The RPC is the authority: it checks can_edit_course and
// refuses to leave a published course with no lesson open to anyone
// (no_open_lesson); this route only maps its result.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = AccessLevelSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("set_lesson_access_level", {
      p_lesson_id: lessonId,
      p_level: parsed.data.accessLevel,
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
