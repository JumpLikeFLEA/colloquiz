import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { parseCalendarLang } from "@/lib/calendar/labels";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rotate"), lang: z.string().max(5).optional() }),
  z.object({ action: z.literal("revoke") }),
]);

/**
 * POST /api/calendar-feed — the signed-in user's own feed address (COH-016,
 * docs/decisions/0160):
 *   { action: "rotate", lang? } -> { url }   creates the token, or replaces it
 *   { action: "revoke" }        -> { revoked } turns the feed off
 *
 * Both are SECURITY DEFINER RPCs (086) scoped to auth.uid(); this route takes no
 * user id. The new address is returned ONCE and never stored: only its hash is
 * (so it cannot be shown again, only replaced). Nothing here is cached.
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
  if (parsed.data.action === "rotate") {
    const { data, error } = await supabase.rpc("rotate_calendar_feed_token");
    if (error || typeof data !== "string") {
      console.error("rotate_calendar_feed_token failed", error?.code);
      return NextResponse.json({ error: "Could not create the link." }, { status: 500, headers: noStore });
    }
    const lang = parseCalendarLang(parsed.data.lang);
    const url = `${request.nextUrl.origin}/api/calendar/${data}.ics${lang === "ru" ? "?lang=ru" : ""}`;
    return NextResponse.json({ url }, { headers: noStore });
  }

  const { data, error } = await supabase.rpc("revoke_calendar_feed_token");
  if (error) {
    console.error("revoke_calendar_feed_token failed", error.code);
    return NextResponse.json({ error: "Could not turn the feed off." }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ revoked: data === true }, { headers: noStore });
}
