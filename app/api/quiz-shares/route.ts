import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

const ERROR_COPY: Record<string, string> = {
  not_found: "That quiz no longer exists.",
  not_shareable: "This quiz can't be shared — it isn't built from the public question bank.",
};

// POST { sourceQuizId } → mint (or reuse) a shared snapshot of the quiz and
// return its share token. Access is granted by the snapshot's visibility='shared'
// (no per-user grant); the token drives the /s/[token] landing, in-app delivery,
// and revocation. Modelled on app/api/groups/[gid]/invite/route.ts.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sourceQuizId } = (await req.json()) as { sourceQuizId?: string };
    if (!sourceQuizId) return NextResponse.json({ error: "Missing sourceQuizId" }, { status: 400 });

    const { data, error } = await supabase.rpc("share_quiz", { p_source_quiz_id: sourceQuizId });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not share this quiz." },
        { status: 400 },
      );
    }

    return NextResponse.json({ token: data.token, snapshotQuizId: data.snapshot_quiz_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
