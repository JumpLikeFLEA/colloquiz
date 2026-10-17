import { describe, expect, it } from "vitest";
import {
  agenda,
  itemHref,
  localDay,
  localTime,
  monthGrid,
  monthKey,
  monthOfDay,
  parseMonth,
  resolveTimeZone,
  shiftMonth,
  toCalendarItems,
  type CalendarRow,
} from "./calendar";

const row = (over: Partial<CalendarRow>): CalendarRow => ({
  key: "k",
  kind: "event",
  starts_at: null,
  ends_at: null,
  due_on: null,
  title: null,
  course_id: null,
  course_slug: null,
  course_title: null,
  lesson_slug: null,
  week: null,
  run_id: null,
  group_id: null,
  assignment_id: null,
  link: null,
  done: null,
  ...over,
});

describe("resolveTimeZone", () => {
  it("keeps a real zone", () => {
    expect(resolveTimeZone("Europe/Belgrade")).toBe("Europe/Belgrade");
    expect(resolveTimeZone("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
  });
  it("falls back to UTC for anything else", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
    expect(resolveTimeZone("Mars/Olympus")).toBe("UTC");
    expect(resolveTimeZone("<script>")).toBe("UTC");
    expect(resolveTimeZone("A".repeat(80))).toBe("UTC");
  });
});

describe("placing an instant on a day in a zone", () => {
  // 23:30 UTC on 31 Oct is already 1 Nov in Belgrade (UTC+1 after the DST end)
  // and still 31 Oct in New York.
  const iso = "2026-10-31T23:30:00Z";
  it("moves the day with the zone", () => {
    expect(localDay(iso, "UTC")).toBe("2026-10-31");
    expect(localDay(iso, "Europe/Belgrade")).toBe("2026-11-01");
    expect(localDay(iso, "America/New_York")).toBe("2026-10-31");
  });
  it("prints a 24-hour clock", () => {
    expect(localTime(iso, "UTC")).toBe("23:30");
    expect(localTime(iso, "Europe/Belgrade")).toBe("00:30");
    expect(localTime("2026-10-31T12:05:00Z", "UTC")).toBe("12:05");
  });
  it("handles a zone with a half-hour offset", () => {
    expect(localTime("2026-06-01T00:00:00Z", "Asia/Kolkata")).toBe("05:30");
  });
});

describe("toCalendarItems", () => {
  it("places instants in the zone and never shifts a due date", () => {
    const items = toCalendarItems(
      [
        row({ key: "a", kind: "call", starts_at: "2026-10-31T23:30:00Z", link: "https://meet.example/1" }),
        row({ key: "b", kind: "homework_due", due_on: "2026-11-01" }),
      ],
      "learner",
      "Europe/Belgrade",
    );
    expect(items.map((i) => [i.key, i.day, i.time])).toEqual([
      ["b", "2026-11-01", null],
      ["a", "2026-11-01", "00:30"],
    ]);
  });
  it("puts an all-day date before timed items on the same day, then by key", () => {
    const items = toCalendarItems(
      [
        row({ key: "z", kind: "event", starts_at: "2026-11-02T09:00:00Z" }),
        row({ key: "y", kind: "event", starts_at: "2026-11-02T08:00:00Z" }),
        row({ key: "x", kind: "homework_due", due_on: "2026-11-02" }),
      ],
      "learner",
      "UTC",
    );
    expect(items.map((i) => i.key)).toEqual(["x", "y", "z"]);
  });
  it("keeps an end time only when it falls on the same local day", () => {
    const [same, next] = toCalendarItems(
      [
        row({ key: "s", starts_at: "2026-11-02T09:00:00Z", ends_at: "2026-11-02T10:30:00Z" }),
        row({ key: "t", starts_at: "2026-11-03T09:00:00Z", ends_at: "2026-11-04T10:30:00Z" }),
      ],
      "learner",
      "UTC",
    );
    expect(same.endTime).toBe("10:30");
    expect(next.endTime).toBeNull();
  });
  it("drops a row with neither a moment nor a date", () => {
    expect(toCalendarItems([row({ key: "n" })], "learner", "UTC")).toEqual([]);
  });
});

describe("itemHref", () => {
  const base = { course_id: "c1", course_slug: "slug", lesson_slug: "l1", group_id: null, link: null as string | null };
  it("sends a learner to the course, the lesson or the Meet link", () => {
    expect(itemHref(row({ ...base, kind: "run_start" }), "learner")).toEqual({ href: "/courses/slug", external: false });
    expect(itemHref(row({ ...base, kind: "week_open" }), "learner")).toEqual({ href: "/courses/slug", external: false });
    expect(itemHref(row({ ...base, kind: "homework_due" }), "learner")).toEqual({ href: "/courses/slug/l1", external: false });
    expect(itemHref(row({ ...base, lesson_slug: null, kind: "homework_due" }), "learner")).toEqual({ href: "/courses/slug", external: false });
    expect(itemHref(row({ ...base, kind: "call", link: "https://meet.example/1" }), "learner")).toEqual({
      href: "https://meet.example/1",
      external: true,
    });
    expect(itemHref(row({ ...base, kind: "event", link: "https://x.example/" }), "learner")).toEqual({
      href: "https://x.example/",
      external: true,
    });
  });
  it("gives a learner's group event (no course) no link", () => {
    expect(itemHref(row({ kind: "event" }), "learner")).toEqual({ href: null, external: false });
  });
  it("sends a teacher to the Studio page that manages the thing", () => {
    expect(itemHref(row({ ...base, kind: "run_end" }), "teacher")).toEqual({ href: "/studio/courses/c1/runs", external: false });
    expect(itemHref(row({ ...base, kind: "call", link: "https://meet.example/1" }), "teacher")).toEqual({
      href: "/studio/courses/c1/runs",
      external: false,
    });
    expect(itemHref(row({ ...base, kind: "homework_due" }), "teacher")).toEqual({ href: "/studio/homework", external: false });
    expect(itemHref(row({ kind: "event", group_id: "g1" }), "teacher")).toEqual({
      href: "/studio/learners/groups/g1",
      external: false,
    });
  });
});

describe("months", () => {
  it("parses only YYYY-MM with a real month", () => {
    expect(parseMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    for (const bad of ["2026-13", "2026-00", "26-11", "2026-1", "2026-11-01", "", null, undefined, "1999-12", "2101-01"]) {
      expect(parseMonth(bad)).toBeNull();
    }
  });
  it("steps across year ends", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(monthOfDay("2026-11-02")).toEqual({ year: 2026, month: 11 });
  });
});

describe("monthGrid", () => {
  // 1 Nov 2026 is a Sunday: six Monday-first lead days of October, then 30 days.
  const item = (key: string, day: string) => toCalendarItems([row({ key, kind: "event", starts_at: `${day}T10:00:00Z` })], "learner", "UTC")[0];

  it("starts on a Monday, fills every row and marks the month's own days", () => {
    const grid = monthGrid([], { year: 2026, month: 11 }, "2026-11-10");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid).toHaveLength(6);
    expect(grid[0][0].day).toBe("2026-10-26");
    expect(grid[0][6].day).toBe("2026-11-01");
    expect(grid[0].filter((d) => d.inMonth).map((d) => d.dayOfMonth)).toEqual([1]);
    expect(grid[5][0].day).toBe("2026-11-30");
    expect(grid.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });
  it("uses five rows when the month fits (Feb 2027 starts on a Monday)", () => {
    const grid = monthGrid([], { year: 2027, month: 2 }, "2027-01-01");
    expect(grid).toHaveLength(4);
    expect(grid[0][0].day).toBe("2027-02-01");
    expect(grid[3][6].day).toBe("2027-02-28");
  });
  it("puts items on their day, including neighbouring-month padding, and flags today", () => {
    const items = [item("a", "2026-11-10"), item("b", "2026-10-28"), item("c", "2026-11-10")];
    const grid = monthGrid(items, { year: 2026, month: 11 }, "2026-11-10");
    const cells = grid.flat();
    expect(cells.find((d) => d.day === "2026-11-10")?.items.map((i) => i.key)).toEqual(["a", "c"]);
    expect(cells.find((d) => d.day === "2026-10-28")?.items.map((i) => i.key)).toEqual(["b"]);
    expect(cells.filter((d) => d.isToday).map((d) => d.day)).toEqual(["2026-11-10"]);
    expect(cells.reduce((n, d) => n + d.items.length, 0)).toBe(3);
  });
  it("crosses a year end", () => {
    const grid = monthGrid([], { year: 2026, month: 12 }, "2026-12-01");
    expect(grid.at(-1)?.at(-1)?.day).toBe("2027-01-03");
  });
});

describe("agenda", () => {
  it("lists only the month's days that have something, in order", () => {
    const items = toCalendarItems(
      [
        row({ key: "a", starts_at: "2026-11-12T10:00:00Z" }),
        row({ key: "b", starts_at: "2026-10-30T10:00:00Z" }),
        row({ key: "c", starts_at: "2026-11-12T08:00:00Z" }),
        row({ key: "d", due_on: "2026-11-03", kind: "homework_due" }),
        row({ key: "e", starts_at: "2026-12-01T10:00:00Z" }),
      ],
      "learner",
      "UTC",
    );
    const out = agenda(items, { year: 2026, month: 11 }, "2026-11-12");
    expect(out.map((d) => [d.day, d.isToday, d.items.map((i) => i.key)])).toEqual([
      ["2026-11-03", false, ["d"]],
      ["2026-11-12", true, ["c", "a"]],
    ]);
  });
  it("is empty for a month with nothing", () => {
    expect(agenda([], { year: 2026, month: 11 }, "2026-11-12")).toEqual([]);
  });
});
