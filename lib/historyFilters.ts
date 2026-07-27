import type { EnrichedResult } from "@/lib/questions";

// Pure filter/pagination vocabulary for Progress > History.
//
// Deliberately separate from lib/history.ts: that module imports the server
// Supabase client (next/headers) and getSubjects() (fs), so a client component
// importing a constant from it would drag both into the browser bundle. The
// same reason LeaderboardView keeps its window labels locally. Everything here
// is data and pure functions, safe on either side.
//
// (The one type import above is erased at compile time, so it costs nothing.)

/** Page size for the history table. */
export const HISTORY_PAGE_SIZE = 25;

export const HISTORY_DIFFICULTIES = [
  { value: "any", label: "Any difficulty" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  // A real stored value, not a synonym for "no filter": a quiz played at "Any"
  // difficulty is saved with difficulty_mix = 'mixed'.
  { value: "mixed", label: "Mixed" },
] as const;

export type HistoryDifficulty = (typeof HISTORY_DIFFICULTIES)[number]["value"];

export type HistoryFilters = {
  /** Subject ID (e.g. "sports_history"), or "all". */
  subject: string;
  difficulty: HistoryDifficulty;
  /** 1-based. */
  page: number;
};

export type HistorySubjectOption = {
  /** Subject ID, as stored on questions.subject. */
  id: string;
  /** Display name from data/subjects.json, falling back to the raw ID. */
  name: string;
  count: number;
};

export type HistoryPage = {
  rows: EnrichedResult[];
  /** Results matching the filters, across all pages. */
  total: number;
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
};

/**
 * Allow-list read of `?difficulty=`: anything absent or unrecognized lands on
 * "any" rather than emptying the table. Mirrors lib/difficultyFilter.ts.
 */
export function parseHistoryDifficulty(raw: string | undefined): HistoryDifficulty {
  return HISTORY_DIFFICULTIES.some(d => d.value === raw)
    ? (raw as HistoryDifficulty)
    : "any";
}

/**
 * Allow-list read of `?subject=` against the known subject IDs; anything else
 * is "all". The ID list is passed in rather than read from data/subjects.json
 * here, so this stays free of the fs import.
 */
export function parseHistorySubject(raw: string | undefined, validIds: readonly string[]): string {
  return raw && validIds.includes(raw) ? raw : "all";
}

/** Allow-list read of `?page=`: a positive integer, else page 1. */
export function parseHistoryPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** True when any filter is narrowing the table — drives the "no matches" state. */
export function hasActiveFilters(f: HistoryFilters): boolean {
  return f.subject !== "all" || f.difficulty !== "any";
}

/**
 * Canonical /progress?tab=history URL for a set of filters. Defaults are left
 * out of the query string so the plain tab link and a manually-cleared filter
 * produce the same URL.
 */
export function historyHref(f: HistoryFilters): string {
  const params = new URLSearchParams({ tab: "history" });
  if (f.subject !== "all") params.set("subject", f.subject);
  if (f.difficulty !== "any") params.set("difficulty", f.difficulty);
  if (f.page > 1) params.set("page", String(f.page));
  return `/progress?${params}`;
}
