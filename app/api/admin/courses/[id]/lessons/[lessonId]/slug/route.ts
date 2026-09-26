import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { LESSON_SLUG_RE } from "@/lib/lessonSlug";

const SlugSchema = z.object({ slug: z.string().regex(LESSON_SLUG_RE) });

// POST { slug } → update_lesson_slug (CNT-010, migration 046). Its own
// explicit control, separate from the lesson PATCH route — same "explicit
// action, not a side effect" pattern as free-sample/route.ts. Refuses with
// slug_frozen once the lesson has ever been published, and with
// lesson_slug_taken on a collision within the course (never silently
// suffixed — that's create_lesson's behaviour, not an edit's).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = SlugSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Slug must be lowercase letters, numbers and hyphens only." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("update_lesson_slug", {
      p_lesson_id: lessonId,
      p_slug: parsed.data.slug,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; slug?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true, slug: result.slug });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
