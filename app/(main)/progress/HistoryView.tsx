"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, History as HistoryIcon, SearchX } from "lucide-react";
import { pluralize } from "@/lib/format";
import {
  HISTORY_DIFFICULTIES,
  HISTORY_PAGE_SIZE,
  historyHref,
  type HistoryFilters,
  type HistoryPage,
  type HistorySubjectOption,
} from "@/lib/historyFilters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { QuizResultsTable } from "./QuizResultsTable";

/**
 * Both filter triggers, sized to their content rather than the Select's default
 * full width — they sit side by side in a wrap row, not in a form grid. The
 * rounded-xl and the brand focus ring are what the native controls had; the rest
 * of the colour comes from the component's own tokens so it follows the theme.
 */
const FILTER_TRIGGER =
  "w-auto rounded-xl border-border bg-card text-foreground cursor-pointer " +
  "focus-visible:border-brand focus-visible:ring-brand/30";

/**
 * The full quiz history: one page at a time, filterable by subject and
 * difficulty.
 *
 * Every piece of state lives in the URL (?tab=history&subject=&difficulty=&page=)
 * rather than in component state, so a filtered page is linkable, survives a
 * refresh, and works with the back button — the same pattern as the tabs
 * themselves and Quick Play's difficulty control. Changing a filter therefore
 * navigates; the server fetches exactly one page and nothing else refetches.
 */
export function HistoryView({
  page,
  filters,
  subjects,
  filtered,
}: {
  page: HistoryPage;
  filters: HistoryFilters;
  subjects: HistorySubjectOption[];
  /** True when a filter is narrowing the table (drives which empty state shows). */
  filtered: boolean;
}) {
  const router = useRouter();

  /** A /progress?tab=history URL with `changes` applied over the current filters. */
  const hrefWith = (changes: Partial<HistoryFilters>) => historyHref({ ...filters, ...changes });

  // Changing a filter resets to page 1: page 4 of the old filter is rarely a
  // real page of the new one, and landing on an empty table reads as a bug.
  function setFilter(changes: Partial<HistoryFilters>) {
    router.push(hrefWith({ ...changes, page: 1 }));
  }

  const first = (page.page - 1) * HISTORY_PAGE_SIZE + 1;
  const last = first + page.rows.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter row — above the table, scoping everything below it */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="history-subject">Filter by subject</label>
        <Select value={filters.subject} onValueChange={v => setFilter({ subject: v })}>
          <SelectTrigger id="history-subject" className={FILTER_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} ({s.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="sr-only" htmlFor="history-difficulty">Filter by difficulty</label>
        <Select
          value={filters.difficulty}
          onValueChange={v => setFilter({ difficulty: v as HistoryFilters["difficulty"] })}
        >
          <SelectTrigger id="history-difficulty" className={FILTER_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HISTORY_DIFFICULTIES.map(d => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtered && (
          <Link
            href="/progress?tab=history"
            className="text-xs text-brand-text hover:underline flex items-center gap-1"
          >
            Clear filters
          </Link>
        )}

        {page.total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {first}–{last} of {pluralize(page.total, "quiz", "quizzes")}
          </span>
        )}
      </div>

      <QuizResultsTable
        results={page.rows}
        empty={filtered ? <NoMatches /> : <NoHistory />}
      />

      {/* Pagination. Links, not buttons: each page is a real URL, so it is
          shareable and the back button walks the pages. */}
      {page.pageCount > 1 && (
        <div className="flex items-center justify-between">
          <PageLink
            href={hrefWith({ page: page.page - 1 })}
            disabled={page.page <= 1}
            label="Previous"
            icon="left"
          />
          <span className="text-xs text-muted-foreground">
            Page {page.page} of {page.pageCount}
          </span>
          <PageLink
            href={hrefWith({ page: page.page + 1 })}
            disabled={page.page >= page.pageCount}
            label="Next"
            icon="right"
          />
        </div>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: "left" | "right";
}) {
  const content = (
    <>
      {icon === "left" && <ChevronLeft size={14} />}
      {label}
      {icon === "right" && <ChevronRight size={14} />}
    </>
  );
  const className =
    "inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-sm transition-colors";

  // A disabled span rather than a Link: there is no page 0 to link to, and an
  // <a> that goes nowhere is a keyboard trap.
  return disabled ? (
    <span className={`${className} text-muted-foreground opacity-50 cursor-not-allowed`} aria-disabled="true">
      {content}
    </span>
  ) : (
    <Link href={href} className={`${className} text-foreground hover:bg-accent`}>
      {content}
    </Link>
  );
}

function NoHistory() {
  return (
    <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand-text)" }}
      >
        <HistoryIcon size={20} />
      </div>
      <div>
        <p className="font-medium text-foreground">No quizzes yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Every quiz you finish lands here, with its score and how long it took.
        </p>
      </div>
      <Link
        href="/"
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-subtle text-brand-text hover:bg-brand-subtle-hover transition-colors text-sm"
      >
        Browse subjects
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-warning-subtle text-warning">
        <SearchX size={20} />
      </div>
      <div>
        <p className="font-medium text-foreground">No quizzes match these filters</p>
        <p className="text-sm text-muted-foreground mt-1">
          You have history, just not for this combination.
        </p>
      </div>
      <Link
        href="/progress?tab=history"
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-subtle text-brand-text hover:bg-brand-subtle-hover transition-colors text-sm"
      >
        Clear filters
      </Link>
    </div>
  );
}
