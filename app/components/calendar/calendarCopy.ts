import type { CalendarItem } from "@/lib/calendar/calendar";

// COH-015 — the calendar's strings, EN and RU, in one place. /my follows the
// saved EN/RU choice; Studio is always English (docs/decisions/0159). Kept out
// of lib/alliengll/copy.ts on purpose (docs/handoff.md, "Audience and
// language": keep copy.ts out of anything that renders on `/` or the course page).

export type CalendarLang = "en" | "ru";

type Copy = {
  prevMonth: string;
  nextMonth: string;
  today: string;
  empty: string;
  allDay: string;
  zone: (tz: string) => string;
  zoneUtcHint: string;
  doneMark: string;
  external: string;
  gridLabel: string;
  agendaLabel: string;
  runStart: string;
  runEnd: string;
  weekOpens: (n: number) => string;
  call: string;
  homework: string;
  event: string;
};

export const calendarCopy: Record<CalendarLang, Copy> = {
  en: {
    prevMonth: "Previous month",
    nextMonth: "Next month",
    today: "Today",
    empty: "Nothing on the calendar this month.",
    allDay: "All day",
    zone: (tz) => `Times are shown in ${tz}.`,
    zoneUtcHint: "Your time zone isn't known yet, so times are shown in UTC.",
    doneMark: "done",
    external: "opens in a new tab",
    gridLabel: "Month calendar",
    agendaLabel: "Agenda",
    runStart: "Course starts",
    runEnd: "Course ends",
    weekOpens: (n) => `Week ${n} opens`,
    call: "Call",
    homework: "Homework due",
    event: "Event",
  },
  ru: {
    prevMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    today: "Сегодня",
    empty: "В этом месяце в календаре ничего нет.",
    allDay: "Весь день",
    zone: (tz) => `Время указано в часовом поясе ${tz}.`,
    zoneUtcHint: "Ваш часовой пояс пока не определён, поэтому время указано по UTC.",
    doneMark: "выполнено",
    external: "откроется в новой вкладке",
    gridLabel: "Календарь на месяц",
    agendaLabel: "Список событий",
    runStart: "Курс начинается",
    runEnd: "Курс заканчивается",
    weekOpens: (n) => `Открывается неделя ${n}`,
    call: "Звонок",
    homework: "Срок домашнего задания",
    event: "Событие",
  },
};

/** The line an item shows: what it is, with the title where it has one. */
export function itemLabel(item: CalendarItem, lang: CalendarLang): string {
  const c = calendarCopy[lang];
  switch (item.kind) {
    case "run_start":
      return c.runStart;
    case "run_end":
      return c.runEnd;
    case "week_open":
      return c.weekOpens(item.week ?? 0);
    case "call":
      return item.title ? `${c.call}: ${item.title}` : c.call;
    case "homework_due":
      return item.title ? `${c.homework}: ${item.title}` : c.homework;
    case "event":
      return item.title ?? c.event;
  }
}
