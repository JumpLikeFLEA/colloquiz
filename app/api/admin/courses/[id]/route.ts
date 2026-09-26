import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { CEFR_LEVELS } from "@/lib/courseLevels";
import { COURSE_SUBTITLE_MAX_LENGTH } from "@/lib/courseCatalogue";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const UpdateCourseSchema = z.object({
  title: z.string().trim().min(1),
  level: z.enum(CEFR_LEVELS),
  description: z.string().trim().optional(),
  // Nullable, not just optional: the client must be able to explicitly
  // clear a previously-set subtitle/cover, not merely omit it (update_course
  // is a full-record replace — see migration 047).
  subtitle: z.string().trim().max(COURSE_SUBTITLE_MAX_LENGTH).nullable().optional(),
  coverImageUrl: z.string().trim().url().nullable().optional(),
});

// PATCH { title, level, description?, subtitle?, coverImageUrl? } →
// update_course. can_edit_course-gated inside the RPC (admin or a delegated
// editor of this course).
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
    const { title, level, description, subtitle, coverImageUrl } = parsed.data;

    const { data, error } = await supabase.rpc("update_course", {
      p_course_id: id,
      p_title: title,
      p_description: description ?? null,
      p_level: level,
      p_subtitle: subtitle ?? null,
      p_cover_image_url: coverImageUrl ?? null,
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
