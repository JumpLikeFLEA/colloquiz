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
