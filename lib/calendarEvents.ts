// COH-014 — dated events a teacher adds to a run or a group (migration 084,
// docs/decisions/0158). Pure: the shape calendar_events() returns, the mapping
// from its raw rows, the lookups Studio builds from it, and the form's
// courtesy validation. Who may see or write an event is decided in SQL (the
// reader and _calendar_scope_check); this module renames fields and filters
// rows it was already handed. The read lives in lib/calendarEventsServer.ts so
// a Client Component can import these without the server Supabase client.

import { fromLocalDateTime } from "./cohortSchedule";

/** 084 enforces the same bound in a CHECK. */
export const EVENT_TITLE_MAX = 120;

export type CalendarEventRow = {
  event_id: string;
  scope: "run" | "group";
  run_id: string | null;
  course_id: string | null;
  group_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  link: string | null;
  can_manage: boolean;
};

export type CalendarEvent = {
  id: string;
  scope: "run" | "group";
  runId: string | null;
  courseId: string | null;
  /** Present only for the group's own teacher: a member's row carries NULL. */
  groupId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  link: string | null;
  canManage: boolean;
};

export function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.event_id,
    scope: row.scope,
    runId: row.run_id,
    courseId: row.course_id,
    groupId: row.group_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    link: row.link,
    canManage: row.can_manage,
  };
}

const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.id < b.id ? -1 : 1;

/** A run's events, soonest first. */
export function eventsForRun(events: CalendarEvent[], runId: string): CalendarEvent[] {
  return events.filter((e) => e.scope === "run" && e.runId === runId).sort(byStart);
}

/** A group's events, soonest first. Only the group's teacher has its id. */
export function eventsForGroup(events: CalendarEvent[], groupId: string): CalendarEvent[] {
  return events.filter((e) => e.scope === "group" && e.groupId === groupId).sort(byStart);
}

export type EventForm = { title: string; start: string; end: string; link: string };

export type EventPayload = { title: string; startsAt: string; endsAt: string | null; link: string | null };

/**
 * The dialog's courtesy check, before the round trip. 084's
 * _calendar_event_fields_check is the rule and answers again; this only saves
 * a request for the obvious mistakes, with the same wording as the route's.
 */
export function buildEventPayload(form: EventForm): { ok: true; payload: EventPayload } | { ok: false; error: string } {
  const title = form.title.trim();
  if (title.length < 1 || title.length > EVENT_TITLE_MAX) {
    return { ok: false, error: `Enter a title of up to ${EVENT_TITLE_MAX} characters.` };
  }
  const startsAt = fromLocalDateTime(form.start);
  if (!startsAt) return { ok: false, error: "Please enter a valid date and time." };

  let endsAt: string | null = null;
  if (form.end.trim() !== "") {
    endsAt = fromLocalDateTime(form.end);
    if (!endsAt) return { ok: false, error: "Please enter a valid end time, or leave it empty." };
    if (endsAt <= startsAt) return { ok: false, error: "An event can't end before it starts." };
  }

  const link = form.link.trim();
  if (link !== "" && !/^https:\/\/\S+$/.test(link)) {
    return { ok: false, error: "Enter a full link starting with https://." };
  }
  return { ok: true, payload: { title, startsAt, endsAt, link: link === "" ? null : link } };
}
