import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { parseTelegramLang, startLink } from "@/lib/telegram/messages";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), lang: z.string().max(5).optional(), timeZone: z.string().max(64).optional() }),
  z.object({ action: z.literal("stop") }),
]);

/**
 * POST /api/telegram/link — the signed-in user's own bot link (COH-010,
 * docs/decisions/0173):
 *   { action: "create", lang?, timeZone? } -> { url }     a one-hour t.me deep link
 *   { action: "stop" }                     -> { stopped } "Turn off"
 *
 * Both are SECURITY DEFINER RPCs (090) scoped to auth.uid(); this route takes no
 * user id. The token is returned once inside the link and only its hash is
 * stored. The language and zone are validated in SQL. A plain fetch, not a Server
 * Action, for the same reason as /api/calendar-feed.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const noStore = { "Cache-Control": "no-store, private" };
  if (parsed.data.action === "create") {
    const { data, error } = await supabase.rpc("create_telegram_link_token", {
      p_lang: parseTelegramLang(parsed.data.lang),
      p_time_zone: parsed.data.timeZone ?? null,
    });
    if (error || typeof data !== "string") {
      console.error("create_telegram_link_token failed", error?.code);
      return NextResponse.json({ error: "Could not create the link." }, { status: 500, headers: noStore });
    }
    return NextResponse.json({ url: startLink(data) }, { headers: noStore });
  }

  const { data, error } = await supabase.rpc("stop_my_telegram_link");
  if (error) {
    console.error("stop_my_telegram_link failed", error.code);
    return NextResponse.json({ error: "Could not turn reminders off." }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ stopped: data === true }, { headers: noStore });
}
