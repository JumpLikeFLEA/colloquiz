import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tutor unassigns a quiz. RLS restricts the delete to the tutor's own rows.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", id)
      .eq("tutor_id", user.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
