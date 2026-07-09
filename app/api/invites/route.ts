import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthor } from "@/lib/authorQuiz";

// GET → the tutor's current active invite token (creating one if none exists).
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;

    const { data: existing } = await supabase
      .from("tutor_invites")
      .select("token")
      .eq("tutor_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return NextResponse.json({ token: existing.token });

    const { data: created, error } = await supabase
      .from("tutor_invites")
      .insert({ tutor_id: user.id })
      .select("token")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ token: created.token });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { rotate: true } → revoke all active invites and issue a fresh token.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;

    const body = await req.json().catch(() => ({}));
    if (body.rotate) {
      await supabase
        .from("tutor_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("tutor_id", user.id)
        .is("revoked_at", null);
    }

    const { data: created, error } = await supabase
      .from("tutor_invites")
      .insert({ tutor_id: user.id })
      .select("token")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ token: created.token });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
