import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const UpdateLessonSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});

// PATCH { title, description?, estimatedMinutes? } → update_lesson. Rename +
// description + estimated minutes, in one RPC (044) — deliberately separate
// from the free-sample toggle and the archive action, each its own explicit
// endpoint below, mirroring 0018's "explicit action, not a side effect" rule
// for in_free_sample.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = UpdateLessonSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { title, description, estimatedMinutes } = parsed.data;

    const { data, error } = await supabase.rpc("update_lesson", {
      p_lesson_id: lessonId,
      p_title: title,
      p_description: description ?? null,
      p_estimated_minutes: estimatedMinutes ?? null,
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
