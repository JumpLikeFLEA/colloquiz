"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Lightbulb,
  MessageCircle,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/format";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback";
import {
  CATEGORY_FILTERS,
  FEEDBACK_PAGE_SIZE,
  feedbackHref,
  SHOW_EVERYTHING_HREF,
  STATUS_FILTERS,
  type FeedbackFilters,
  type FeedbackQueuePage,
} from "@/lib/feedbackFilters";
import type { FeedbackRow } from "@/lib/feedbackQueue";

/** Same treatment as the Progress > History filter triggers. */
const FILTER_TRIGGER =
  "w-auto rounded-xl border-border bg-card text-foreground cursor-pointer " +
  "focus-visible:border-brand focus-visible:ring-brand/30";

const CATEGORY_STYLE: Record<string, { icon: typeof Bug; className: string }> = {
  bug: { icon: Bug, className: "bg-destructive-subtle text-destructive-text" },
  idea: { icon: Lightbulb, className: "bg-brand-subtle text-brand-text" },
  other: { icon: MessageCircle, className: "bg-muted text-muted-foreground" },
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  triaged: "Triaged",
  closed: "Closed",
};

/**
 * Timestamps are formatted from the ISO string rather than with
 * toLocaleString(): this component is server-rendered and then hydrated, and a
 * locale-dependent format produces a different string on each side. UTC is also
 * simply the right unit for triage — two admins in different places comparing
 * notes need the same number.
 */
function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function authorName(row: FeedbackRow): string {
  return row.author?.full_name || row.author?.display_name || "Unknown user";
}

/**
 * The admin feedback queue: one page at a time, filterable by status and
 * category.
 *
 * All of the filter and page state lives in the URL (?status=&category=&page=),
 * so a filtered view is linkable and survives a refresh — the same pattern as
 * Progress > History. Changing a filter navigates; nothing refetches client-side.
 *
 * Row expansion is the one piece of state that is NOT in the URL, on purpose:
 * it is ephemeral reading state, not a view worth sending to someone.
 */
export function FeedbackQueue({
  page,
  filters,
  filtered,
}: {
  page: FeedbackQueuePage<FeedbackRow>;
  filters: FeedbackFilters;
  filtered: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);

  const hrefWith = (changes: Partial<FeedbackFilters>) =>
    feedbackHref({ ...filters, ...changes });

  // Changing a filter resets to page 1: page 3 of the old filter is rarely a
  // real page of the new one.
  function setFilter(changes: Partial<FeedbackFilters>) {
    router.push(hrefWith({ ...changes, page: 1 }));
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * No optimistic local copy of the list. The row may leave the current filter
   * as a result of this change (marking a New item Triaged while viewing New),
   * and reconciling that by hand is exactly the sort of bookkeeping that drifts
   * out of step with the server. Post, then refresh, and let the server data be
   * the only source of truth.
   */
  async function changeStatus(row: FeedbackRow, status: FeedbackStatus) {
    if (status === row.status) return;
    setPending(row.id);
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Couldn't update that item.");
        return;
      }
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}.`);
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setPending(null);
    }
  }

  const first = (page.page - 1) * FEEDBACK_PAGE_SIZE + 1;
  const last = first + page.rows.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter row — above the list, scoping everything below it */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="feedback-status">Filter by status</label>
        <Select
          value={filters.status}
          onValueChange={v => setFilter({ status: v as FeedbackFilters["status"] })}
        >
          <SelectTrigger id="feedback-status" className={FILTER_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="sr-only" htmlFor="feedback-category">Filter by category</label>
        <Select
          value={filters.category}
          onValueChange={v => setFilter({ category: v as FeedbackFilters["category"] })}
        >
          <SelectTrigger id="feedback-category" className={FILTER_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_FILTERS.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtered && (
          <Link
            href="/admin/feedback"
            className="text-xs text-brand-text hover:underline"
          >
            Back to New
          </Link>
        )}

        {page.total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {first}–{last} of {pluralize(page.total, "item", "items")}
          </span>
        )}
      </div>

      {page.rows.length === 0 ? (
        page.grandTotal === 0 ? <NothingYet /> : <NoMatches />
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {page.rows.map(row => (
            <Row
              key={row.id}
              row={row}
              open={expanded.has(row.id)}
              busy={pending === row.id}
              onToggle={() => toggle(row.id)}
              onStatus={s => changeStatus(row, s)}
            />
          ))}
        </div>
      )}

      {/* Pagination. Links, not buttons: each page is a real URL. */}
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

function Row({
  row,
  open,
  busy,
  onToggle,
  onStatus,
}: {
  row: FeedbackRow;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (s: FeedbackStatus) => void;
}) {
  const panelId = `feedback-detail-${row.id}`;
  const style = CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.other;
  const Icon = style.icon;

  return (
    <div className={cn("transition-opacity", busy && "opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* The summary is the disclosure control; the status Select is its
            SIBLING, not a child. A control nested inside a button is invalid
            HTML and unreachable by keyboard. min-w-0 on both the button and the
            message span is what lets `truncate` actually clip — without it a
            flex child refuses to shrink below its content and a 2000-character
            message blows the row open. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
          <span
            className={cn(
              "flex items-center gap-1.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              style.className,
            )}
          >
            <Icon size={12} aria-hidden="true" />
            {row.category}
          </span>
          <span className="flex-1 min-w-0 truncate text-sm text-foreground">
            {row.message}
          </span>
          <span className="hidden lg:block shrink-0 max-w-[11rem] truncate text-xs text-muted-foreground">
            {row.route ?? "—"}
          </span>
          <span className="hidden md:block shrink-0 max-w-[8rem] truncate text-xs text-muted-foreground">
            {authorName(row)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {stamp(row.created_at)}
          </span>
        </button>

        <Select
          value={row.status}
          onValueChange={v => onStatus(v as FeedbackStatus)}
          disabled={busy}
        >
          <SelectTrigger
            aria-label={`Status for feedback from ${authorName(row)}`}
            className="w-auto shrink-0 rounded-xl border-border bg-background text-foreground cursor-pointer focus-visible:border-brand focus-visible:ring-brand/30"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Always rendered, hidden when collapsed, so aria-controls always points
          at a real element. */}
      <div id={panelId} hidden={!open} className="px-4 pb-4 pt-1">
        <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-4">
          {/* break-words matters as much as pre-wrap: a 2000-character run with
              no spaces would otherwise stretch the panel horizontally. */}
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {row.message}
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs border-t border-border pt-3">
            <Meta label="Route" value={row.route} mono />
            <Meta label="Sent" value={row.created_at} mono />
            <Meta label="From" value={authorName(row)} />
            <Meta label="User ID" value={row.user_id} mono />
            <Meta label="Theme" value={row.theme} />
            <Meta
              label="Viewport"
              value={
                row.viewport_width && row.viewport_height
                  ? `${row.viewport_width} × ${row.viewport_height}`
                  : null
              }
            />
            <Meta label="App version" value={row.app_version} mono />
            <Meta label="Feedback ID" value={row.id} mono />
            <div className="sm:col-span-2">
              <Meta label="User agent" value={row.user_agent} mono />
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

/** One metadata field. Renders an em dash rather than vanishing when unset — a
 *  missing capture is information, and a field that disappears looks like a
 *  layout bug. */
function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-foreground break-words",
          mono && "font-mono text-[11px]",
        )}
      >
        {value || "—"}
      </dd>
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
    <span
      className={`${className} text-muted-foreground opacity-50 cursor-not-allowed`}
      aria-disabled="true"
    >
      {content}
    </span>
  ) : (
    <Link href={href} className={`${className} text-foreground hover:bg-accent`}>
      {content}
    </Link>
  );
}

function NothingYet() {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-12 flex flex-col items-center gap-3 text-center">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand-text)" }}
      >
        <Inbox size={20} />
      </div>
      <div>
        <p className="font-medium text-foreground">No feedback yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Anything sent from the Feedback button in the top bar lands here, with the
          page the sender was on.
        </p>
      </div>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-12 flex flex-col items-center gap-3 text-center">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-warning-subtle text-warning">
        <SearchX size={20} />
      </div>
      <div>
        <p className="font-medium text-foreground">Nothing matches these filters</p>
        <p className="text-sm text-muted-foreground mt-1">
          There is feedback, just none in this view.
        </p>
      </div>
      {/* Deliberately NOT "clear filters": the default view IS status=new, so
          clearing an empty New queue would land right back here. */}
      <Link
        href={SHOW_EVERYTHING_HREF}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-subtle text-brand-text hover:bg-brand-subtle-hover transition-colors text-sm"
      >
        Show all feedback
      </Link>
    </div>
  );
}
