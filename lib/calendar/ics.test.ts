import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, eventUid, foldLine, formatDate, formatUtc, nextDay, type FeedRow } from "./ics";

const row = (over: Partial<FeedRow>): FeedRow => ({
  role: "learner",
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

const NOW = new Date("2026-10-17T12:00:00Z");
const opts = { now: NOW, lang: "en" as const, calendarName: "Alliengll" };
const octets = (s: string) => new TextEncoder().encode(s).length;

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines, in that order of precedence", () => {
    expect(escapeText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(escapeText("one\ntwo\r\nthree\rfour")).toBe("one\\ntwo\\nthree\\nfour");
  });
  it("leaves other text, including Cyrillic and colons, alone", () => {
    expect(escapeText("Звонок: клуб 10:30")).toBe("Звонок: клуб 10:30");
  });
});

describe("foldLine", () => {
  it("leaves a line of 75 octets or fewer alone", () => {
    const s = "X".repeat(75);
    expect(foldLine(s)).toBe(s);
  });
  it("folds a long ASCII line at 75 octets, then 74 + the leading space", () => {
    const folded = foldLine("A".repeat(200)).split("\r\n");
    expect(folded.map(octets)).toEqual([75, 75, 52]);
    expect(folded[1].startsWith(" ")).toBe(true);
    expect(folded.join("").replace(/ /g, "").length).toBe(200);
  });
  it("unfolds to the original line", () => {
    const original = "SUMMARY:" + "слово ".repeat(40);
    expect(foldLine(original).replace(/\r\n /g, "")).toBe(original);
  });
  it("never splits a multi-byte character and never exceeds 75 octets", () => {
    const folded = foldLine("SUMMARY:" + "ж".repeat(100) + "😀".repeat(30)).split("\r\n");
    for (const line of folded) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
    expect(folded.join("").replace(/ /g, "").endsWith("😀")).toBe(true);
  });
});

describe("dates", () => {
  it("writes an instant in UTC", () => {
    expect(formatUtc("2026-10-20T14:41:05+02:00")).toBe("20261020T124105Z");
    expect(formatUtc("2026-01-02T03:04:05Z")).toBe("20260102T030405Z");
  });
  it("rejects what is not a date", () => {
    expect(formatUtc("nope")).toBeNull();
    expect(formatDate("2026-12-24")).toBe("20261224");
    expect(formatDate("24/12/2026")).toBeNull();
  });
  it("steps an all-day end to the next day across month and year ends", () => {
    expect(nextDay("2026-12-24")).toBe("2026-12-25");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
});

describe("buildIcs", () => {
  const rows: FeedRow[] = [
    row({ key: "call:1", kind: "call", starts_at: "2026-10-20T12:41:00Z", title: "Speaking, club", course_title: "Course; one", link: "https://meet.example/1" }),
    row({ key: "homework:9", kind: "homework_due", due_on: "2026-12-24", title: "L1", course_title: "Course" }),
    row({ key: "event:3", kind: "event", starts_at: "2026-10-22T10:00:00Z", ends_at: "2026-10-22T12:00:00Z", title: "Test day" }),
    row({ key: "week:r:3", kind: "week_open", starts_at: "2026-10-29T12:41:00Z", week: 3, course_title: "Course" }),
  ];
  const ics = buildIcs(rows, opts);
  const lines = ics.split("\r\n");

  it("is a CRLF-terminated VCALENDAR with the required properties", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//Colloquiz//Calendar feed//EN");
    expect(ics).not.toMatch(/[^\r]\n/);
  });
  it("has one VEVENT per dated row, each with a UID, DTSTAMP and DTSTART", () => {
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(4);
    expect(lines.filter((l) => l.startsWith("UID:"))).toHaveLength(4);
    expect(lines.filter((l) => l === "DTSTAMP:20261017T120000Z")).toHaveLength(4);
    expect(lines.filter((l) => l.startsWith("DTSTART"))).toHaveLength(4);
  });
  it("writes times in UTC and a due date as an all-day event with an exclusive end", () => {
    expect(lines).toContain("DTSTART:20261020T124100Z");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261224");
    expect(lines).toContain("DTEND;VALUE=DATE:20261225");
    expect(lines).toContain("DTEND:20261022T120000Z");
  });
  it("escapes text values and keeps the call's link as a URL property", () => {
    expect(lines).toContain("SUMMARY:Call: Speaking\\, club");
    expect(lines).toContain("DESCRIPTION:Course\\; one");
    expect(lines).toContain("URL:https://meet.example/1");
  });
  it("names a course-wide date with its course, and a week by its number", () => {
    expect(lines).toContain("SUMMARY:Week 3 opens · Course");
  });
  it("gives the same UIDs on every fetch, and different ones per role", () => {
    const again = buildIcs(rows, { ...opts, now: new Date("2027-01-01T00:00:00Z") });
    const uids = (text: string) => text.split("\r\n").filter((l) => l.startsWith("UID:"));
    expect(uids(again)).toEqual(uids(ics));
    expect(eventUid({ role: "learner", key: "run_start:1" })).not.toBe(eventUid({ role: "teacher", key: "run_start:1" }));
    expect(eventUid({ role: "learner", key: "run_start:1" })).toBe("learner-run_start:1@colloquiz.app");
  });
  it("skips rows with no date and ignores a link that isn't https", () => {
    const out = buildIcs([row({ key: "x" }), row({ key: "y", starts_at: "2026-10-20T12:00:00Z", link: "javascript:alert(1)" })], opts);
    expect(out.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(out).not.toContain("URL:");
  });
  it("drops an end that isn't after the start", () => {
    const out = buildIcs([row({ key: "e", starts_at: "2026-10-20T12:00:00Z", ends_at: "2026-10-20T11:00:00Z" })], opts);
    expect(out).not.toContain("DTEND");
  });
  it("is a valid empty calendar for no rows", () => {
    expect(buildIcs([], opts).split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(0);
  });
  it("labels in Russian when asked, folding long Cyrillic lines under 75 octets", () => {
    const out = buildIcs([row({ key: "r", kind: "homework_due", due_on: "2026-12-24", title: "Очень длинное название урока " .repeat(4) })], { ...opts, lang: "ru" });
    expect(out).toContain("SUMMARY:Срок домашнего задания: Очень");
    for (const line of out.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
  });
});
