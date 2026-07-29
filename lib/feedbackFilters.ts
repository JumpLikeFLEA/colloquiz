// Pure filter/pagination vocabulary for Admin > Feedback.
//
// Split from lib/feedbackQueue.ts for the same reason lib/historyFilters.ts is
// split from lib/history.ts: the queue module imports the server Supabase
// client (and therefore next/headers), so a client component importing a
// constant from it would drag that into the browser bundle. Everything here is
// data and pure functions, safe on either side.

import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback";

/** Page size for the admin queue. */
export const FEEDBACK_PAGE_SIZE = 25;

/**
 * THE DEFAULT STATUS IS "new", NOT "all". The working view is the unread
 * queue; the archive is somewhere you go deliberately. Every "is this filtered"
 * question below is measured against this, not against "no filter at all".
 */
export const DEFAULT_STATUS: FeedbackStatusFilter = "new";

export type FeedbackStatusFilter = FeedbackStatus | "all";
export type FeedbackCategoryFilter = (typeof FEEDBACK_CATEGORIES)[number]["key"] | "all";

export const STATUS_FILTERS: { value: FeedbackStatusFilter; label: string }[] = [
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All statuses" },
];

export const CATEGORY_FILTERS: { value: FeedbackCategoryFilter; label: string }[] = [
  { value: "all", label: "All categories" },
  ...FEEDBACK_CATEGORIES.map(c => ({ value: c.key as FeedbackCategoryFilter, label: c.label })),
];

export type FeedbackFilters = {
  status: FeedbackStatusFilter;
  category: FeedbackCategoryFilter;
  /** 1-based. */
  page: number;
};

export type FeedbackQueuePage<Row> = {
  rows: Row[];
  /** Rows matching the filters, across all pages. */
  total: number;
  /** Rows in the table regardless of filters — picks which empty state shows. */
  grandTotal: number;
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
};

/** Allow-list read of `?status=`; anything unrecognised lands on the default. */
export function parseFeedbackStatus(raw: string | undefined): FeedbackStatusFilter {
  if (raw === "all") return "all";
  return (FEEDBACK_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as FeedbackStatusFilter)
    : DEFAULT_STATUS;
}

/** Allow-list read of `?category=`; anything unrecognised means no filter. */
export function parseFeedbackCategory(raw: string | undefined): FeedbackCategoryFilter {
  return FEEDBACK_CATEGORIES.some(c => c.key === raw)
    ? (raw as FeedbackCategoryFilter)
    : "all";
}

/** Allow-list read of `?page=`: a positive integer, else page 1. */
export function parseFeedbackPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function parseFeedbackFilters(params: {
  status?: string;
  category?: string;
  page?: string;
}): FeedbackFilters {
  return {
    status: parseFeedbackStatus(params.status),
    category: parseFeedbackCategory(params.category),
    page: parseFeedbackPage(params.page),
  };
}

/** True when the view is narrowed away from the default working queue. */
export function hasActiveFilters(f: FeedbackFilters): boolean {
  return f.status !== DEFAULT_STATUS || f.category !== "all";
}

/**
 * Canonical /admin/feedback URL. Defaults are left out of the query string, so
 * the plain sidebar link and a manually-cleared filter produce the same URL —
 * note that means `?status=new` never appears, because it IS the default.
 */
export function feedbackHref(f: FeedbackFilters): string {
  const params = new URLSearchParams();
  if (f.status !== DEFAULT_STATUS) params.set("status", f.status);
  if (f.category !== "all") params.set("category", f.category);
  if (f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `/admin/feedback?${qs}` : "/admin/feedback";
}

/**
 * Where "there is feedback, just none matching this view" should send you.
 *
 * Deliberately NOT feedbackHref(defaults): the default IS status=new, so an
 * empty New queue would offer a "clear filters" link back to the same empty
 * page. The only useful escape is the unfiltered archive.
 */
export const SHOW_EVERYTHING_HREF = "/admin/feedback?status=all";
