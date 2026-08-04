import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { validateTheoryBlocks } from "@/lib/theoryValidate";

// RPC error codes → sentences. save_stage_theory (029) is SECURITY DEFINER and
// holds the only authorization (can_edit_course + optimistic concurrency); this
// route validates content and translates the result.
const ERROR_COPY: Record<string, string> = {
  forbidden: "You don't have permission to edit this course.",
  stage_not_found: "This stage no longer exists.",
  stale: "Someone else saved this stage while you were editing. Reload to see their changes.",
  invalid_blocks: "The blocks payload is not a valid theory block array.",
};

/**
 * PUT /api/admin/courses/stages/[id]/theory
 * Body: { blocks: TheoryBlock[], baseUpdatedAt: string | null }
 *
 * The single save path for stage theory. Validates the payload with the shared
 * zod + KaTeX pipeline (identical to the importer), then calls save_stage_theory,
 * which snapshots the replaced blocks into course_stage_theory_versions and
 * writes the new row with updated_by = caller. On concurrency mismatch the RPC
 * returns 'stale' and the row is untouched — callers should reload and reapply.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      blocks?: unknown;
      baseUpdatedAt?: string | null;
    };

    const result = validateTheoryBlocks(body.blocks);
    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("save_stage_theory", {
      p_stage_id: id,
      p_blocks: result.blocks,
      p_base_updated_at: body.baseUpdatedAt ?? null,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      const code = (data?.error as string) ?? "unknown";
      const status = code === "forbidden" ? 403 : code === "stale" ? 409 : 400;
      return NextResponse.json(
        { ok: false, error: code, message: ERROR_COPY[code] ?? "Save failed." },
        { status },
      );
    }

    return NextResponse.json({ ok: true, updatedAt: data.updated_at as string });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
