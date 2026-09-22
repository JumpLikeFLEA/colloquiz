import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const ReorderSchema = z.object({ lessonIds: z.array(z.string().uuid()).min(1) });

// POST { lessonIds: uuid[] } → reorder_lessons. The FULL new order, not a
// single move — see reorder_lessons' header (migration 044) for why the RPC
// requires the complete permutation of the course's lesson ids.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = ReorderSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid lesson list" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("reorder_lessons", {
      p_course_id: id,
      p_lesson_ids: parsed.data.lessonIds,
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
