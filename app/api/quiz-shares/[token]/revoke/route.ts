import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

// POST → revoke a share the caller owns (Stop sharing). RLS scopes the update to
// the owner's own row, so no ownership check is needed here beyond auth.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const supabase = await createClient();
    const { token } = await params;
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase
      .from("quiz_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", token)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
