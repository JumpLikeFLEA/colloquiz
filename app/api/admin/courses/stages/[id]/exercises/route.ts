import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { validateExercisePayload } from "@/lib/exerciseValidate";

// RPC error codes → sentences. save_stage_exercises (032) holds the only
// authorization (can_edit_course + optimistic concurrency); this route
// validates content and translates the result.
const ERROR_COPY: Record<string, string> = {
  forbidden: "You don't have permission to edit this course.",
  stage_not_found: "This stage no longer exists.",
  stale:
    "Someone else saved this stage while you were editing. Reload to see their changes.",
  invalid_payload: "The exercises payload is not a valid whole-stage save.",
  deletion_blocked:
    "One or more variants you tried to delete are referenced by a saved quiz and cannot be removed.",
};

/**
 * PUT /api/admin/courses/stages/[id]/exercises
 * Body: {
 *   groups: [{ variant_group, siblings: [{ id?, _new?, variant_ordinal, ... }] }],
 *   group_order?: string[],
 *   deleted_ids?: string[],
 *   baseUpdatedAt: string | null,
 * }
 *
 * The single save path for a stage's exercises. Validates the payload with the
 * shared zod + KaTeX pipeline (identical to the theory route's), then calls
 * save_stage_exercises which does UPDATE/INSERT/DELETE in one transaction and
 * writes course_stage_exercises with updated_by = caller. On concurrency
 * mismatch the RPC returns 'stale' and the state is untouched — callers should
 * reload and reapply.
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
      groups?: unknown;
      group_order?: unknown;
      deleted_ids?: unknown;
      baseUpdatedAt?: string | null;
    };

    const result = validateExercisePayload({
      groups: body.groups,
      group_order: body.group_order,
      deleted_ids: body.deleted_ids,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("save_stage_exercises", {
      p_stage_id: id,
      p_payload: result.payload,
      p_base_updated_at: body.baseUpdatedAt ?? null,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      const code = (data?.error as string) ?? "unknown";
      const status =
        code === "forbidden"
          ? 403
          : code === "stale"
            ? 409
            : code === "deletion_blocked"
              ? 409
              : 400;
      return NextResponse.json(
        {
          ok: false,
          error: code,
          message: ERROR_COPY[code] ?? "Save failed.",
          blocked_ids: data?.blocked_ids ?? undefined,
        },
        { status },
      );
    }

    return NextResponse.json({ ok: true, updatedAt: data.updated_at as string });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
