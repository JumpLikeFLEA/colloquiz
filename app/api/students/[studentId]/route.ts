import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tutor unlinks a student. RLS restricts the delete to links the caller owns.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { studentId } = await params;
    const { error } = await supabase
      .from("tutor_students")
      .delete()
      .eq("tutor_id", user.id)
      .eq("student_id", studentId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
