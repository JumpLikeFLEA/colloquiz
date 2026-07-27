import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

const ERROR_COPY: Record<string, string> = {
  invalid_invite: "This invite link is invalid or has been revoked.",
  own_invite: "You can't accept your own invite link.",
  not_authenticated: "Please sign in to accept this invite.",
};

// Any signed-in user (the student) may accept an invite. The link is resolved
// inside the accept_tutor_invite() SECURITY DEFINER RPC.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = (await req.json()) as { token?: string };
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const { data, error } = await supabase.rpc("accept_tutor_invite", { p_token: token });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not accept this invite." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, tutorName: data.tutor_name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
