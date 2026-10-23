import { NextResponse, type NextRequest } from "next/server";
import { sendWeekPings } from "@/lib/telegram/weekPings";

/**
 * GET /api/cron/telegram-reminders — the daily Telegram reminders (COH-012,
 * docs/decisions/0197), scheduled in vercel.json. Today: "week N is open"
 * (docs/decisions/0140 event 1); COH-013 adds the call digest to this same route.
 *
 * telegram_week_ping_claim() (migration 099, service_role only) decides which
 * (enrolment, week) is due and logs it before this route sends; the route words the text
 * and sends it (lib/telegram/weekPings.ts). A send that fails is counted, not retried:
 * the log row is already written (docs/decisions/0177 Decision 4).
 *
 * Same guard as voice-purge (docs/decisions/0110): without CRON_SECRET, and its Bearer
 * header, it refuses everything.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = await sendWeekPings();
  if (weeks.claimFailed) console.error("telegram_week_ping_claim failed");
  if (weeks.notSent > 0 || weeks.unreadable > 0) {
    console.error(`telegram reminders: ${weeks.notSent} not sent, ${weeks.unreadable} unreadable of ${weeks.claimed} claimed`);
  }

  return NextResponse.json(
    { weeks },
    { status: weeks.claimFailed ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
