// The wall-clock helpers read the runtime's zone; pin one (see cohortSchedule.test.ts).
process.env.TZ = "Europe/Belgrade";

import { describe, expect, it } from "vitest";
import {
  buildEventPayload,
  eventsForGroup,
  eventsForRun,
  toCalendarEvent,
  type CalendarEventRow,
} from "./calendarEvents";

const row = (over: Partial<CalendarEventRow>): CalendarEventRow => ({
  event_id: "e1",
  scope: "run",
  run_id: "r1",
  course_id: "c1",
  group_id: null,
  title: "Test day",
  starts_at: "2026-11-10T18:00:00.000Z",
  ends_at: null,
  link: null,
  can_manage: true,
  ...over,
});

describe("toCalendarEvent", () => {
  it("renames the reader's columns and keeps a member's NULL group id", () => {
    const e = toCalendarEvent(row({ scope: "group", run_id: null, course_id: null, can_manage: false }));
    expect(e).toEqual({
      id: "e1",
      scope: "group",
      runId: null,
      courseId: null,
      groupId: null,
      title: "Test day",
      startsAt: "2026-11-10T18:00:00.000Z",
      endsAt: null,
      link: null,
      canManage: false,
    });
  });
});

describe("eventsForRun / eventsForGroup", () => {
  const events = [
    toCalendarEvent(row({ event_id: "b", run_id: "r1", starts_at: "2026-11-12T10:00:00.000Z" })),
    toCalendarEvent(row({ event_id: "a", run_id: "r1", starts_at: "2026-11-11T10:00:00.000Z" })),
    toCalendarEvent(row({ event_id: "c", run_id: "r2" })),
    toCalendarEvent(row({ event_id: "g", scope: "group", run_id: null, course_id: null, group_id: "g1" })),
    toCalendarEvent(row({ event_id: "h", scope: "group", run_id: null, course_id: null, group_id: null })),
  ];

  it("keeps one run's events, soonest first, and no group event", () => {
    expect(eventsForRun(events, "r1").map((e) => e.id)).toEqual(["a", "b"]);
    expect(eventsForRun(events, "r2").map((e) => e.id)).toEqual(["c"]);
    expect(eventsForRun(events, "nope")).toEqual([]);
  });

  it("keeps one group's events, never a row without the group id", () => {
    expect(eventsForGroup(events, "g1").map((e) => e.id)).toEqual(["g"]);
    expect(eventsForGroup(events, "g2")).toEqual([]);
  });
});

describe("buildEventPayload", () => {
  const ok = { title: "  Test day ", start: "2026-11-10T19:00", end: "", link: "" };

  it("trims, converts the wall clock to an instant, and maps empty optionals to null", () => {
    const r = buildEventPayload(ok);
    expect(r).toEqual({
      ok: true,
      payload: { title: "Test day", startsAt: "2026-11-10T18:00:00.000Z", endsAt: null, link: null },
    });
  });

  it("keeps an end after the start and a full https link", () => {
    const r = buildEventPayload({ ...ok, end: "2026-11-10T21:00", link: " https://example.com/x " });
    expect(r).toEqual({
      ok: true,
      payload: {
        title: "Test day",
        startsAt: "2026-11-10T18:00:00.000Z",
        endsAt: "2026-11-10T20:00:00.000Z",
        link: "https://example.com/x",
      },
    });
  });

  it("refuses an empty or 121-character title, accepts 120", () => {
    expect(buildEventPayload({ ...ok, title: "   " }).ok).toBe(false);
    expect(buildEventPayload({ ...ok, title: "a".repeat(121) }).ok).toBe(false);
    expect(buildEventPayload({ ...ok, title: "a".repeat(120) }).ok).toBe(true);
  });

  it("refuses a missing start, an end not after the start, and a non-https link", () => {
    expect(buildEventPayload({ ...ok, start: "" })).toEqual({ ok: false, error: "Please enter a valid date and time." });
    expect(buildEventPayload({ ...ok, end: "2026-11-10T19:00" })).toEqual({
      ok: false,
      error: "An event can't end before it starts.",
    });
    expect(buildEventPayload({ ...ok, end: "2026-11-10T18:00" }).ok).toBe(false);
    expect(buildEventPayload({ ...ok, link: "http://example.com" }).ok).toBe(false);
    expect(buildEventPayload({ ...ok, link: "https://a b" }).ok).toBe(false);
  });
});
