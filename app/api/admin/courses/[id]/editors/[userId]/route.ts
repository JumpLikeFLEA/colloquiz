import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

// DELETE → revoke_course_editor (029, unchanged by this card).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id, userId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.rpc("revoke_course_editor", {
      p_course_id: id,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === "forbidden" ? "You don't have permission to do that." : "Could not remove editor." },
        { status: result.error === "forbidden" ? 403 : 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
