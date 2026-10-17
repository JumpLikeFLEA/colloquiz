// COH-016 — the .ics feed's builder (RFC 5545), pure: rows in, text out
// (docs/decisions/0160). Which rows a token gets was decided in SQL
// (calendar_feed, 086, which reads my_calendar); this module only formats them.
// Import-free of anything server-side, so the "unit" vitest project loads it.

import type { CalendarRole, CalendarRow } from "./calendar";
import { itemLabel, type CalendarLang } from "./labels";

/** One row of calendar_feed(): my_calendar's row tagged with the role it was read as. */
export type FeedRow = CalendarRow & { role: CalendarRole };

const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** RFC 5545 section 3.3.11: escape backslash, semicolon, comma and newlines in a TEXT value. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/**
 * RFC 5545 section 3.1: no content line longer than 75 OCTETS (not characters),
 * continued on the next line after CRLF and one space. A multi-byte character is
 * never split, so a Cyrillic title folds on a character boundary.
 */
export function foldLine(line: string): string {
  if (utf8Length(line) <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let used = 0;
  let limit = MAX_OCTETS;
  for (const ch of line) {
    const size = utf8Length(ch);
    if (used + size > limit) {
      parts.push(current);
      current = "";
      used = 0;
      limit = MAX_OCTETS - 1; // the leading space of a continuation line counts
    }
    current += ch;
    used += size;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** An instant as a UTC date-time, "YYYYMMDDTHHMMSSZ"; null when it isn't a date. */
export function formatUtc(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCFullYear()).padStart(4, "0")}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(
    d.getUTCHours(),
  )}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

/** "YYYY-MM-DD" as "YYYYMMDD"; null for anything else. */
export function formatDate(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.replace(/-/g, "") : null;
}

/** The day after a "YYYY-MM-DD" (an all-day event's DTEND is exclusive). */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** The UID is stable across fetches: the row's own key, the role, a fixed host. */
export function eventUid(row: Pick<FeedRow, "role" | "key">): string {
  return `${row.role}-${row.key}@colloquiz.app`;
}

const COURSE_WIDE = new Set(["run_start", "run_end", "week_open"]);

function vevent(row: FeedRow, now: string, lang: CalendarLang): string[] | null {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${eventUid(row)}`, `DTSTAMP:${now}`];

  if (row.due_on) {
    const start = formatDate(row.due_on);
    const end = formatDate(nextDay(row.due_on));
    if (!start || !end) return null;
    lines.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`);
  } else if (row.starts_at) {
    const start = formatUtc(row.starts_at);
    if (!start) return null;
    lines.push(`DTSTART:${start}`);
    const end = row.ends_at ? formatUtc(row.ends_at) : null;
    if (end && new Date(row.ends_at as string) > new Date(row.starts_at)) lines.push(`DTEND:${end}`);
  } else {
    return null;
  }

  const label = itemLabel({ kind: row.kind, title: row.title, week: row.week }, lang);
  const summary = row.course_title && COURSE_WIDE.has(row.kind) ? `${label} · ${row.course_title}` : label;
  lines.push(`SUMMARY:${escapeText(summary)}`);

  if (row.course_title) lines.push(`DESCRIPTION:${escapeText(row.course_title)}`);
  if (row.link && /^https:\/\/\S+$/.test(row.link)) lines.push(`URL:${row.link}`);
  lines.push("END:VEVENT");
  return lines;
}

/**
 * The whole calendar. `now` stamps every event (DTSTAMP is required); nothing
 * else in the output depends on it, so the same rows give the same events.
 * Rows without a date are skipped.
 */
export function buildIcs(
  rows: readonly FeedRow[],
  opts: { now: Date; lang: CalendarLang; calendarName: string },
): string {
  const stamp = formatUtc(opts.now.toISOString()) as string;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Colloquiz//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const row of rows) {
    const event = vevent(row, stamp, opts.lang);
    if (event) lines.push(...event);
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
