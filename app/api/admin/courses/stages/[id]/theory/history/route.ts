import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

/**
 * GET  /api/admin/courses/stages/[id]/theory/history
 *   → list versions (id, version, edited_by, edited_at, editor display_name).
 *
 * POST /api/admin/courses/stages/[id]/theory/history
 *   Body: { versionId, baseUpdatedAt }
 *   → look up the version's blocks and call save_stage_theory with them. Revert
 *     is deliberately just another save (new version snapshot, monotonic
 *     history), not a destructive rewind, so there is no separate write path to
 *     police.
 *
 * Reads go through RLS: course_stage_theory_versions has an "editor read" policy
 * gated by can_edit_course, so an unauthorized caller sees an empty list rather
 * than a permission error.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // The embed rides the versions.edited_by -> profiles.id foreign key.
    const { data, error } = await supabase
      .from("course_stage_theory_versions")
      .select("id, version, edited_at, edited_by, editor:profiles(full_name, display_name)")
      .eq("stage_id", id)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);

    // PostgREST types every FK embed as an array even for a to-one relation.
    type Row = {
      id: string;
      version: number;
      edited_at: string;
      edited_by: string | null;
      editor: { full_name: string | null; display_name: string | null }[] | null;
    };

    const versions = ((data ?? []) as Row[]).map((r) => {
      const editor = r.editor?.[0];
      return {
        id: r.id,
        version: r.version,
        editedAt: r.edited_at,
        editedBy: r.edited_by,
        editorName: editor?.full_name ?? editor?.display_name ?? null,
      };
    });
    return NextResponse.json({ ok: true, versions });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      versionId?: string;
      baseUpdatedAt?: string | null;
    };
    if (!body.versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    const { data: version, error: vErr } = await supabase
      .from("course_stage_theory_versions")
      .select("blocks, stage_id")
      .eq("id", body.versionId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!version || version.stage_id !== id) {
      // RLS may also return null for a version the caller can't see; same 404.
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("save_stage_theory", {
      p_stage_id: id,
      p_blocks: version.blocks,
      p_base_updated_at: body.baseUpdatedAt ?? null,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      const code = (data?.error as string) ?? "unknown";
      const status = code === "forbidden" ? 403 : code === "stale" ? 409 : 400;
      return NextResponse.json({ ok: false, error: code }, { status });
    }
    return NextResponse.json({ ok: true, updatedAt: data.updated_at as string });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/courses/stages/[id]/theory/history
 *   Body: { versionId }
 *   → prune one entry from the version log. Gated by can_edit_course inside
 *     the RPC (030). Does not touch the current stage blocks; safe against
 *     the live optimistic-concurrency token.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { versionId?: string };
    if (!body.versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    // Belt-and-braces: verify the version belongs to the URL's stage before
    // asking the RPC to delete it. The RPC would still refuse (can_edit_course
    // is checked against the version's own stage/course), but this catches a
    // client that ships a mismatched pair with a clean 404 rather than a 403.
    const { data: version, error: vErr } = await supabase
      .from("course_stage_theory_versions")
      .select("stage_id")
      .eq("id", body.versionId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!version || version.stage_id !== id) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("delete_stage_theory_version", {
      p_version_id: body.versionId,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      const code = (data?.error as string) ?? "unknown";
      const status = code === "forbidden" ? 403 : code === "version_not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: code }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
