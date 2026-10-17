// COH-015 — the calendar's pure half (migration 085, docs/decisions/0159).
// my_calendar(role) decides WHICH dates a viewer gets; this module only places
// the rows it returns on days in the viewer's time zone and lays a month out.
// Nothing here decides access. Import-free, so the "unit" vitest project loads
// it (docs/decisions/0004) and a Client Component could too.

export type CalendarRole = "learner" | "teacher";

export type CalendarKind = "run_start" | "run_end" | "week_open" | "call" | "homework_due" | "event";

/** The shape my_calendar() returns. */
export type CalendarRow = {
  key: string;
  kind: CalendarKind;
  starts_at: string | null;
  ends_at: string | null;
  due_on: string | null;
  title: string | null;
  course_id: string | null;
  course_slug: string | null;
  course_title: string | null;
  lesson_slug: string | null;
  week: number | null;
  run_id: string | null;
  group_id: string | null;
  assignment_id: string | null;
  link: string | null;
  done: boolean | null;
};

export type CalendarItem = {
  key: string;
  kind: CalendarKind;
  /** YYYY-MM-DD in the viewer's zone; a homework due date is the stored date itself. */
  day: string;
  /** HH:mm in the viewer's zone; null for an all-day date (homework). */
  time: string | null;
  /** The end, HH:mm in the viewer's zone, when the event has one on the same day. */
  endTime: string | null;
  title: string | null;
  courseTitle: string | null;
  week: number | null;
  done: boolean | null;
  href: string | null;
  /** True for a link that leaves the app (a call's Meet link, an event's link). */
  external: boolean;
};

/** The cookie the page's inline script writes and the server reads. */
export const TZ_COOKIE = "colloquiz_tz";

/** An IANA zone name the runtime knows, else UTC. The cookie is user input. */
export function resolveTimeZone(raw: string | null | undefined): string {
  if (!raw || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(raw)) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormats = new Map<string, Intl.DateTimeFormat>();

function dayFormat(tz: string): Intl.DateTimeFormat {
  let f = dayFormats.get(tz);
  if (!f) {
    // en-CA prints YYYY-MM-DD.
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(tz, f);
  }
  return f;
}

function timeFormat(tz: string): Intl.DateTimeFormat {
  let f = timeFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFormats.set(tz, f);
  }
  return f;
}

/** The calendar day an instant falls on in `tz`, as YYYY-MM-DD. */
export function localDay(iso: string | Date, tz: string): string {
  return dayFormat(tz).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** The wall-clock time of an instant in `tz`, as HH:mm. */
export function localTime(iso: string | Date, tz: string): string {
  return timeFormat(tz).format(typeof iso === "string" ? new Date(iso) : iso);
}

/**
 * Where a row links, by the viewer's role. A learner goes to the course or
 * lesson (a call to its Meet link, which is what "Join" is); a teacher goes
 * to the Studio page where the thing is managed.
 */
export function itemHref(row: CalendarRow, role: CalendarRole): { href: string | null; external: boolean } {
  if (role === "learner") {
    switch (row.kind) {
      case "call":
        return { href: row.link, external: row.link !== null };
      case "homework_due":
        if (row.course_slug) {
          return {
            href: row.lesson_slug ? `/courses/${row.course_slug}/${row.lesson_slug}` : `/courses/${row.course_slug}`,
            external: false,
          };
        }
        return { href: null, external: false };
      case "event":
        if (row.link) return { href: row.link, external: true };
        return { href: row.course_slug ? `/courses/${row.course_slug}` : null, external: false };
      default:
        return { href: row.course_slug ? `/courses/${row.course_slug}` : null, external: false };
    }
  }
  switch (row.kind) {
    case "homework_due":
      return { href: "/studio/homework", external: false };
    case "event":
      if (row.group_id) return { href: `/studio/learners/groups/${row.group_id}`, external: false };
      return { href: row.course_id ? `/studio/courses/${row.course_id}/runs` : null, external: false };
    default:
      return { href: row.course_id ? `/studio/courses/${row.course_id}/runs` : null, external: false };
  }
}

const byPosition = (a: CalendarItem, b: CalendarItem) =>
  a.day < b.day
    ? -1
    : a.day > b.day
      ? 1
      : (a.time ?? "") < (b.time ?? "")
        ? -1
        : (a.time ?? "") > (b.time ?? "")
          ? 1
          : a.key < b.key
            ? -1
            : a.key > b.key
              ? 1
              : 0;

/** Rows placed on days in `tz`, in calendar order. */
export function toCalendarItems(rows: readonly CalendarRow[], role: CalendarRole, tz: string): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const row of rows) {
    let day: string;
    let time: string | null = null;
    let endTime: string | null = null;
    if (row.due_on) {
      day = row.due_on; // a DATE: no zone, never shifted
    } else if (row.starts_at) {
      day = localDay(row.starts_at, tz);
      time = localTime(row.starts_at, tz);
      if (row.ends_at && localDay(row.ends_at, tz) === day) endTime = localTime(row.ends_at, tz);
    } else {
      continue;
    }
    const { href, external } = itemHref(row, role);
    items.push({
      key: row.key,
      kind: row.kind,
      day,
      time,
      endTime,
      title: row.title,
      courseTitle: row.course_title,
      week: row.week,
      done: row.done,
      href,
      external,
    });
  }
  return items.sort(byPosition);
}

// ── Months ────────────────────────────────────────────────────────────────

export type Month = { year: number; month: number }; // month 1-12

export const monthKey = (m: Month): string => `${String(m.year).padStart(4, "0")}-${String(m.month).padStart(2, "0")}`;

/** "YYYY-MM" from the URL, or null. Years outside 2000-2100 are refused. */
export function parseMonth(raw: string | null | undefined): Month | null {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export function shiftMonth(m: Month, delta: number): Month {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The month a YYYY-MM-DD day is in. */
export function monthOfDay(day: string): Month {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

export type GridDay = { day: string; dayOfMonth: number; inMonth: boolean; isToday: boolean; items: CalendarItem[] };

const pad2 = (n: number) => String(n).padStart(2, "0");
const dayString = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/**
 * The month as rows of seven days, Monday first, padded with the neighbouring
 * months' days so every row is full. `today` is a YYYY-MM-DD in the viewer's zone.
 */
export function monthGrid(items: readonly CalendarItem[], month: Month, today: string): GridDay[][] {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const inMonthDays = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const weeks = Math.ceil((lead + inMonthDays) / 7);

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = byDay.get(item.day);
    if (list) list.push(item);
    else byDay.set(item.day, [item]);
  }

  const key = monthKey(month);
  const rows: GridDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: GridDay[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(Date.UTC(month.year, month.month - 1, 1 - lead + w * 7 + d));
      const day = dayString(cell);
      row.push({
        day,
        dayOfMonth: cell.getUTCDate(),
        inMonth: day.slice(0, 7) === key,
        isToday: day === today,
        items: byDay.get(day) ?? [],
      });
    }
    rows.push(row);
  }
  return rows;
}

export type AgendaDay = { day: string; isToday: boolean; items: CalendarItem[] };

/** The month's days that have something on them, in order. */
export function agenda(items: readonly CalendarItem[], month: Month, today: string): AgendaDay[] {
  const key = monthKey(month);
  const out: AgendaDay[] = [];
  for (const item of items) {
    if (item.day.slice(0, 7) !== key) continue;
    const last = out[out.length - 1];
    if (last && last.day === item.day) last.items.push(item);
    else out.push({ day: item.day, isToday: item.day === today, items: [item] });
  }
  return out;
}
