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
import { QuizResultsTable } from "./QuizResultsTable";

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
        <select
          id="history-subject"
          value={filters.subject}
          onChange={e => setFilter({ subject: e.target.value })}
          className="px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
        >
          <option value="all">All subjects</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.count})
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="history-difficulty">Filter by difficulty</label>
        <select
          id="history-difficulty"
          value={filters.difficulty}
          onChange={e => setFilter({ difficulty: e.target.value as HistoryFilters["difficulty"] })}
          className="px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
        >
          {HISTORY_DIFFICULTIES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        {filtered && (
          <Link
            href="/progress?tab=history"
            className="text-xs text-[#4f46e5] hover:underline flex items-center gap-1"
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
        style={{ backgroundColor: "#eef2ff", color: "#4f46e5" }}
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
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#eef2ff] text-[#4f46e5] hover:bg-[#e0e7ff] transition-colors text-sm"
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
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ backgroundColor: "#fff7ed", color: "#f97316" }}
      >
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
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#eef2ff] text-[#4f46e5] hover:bg-[#e0e7ff] transition-colors text-sm"
      >
        Clear filters
      </Link>
    </div>
  );
}
