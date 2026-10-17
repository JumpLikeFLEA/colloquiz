import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  localDay,
  monthOfDay,
  parseMonth,
  resolveTimeZone,
  toCalendarItems,
  TZ_COOKIE,
  type CalendarItem,
  type CalendarRole,
  type CalendarRow,
  type Month,
} from "./calendar";

// COH-015 — the one read behind /my and /studio/calendar (085,
// docs/decisions/0159). my_calendar(role) returns the signed-in caller's own
// dates only; it has no EXECUTE for anon and refuses an unknown role.

export async function getCalendarRows(role: CalendarRole): Promise<CalendarRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_calendar", { p_role: role });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarRow[];
}

export type CalendarPageData = {
  items: CalendarItem[];
  month: Month;
  today: string;
  tz: string;
  /** False when the zone cookie is missing or unusable and the page fell back to UTC. */
  tzKnown: boolean;
};

/**
 * Everything a calendar page needs: the viewer's dates placed on days in their
 * zone (the cookie TimeZoneSync writes, docs/decisions/0159), and the month
 * from the URL, defaulting to the month of "today" in that zone.
 */
export async function getCalendarPageData(role: CalendarRole, rawMonth: string | undefined): Promise<CalendarPageData> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  const tz = resolveTimeZone(raw);
  const rows = await getCalendarRows(role);
  const today = localDay(new Date(), tz);
  return {
    items: toCalendarItems(rows, role, tz),
    month: parseMonth(rawMonth) ?? monthOfDay(today),
    today,
    tz,
    tzKnown: raw !== undefined && (tz !== "UTC" || raw === "UTC"),
  };
}

export type CalendarFeedStatus = { hasToken: boolean; createdAt: string | null };

/**
 * Whether the signed-in user has a feed address, and when it was made. The
 * address itself is never readable (086 stores a hash). Throws if 086 is not
 * applied, so a page can leave the panel out rather than fail.
 */
export async function getCalendarFeedStatus(): Promise<CalendarFeedStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed_status");
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as { has_token: boolean; created_at: string }[])[0];
  return row ? { hasToken: row.has_token, createdAt: row.created_at } : { hasToken: false, createdAt: null };
}
