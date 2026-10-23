import { NextResponse, type NextRequest } from "next/server";
import { sendWeekPings } from "@/lib/telegram/weekPings";
import { sendCallPings } from "@/lib/telegram/callPings";

/**
 * GET /api/cron/telegram-reminders — the daily Telegram reminders, scheduled in
 * vercel.json: "week N is open" (COH-012, docs/decisions/0197; 0140 event 1) and the
 * digest of an extended enrolee's calls that start soon (COH-013, docs/decisions/0198;
 * 0140 event 4).
 *
 * telegram_week_ping_claim() (migration 099) and telegram_call_ping_claim() (migration
 * 100), both service_role only, decide which (enrolment, week) or (enrolment, call) is due
 * and log it before this route sends; the route words the text and sends it
 * (lib/telegram/weekPings.ts, callPings.ts). A send that fails is counted, not retried:
 * the log row is already written (docs/decisions/0177 Decision 4). The two jobs are
 * independent: one failing (say a migration not applied yet) does not stop the other.
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
    console.error(`telegram week pings: ${weeks.notSent} not sent, ${weeks.unreadable} unreadable of ${weeks.claimed} claimed`);
  }

  const calls = await sendCallPings();
  if (calls.claimFailed) console.error("telegram_call_ping_claim failed");
  if (calls.notSent > 0 || calls.unreadable > 0) {
    console.error(
      `telegram call pings: ${calls.notSent} of ${calls.messages} messages not sent, ${calls.unreadable} unreadable of ${calls.claimed} claimed`,
    );
  }

  return NextResponse.json(
    { weeks, calls },
    { status: weeks.claimFailed || calls.claimFailed ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
