import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ERROR_COPY: Record<string, string> = {
  invalid_share: "This share link is invalid or has been revoked.",
  not_group_members: "You can only send a quiz to someone in one of your groups.",
  cannot_share_with_yourself: "You can't send a quiz to yourself.",
};

// POST { token, recipientId } → notify a group co-member that a quiz was shared
// with them, deep-linking to the /s/[token] landing. Access is already open (the
// snapshot is visibility='shared'); this only delivers the notification. The
// co-member check + notify happen inside the share_quiz_to_member() RPC.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token, recipientId } = (await req.json()) as { token?: string; recipientId?: string };
    if (!token || !recipientId) {
      return NextResponse.json({ error: "Missing token or recipientId" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("share_quiz_to_member", {
      p_token: token,
      p_recipient_id: recipientId,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not send this quiz." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
