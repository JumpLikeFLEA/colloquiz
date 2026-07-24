import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondToDuel, cancelDuel, DUEL_ERRORS } from "@/lib/duels";

/**
 * Accept or decline a challenge (opponent), or cancel it (challenger).
 *
 * Starting a leg is deliberately NOT here: the duel clock is stamped by
 * start_duel_leg_for_quiz() from the quiz page, once the session is confirmed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action } = (await req.json()) as { action?: string };

    const result =
      action === "accept"
        ? await respondToDuel(supabase, id, true)
        : action === "decline"
          ? await respondToDuel(supabase, id, false)
          : action === "cancel"
            ? await cancelDuel(supabase, id)
            : { ok: false, error: "unknown_action" };

    if (!result.ok) {
      const code = String(result.error ?? "");
      return NextResponse.json(
        { error: DUEL_ERRORS[code] ?? "That action isn't available." },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
