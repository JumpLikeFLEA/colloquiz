import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  agenda,
  monthGrid,
  monthKey,
  shiftMonth,
  type CalendarItem,
  type CalendarKind,
  type Month,
} from "@/lib/calendar/calendar";
import { calendarCopy, itemLabel, type CalendarLang } from "./calendarCopy";

// COH-015 (docs/decisions/0159) — a server-rendered month. A table at `sm` and
// up, an agenda list on a phone; both are in the HTML and CSS picks one, so
// there is no client JS and no hydration. The month is in the URL (?month=).
// Which dates the viewer has was decided in SQL (my_calendar, 085); this only
// draws them. Used by /my (the learner) and /studio/calendar (the teacher).

const LOCALE: Record<CalendarLang, "en-GB" | "ru-RU"> = { en: "en-GB", ru: "ru-RU" };

// Existing tokens only. Dates that structure a course are quiet; things to
// attend (a call, an event) are brand-tinted; homework is quiet too, so past
// due is never loud (docs/decisions/0152).
const KIND_CLASS: Record<CalendarKind, string> = {
  run_start: "bg-muted text-muted-foreground",
  run_end: "bg-muted text-muted-foreground",
  week_open: "bg-muted text-muted-foreground",
  call: "bg-brand-subtle text-brand-text",
  event: "bg-brand-subtle text-brand-text",
  homework_due: "bg-muted text-foreground",
};

const NAV_LINK_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand";

function formatter(lang: CalendarLang, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(LOCALE[lang], { ...options, timeZone: "UTC" });
}

const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);

export function CalendarView({
  items,
  month,
  today,
  tz,
  tzKnown,
  lang,
  basePath,
  anchor = "calendar",
}: {
  items: readonly CalendarItem[];
  month: Month;
  /** YYYY-MM-DD in the viewer's zone. */
  today: string;
  tz: string;
  /** False when the zone cookie is missing and the page fell back to UTC. */
  tzKnown: boolean;
  lang: CalendarLang;
  basePath: string;
  anchor?: string;
}) {
  const c = calendarCopy[lang];
  const grid = monthGrid(items, month, today);
  const days = agenda(items, month, today);
  const prev = monthKey(shiftMonth(month, -1));
  const next = monthKey(shiftMonth(month, 1));
  const monthLabel = formatter(lang, { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(month.year, month.month - 1, 1)),
  );
  const weekdayFmt = formatter(lang, { weekday: "short" });
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(Date.UTC(2026, 10, 2 + i))));
  const href = (m: string) => `${basePath}?month=${m}#${anchor}`;

  return (
    <div className="flex flex-col gap-4" data-calendar={monthKey(month)}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(prev)} className={NAV_LINK_CLASS} aria-label={c.prevMonth} scroll={false}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <h3 className="min-w-0 flex-1 text-center text-lg font-semibold capitalize text-foreground sm:flex-none sm:px-4">
          {monthLabel}
        </h3>
        <Link href={href(next)} className={NAV_LINK_CLASS} aria-label={c.nextMonth} scroll={false}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href={`${basePath}#${anchor}`} className={`${NAV_LINK_CLASS} ml-auto`} scroll={false}>
          {c.today}
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">{tzKnown ? c.zone(tz) : c.zoneUtcHint}</p>

      {/* sm and up: the month as a table */}
      <table
        className="hidden w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:table"
        aria-label={c.gridLabel}
      >
        <thead>
          <tr>
            {weekdays.map((w) => (
              <th key={w} scope="col" className="border-b border-border bg-muted px-1.5 py-2 text-xs font-medium text-muted-foreground">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) => (
                <td
                  key={d.day}
                  className={`h-24 min-w-0 align-top border-border p-1.5 ${wi < grid.length - 1 ? "border-b" : ""} ${di < 6 ? "border-r" : ""} ${d.inMonth ? "" : "bg-muted/40"}`}
                >
                  <span
                    className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                      d.isToday ? "bg-brand text-white" : d.inMonth ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {d.dayOfMonth}
                  </span>
                  {d.items.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {d.items.map((item) => (
                        <li key={item.key} className="min-w-0">
                          <ItemChip item={item} lang={lang} compact />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* below sm: the month as an agenda */}
      <div className="sm:hidden" aria-label={c.agendaLabel}>
        {days.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{c.empty}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {days.map((d) => (
              <li key={d.day} className="flex flex-col gap-2">
                <h4 className={`text-sm font-semibold ${d.isToday ? "text-brand-text" : "text-foreground"}`}>
                  {formatter(lang, { weekday: "short", day: "numeric", month: "long" }).format(utcDate(d.day))}
                  {d.isToday && <span className="ml-2 text-xs font-medium text-brand-text">· {c.today}</span>}
                </h4>
                <ul className="flex flex-col gap-2">
                  {d.items.map((item) => (
                    <li key={item.key} className="min-w-0">
                      <ItemChip item={item} lang={lang} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ItemChip({ item, lang, compact = false }: { item: CalendarItem; lang: CalendarLang; compact?: boolean }) {
  const c = calendarCopy[lang];
  const when = item.time === null ? (compact ? null : c.allDay) : `${item.time}${item.endTime ? `–${item.endTime}` : ""}`;
  const secondary = [when, item.courseTitle].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="break-words font-medium">
          {item.done === true && <Check className="mr-1 inline size-3" aria-label={c.doneMark} />}
          {itemLabel(item, lang)}
        </span>
        <span className={`break-words text-muted-foreground ${compact ? "line-clamp-1" : ""}`} title={compact ? secondary : undefined}>
          {secondary}
        </span>
      </span>
      {item.external && <span className="sr-only"> ({c.external})</span>}
    </>
  );
  const base = `block min-w-0 rounded-lg px-2 py-1 text-xs ${KIND_CLASS[item.kind]}`;
  const interactive = `${base} outline-none transition-colors hover:ring-1 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand`;
  if (!item.href) return <span className={base}>{body}</span>;
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={interactive}>
        {body}
      </a>
    );
  }
  return (
    <Link href={item.href} className={interactive}>
      {body}
    </Link>
  );
}
