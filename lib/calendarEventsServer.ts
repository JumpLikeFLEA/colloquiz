import { createClient } from "@/lib/supabase/server";
import { toCalendarEvent, type CalendarEvent, type CalendarEventRow } from "./calendarEvents";

// COH-014 — the one reader (084, docs/decisions/0158). calendar_events has no
// grants: calendar_events() returns what the signed-in caller may see (their
// own runs' and groups' events as an author, or the events of the run they
// are enrolled in or the group they are in as a learner) and nothing else. A
// Studio page filters the result to its own run or group.

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_events");
  if (error) throw new Error(error.message);
  return ((data ?? []) as CalendarEventRow[]).map(toCalendarEvent);
}
