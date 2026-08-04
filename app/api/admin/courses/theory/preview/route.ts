import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { renderToHtml } from "@/lib/richText";
import { validateTheoryBlocks, theoryBlockFields } from "@/lib/theoryValidate";

/**
 * Live preview endpoint for the StageEditor. Takes a blocks array, validates it
 * (shared zod + KaTeX pipeline), and returns per-authored-string rendered HTML
 * so the editor renders the exact same output learners will see. On failure,
 * returns the same per-block error shape the Save path uses so the two match
 * character-for-character.
 *
 * NOT gated on COURSES_ENABLED: the editor works while the feature is dormant.
 * Anyone with an authoring seat (admin or any course_editor) may preview — the
 * preview reveals nothing course-specific, so we do not resolve a specific
 * course here; the Save path is where per-course authorization lives (029's
 * save_stage_theory guards can_edit_course).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Gate: an admin OR someone with at least one course_editors row.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    let allowed = profile?.role === "admin";
    if (!allowed) {
      const { count } = await supabase
        .from("course_editors")
        .select("course_id", { count: "exact", head: true });
      allowed = (count ?? 0) > 0;
    }
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { blocks?: unknown };
    const result = validateTheoryBlocks(body.blocks);
    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: result.errors }, { status: 200 });
    }

    // One rendered HTML per authored string, addressed by blockIndex + field.
    const rendered = result.blocks.map((block, blockIndex) => ({
      blockIndex,
      type: block.type,
      fields: theoryBlockFields(block).map(({ field, value }) => ({
        field,
        html: renderToHtml(value),
      })),
    }));
    return NextResponse.json({ ok: true, rendered });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
