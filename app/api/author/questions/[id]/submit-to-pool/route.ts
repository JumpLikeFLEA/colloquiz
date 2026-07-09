import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthor } from "@/lib/authorQuiz";

// Promote an already-created private question into the shared pool, where it
// enters the existing admin review queue (status → pending). The author keeps
// read access via the creator-read policy.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;
    const { id } = await params;

    const { error } = await supabase
      .from("questions")
      .update({ visibility: "shared", status: "pending" })
      .eq("id", id)
      .eq("created_by", user.id)
      .eq("visibility", "private");
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
