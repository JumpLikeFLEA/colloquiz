import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupOwner } from "@/lib/groups";

// Clone of app/api/invites/route.ts, scoped to a group instead of a tutor.

// GET → the group's current active invite token (creating one if none exists).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupOwner(supabase, gid);
    if (auth.error) return auth.error;

    const { data: existing } = await supabase
      .from("group_invites")
      .select("token")
      .eq("group_id", gid)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return NextResponse.json({ token: existing.token });

    const { data: created, error } = await supabase
      .from("group_invites")
      .insert({ group_id: gid })
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
export async function POST(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupOwner(supabase, gid);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    if (body.rotate) {
      await supabase
        .from("group_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("group_id", gid)
        .is("revoked_at", null);
    }

    const { data: created, error } = await supabase
      .from("group_invites")
      .insert({ group_id: gid })
      .select("token")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ token: created.token });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
