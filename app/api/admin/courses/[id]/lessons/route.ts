import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { slugifyLessonTitle } from "@/lib/lessonSlug";

const CreateLessonSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

// POST { title, description? } → create_lesson. The slug is computed here
// from the title via lib/lessonSlug.ts (CNT-010, docs/decisions/0044
// addendum) and sent as p_slug — the RPC itself only validates format and
// suffixes on collision; it no longer derives a slug from p_title, since its
// old ASCII-only regex collapsed a Cyrillic title (the norm for this
// audience) to a meaningless fallback.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = CreateLessonSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { title, description } = parsed.data;

    const { data, error } = await supabase.rpc("create_lesson", {
      p_course_id: id,
      p_title: title,
      p_slug: slugifyLessonTitle(title),
      p_description: description ?? null,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; lesson_id?: string; slug?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ lessonId: result.lesson_id, slug: result.slug });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
