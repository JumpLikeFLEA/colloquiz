import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ERROR_COPY: Record<string, string> = {
  invalid_invite: "This invite link is invalid or has been revoked.",
  not_authenticated: "Please sign in to join this group.",
};

// Any signed-in user may accept a group invite. The token is resolved inside
// the accept_group_invite() SECURITY DEFINER RPC, which binds the new
// membership to auth.uid() — a caller can never add a third party.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = (await req.json()) as { token?: string };
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const { data, error } = await supabase.rpc("accept_group_invite", { p_token: token });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not join this group." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      groupId: data.group_id,
      groupName: data.group_name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
