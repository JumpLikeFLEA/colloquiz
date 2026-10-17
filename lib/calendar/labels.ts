// COH-015/016 — what a calendar item is called, in both languages. Pure and in
// lib/ because two callers need it: the page's chips (app/components/calendar)
// and the .ics builder (lib/calendar/ics.ts). docs/decisions/0159, 0160.

import type { CalendarKind } from "./calendar";

export type CalendarLang = "en" | "ru";

export function parseCalendarLang(raw: string | null | undefined): CalendarLang {
  return raw === "ru" ? "ru" : "en";
}

type KindStrings = {
  runStart: string;
  runEnd: string;
  weekOpens: (n: number) => string;
  call: string;
  homework: string;
  event: string;
};

const KIND_STRINGS: Record<CalendarLang, KindStrings> = {
  en: {
    runStart: "Course starts",
    runEnd: "Course ends",
    weekOpens: (n) => `Week ${n} opens`,
    call: "Call",
    homework: "Homework due",
    event: "Event",
  },
  ru: {
    runStart: "Курс начинается",
    runEnd: "Курс заканчивается",
    weekOpens: (n) => `Открывается неделя ${n}`,
    call: "Звонок",
    homework: "Срок домашнего задания",
    event: "Событие",
  },
};

/** The line an item shows: what it is, with the title where it has one. */
export function itemLabel(item: { kind: CalendarKind; title: string | null; week: number | null }, lang: CalendarLang): string {
  const c = KIND_STRINGS[lang];
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
