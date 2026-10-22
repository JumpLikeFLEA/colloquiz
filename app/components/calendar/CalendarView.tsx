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
import { PAPER_EMPTY_BOX_CLASS } from "@/app/(english)/surfaceClasses";
import { calendarCopy, itemLabel, type CalendarLang } from "./calendarCopy";

// COH-015 (docs/decisions/0159) — a server-rendered month. A table at `sm` and
// up, an agenda list on a phone; both are in the HTML and CSS picks one, so
// there is no client JS and no hydration. The month is in the URL (?month=).
// Which dates the viewer has was decided in SQL (my_calendar, 085); this only
// draws them. Used by /my (the learner) and /studio/calendar (the teacher).
// SHELL-034 (docs/decisions/0193): `paper` is the grid-paper variant /my passes
// (ink outlines, the offset shadow, a marker-yellow "today"); the default is the
// plain frame Studio keeps. It changes class names only.

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

// The paper variant of the nav links: ink outline, as OUTLINE_CTA_CLASS but at the
// nav's own 44px height.
const PAPER_NAV_LINK_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-ink bg-card px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

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
  paper = false,
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
  /** The grid-paper look (SHELL-034); false keeps the plain frame. */
  paper?: boolean;
}) {
  const c = calendarCopy[lang];
  const navClass = paper ? PAPER_NAV_LINK_CLASS : NAV_LINK_CLASS;
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
        <Link href={href(prev)} className={navClass} aria-label={c.prevMonth} scroll={false}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <h3 className="min-w-0 flex-1 text-center text-lg font-semibold capitalize text-foreground sm:flex-none sm:px-4">
          {monthLabel}
        </h3>
        <Link href={href(next)} className={navClass} aria-label={c.nextMonth} scroll={false}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href={`${basePath}#${anchor}`} className={`${navClass} ml-auto`} scroll={false}>
          {c.today}
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">{tzKnown ? c.zone(tz) : c.zoneUtcHint}</p>

      {/* sm and up: the month as a table */}
      <table
        className={`hidden w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl bg-card sm:table ${
          paper ? "border-2 border-ink shadow-offset" : "border border-border shadow-sm"
        }`}
        aria-label={c.gridLabel}
      >
        <thead>
          <tr>
            {weekdays.map((w) => (
              <th
                key={w}
                scope="col"
                className={`border-b bg-muted px-1.5 py-2 text-xs font-medium text-muted-foreground ${paper ? "border-ink/30" : "border-border"}`}
              >
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
                  className={`h-24 min-w-0 align-top p-1.5 ${paper ? "border-ink/30" : "border-border"} ${wi < grid.length - 1 ? "border-b" : ""} ${di < 6 ? "border-r" : ""} ${d.inMonth ? "" : "bg-muted/40"}`}
                >
                  <span
                    className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                      d.isToday
                        ? paper
                          ? "border-2 border-ink bg-highlight text-highlight-foreground"
                          : "bg-brand text-white"
                        : d.inMonth ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {d.dayOfMonth}
                  </span>
                  {d.items.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {d.items.map((item) => (
                        <li key={item.key} className="min-w-0">
                          <ItemChip item={item} lang={lang} paper={paper} compact />
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
          <p
            className={`p-6 text-center text-sm text-muted-foreground ${paper ? PAPER_EMPTY_BOX_CLASS : "rounded-2xl border border-dashed border-border"}`}
          >
            {c.empty}
          </p>
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
                      <ItemChip item={item} lang={lang} paper={paper} />
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

function ItemChip({
  item,
  lang,
  paper,
  compact = false,
}: {
  item: CalendarItem;
  lang: CalendarLang;
  paper: boolean;
  compact?: boolean;
}) {
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
  const base = `block min-w-0 rounded-lg px-2 py-1 text-xs ${KIND_CLASS[item.kind]} ${paper ? "border border-ink/30" : ""}`;
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
