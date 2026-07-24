import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDuel, getMyDuels, DUEL_ERRORS } from "@/lib/duels";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    return NextResponse.json(await getMyDuels(supabase));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const opponentId = String(body.opponentId ?? "");
    const groupId = String(body.groupId ?? "");
    if (!opponentId || !groupId) {
      return NextResponse.json({ error: "Missing opponent or group" }, { status: 400 });
    }

    // Membership, self-duel, duplicate-challenge and pool checks all live in
    // create_duel — the RPC is the authority, not this route.
    const result = await createDuel(supabase, {
      opponentId,
      groupId,
      subject: body.subject ? String(body.subject) : null,
      difficulty: String(body.difficulty ?? "mixed"),
      size: Number(body.size ?? 10),
    });

    if (!result.ok) {
      const code = String(result.error ?? "");
      return NextResponse.json(
        { error: DUEL_ERRORS[code] ?? "Could not create the duel." },
        { status: 400 },
      );
    }

    return NextResponse.json({ duelId: result.duel_id, quizId: result.quiz_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
