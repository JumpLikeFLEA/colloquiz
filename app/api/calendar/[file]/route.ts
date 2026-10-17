import { NextResponse, type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { buildIcs, type FeedRow } from "@/lib/calendar/ics";
import { parseCalendarLang } from "@/lib/calendar/labels";

/**
 * GET /api/calendar/<token>.ics — a private calendar subscription (COH-016,
 * docs/decisions/0160). UNAUTHENTICATED on purpose: a calendar app cannot sign
 * in, so the token in the path is the credential. calendar_feed(token) (086)
 * hashes it, finds the user and returns that user's rows from the same reader
 * the pages use. An unknown, replaced, revoked or malformed token is a plain
 * 404 that says nothing about which of those it was.
 *
 * Public by the proxy's own matcher, which excludes /api (proxy.ts, bottom), so
 * it needs no publicRoutes entry. It uses a session-less anon client: whoever
 * is signed in in the browser that calls this is irrelevant and ignored.
 *
 * `?lang=ru` (set by the subscribe panel when it was shown in Russian) picks
 * the event labels; anything else is English. The response is never cached by a
 * shared cache and is not indexable: the URL is a secret.
 */
const NOT_FOUND = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const match = /^([0-9a-f]{64})\.ics$/.exec(file);
  if (!match) return NOT_FOUND();

  const { data, error } = await createAnonClient().rpc("calendar_feed", { p_token: match[1] });
  if (error) {
    console.error("calendar_feed failed", error.code);
    return new NextResponse("Calendar unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (data === null || !Array.isArray(data)) return NOT_FOUND();

  const lang = parseCalendarLang(request.nextUrl.searchParams.get("lang"));
  const body = buildIcs(data as FeedRow[], { now: new Date(), lang, calendarName: "Alliengll" });
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
