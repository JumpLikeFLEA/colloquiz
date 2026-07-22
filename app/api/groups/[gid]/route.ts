import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupOwner } from "@/lib/groups";

// PATCH { name?, description? } → rename / re-describe (owner only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupOwner(supabase, gid);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
    };

    const update: Record<string, string | null> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 60) {
        return NextResponse.json(
          { error: "Group name must be between 2 and 60 characters." },
          { status: 400 },
        );
      }
      update.name = name;
    }
    if (body.description !== undefined) {
      update.description = body.description.trim() || null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await supabase.from("groups").update(update).eq("id", gid);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE → destroy the group (owner only).
//
// This is heavier than it looks: group_members, group_invites and the group's
// quizzes/questions all cascade off groups, and results/sessions/assignments
// already cascade off quizzes (migration 012). Every recorded attempt of the
// group's quizzes goes with it, which is why the UI confirms first.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupOwner(supabase, gid);
    if (auth.error) return auth.error;

    const { error } = await supabase.from("groups").delete().eq("id", gid);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
