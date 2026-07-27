import { createClient } from "@/lib/supabase/server";
import { getSubjects } from "@/lib/questions";
import {
  HISTORY_PAGE_SIZE,
  parseHistoryDifficulty,
  parseHistoryPage,
  parseHistorySubject,
  type HistoryFilters,
  type HistoryPage,
  type HistorySubjectOption,
} from "@/lib/historyFilters";

// Read side of Progress > History. Everything goes through the migration-021
// RPCs rather than a PostgREST select, because a result's subject is derived
// from quizzes.question_ids[1] -> questions.subject and question_ids is a
// TEXT[], not a foreign key — PostgREST cannot filter through it, so subject
// filtering and pagination cannot coexist on this side of that boundary.
//
// NOTE this module imports the server Supabase client (and therefore
// next/headers) and getSubjects() (fs), so client components must import from
// it with `import type` only — the constants and parsers they need live in
// lib/historyFilters.ts.

/** Parse the History tab's search params, allow-listing every one of them. */
export function parseHistoryFilters(params: {
  subject?: string;
  difficulty?: string;
  page?: string;
}): HistoryFilters {
  const subjectIds = getSubjects().map(s => s.id);
  return {
    subject: parseHistorySubject(params.subject, subjectIds),
    difficulty: parseHistoryDifficulty(params.difficulty),
    page: parseHistoryPage(params.page),
  };
}

type HistoryRpcRow = {
  id: string;
  mode: string;
  score: number;
  correct: number;
  total_questions: number;
  taken_at: string;
  time_taken: number | null;
  subject: string | null;
  difficulty: string;
  total_count: number;
};

function rpcArgs(filters: HistoryFilters, page: number) {
  return {
    p_subject: filters.subject === "all" ? null : filters.subject,
    p_difficulty: filters.difficulty === "any" ? null : filters.difficulty,
    p_limit: HISTORY_PAGE_SIZE,
    p_offset: (page - 1) * HISTORY_PAGE_SIZE,
  };
}

/**
 * One page of history for the signed-in user.
 *
 * Rows and the filtered total come back in a single round trip — the count
 * rides on every row (see migration 021) so it is computed from the same
 * filtered set, in the same snapshot, as the page itself.
 */
export async function getQuizHistory(filters: HistoryFilters): Promise<HistoryPage> {
  const supabase = await createClient();

  const fetchPage = async (page: number): Promise<HistoryRpcRow[]> => {
    const { data, error } = await supabase.rpc("get_quiz_history", rpcArgs(filters, page));
    if (error) throw new Error(error.message);
    return (data ?? []) as HistoryRpcRow[];
  };

  let rows = await fetchPage(filters.page);
  let total = rows[0]?.total_count ?? 0;
  let page = filters.page;

  // An empty page past the first means ?page= is out of range — a stale link,
  // or a filter that narrowed the set under a deep page. Rendering that as-is
  // looks identical to "no matches", so land on the last real page instead.
  // Costs one extra fetch only in that case, and the clamped page always exists.
  if (rows.length === 0 && filters.page > 1) {
    const firstPage = await fetchPage(1);
    total = firstPage[0]?.total_count ?? 0;
    if (total > 0) {
      page = Math.ceil(total / HISTORY_PAGE_SIZE);
      rows = page === 1 ? firstPage : await fetchPage(page);
    }
  }

  const subjectName = new Map(getSubjects().map(s => [s.id, s.name]));

  return {
    rows: rows.map(r => ({
      id: r.id,
      mode: r.mode,
      score: r.score,
      correct: r.correct,
      total_questions: r.total_questions,
      taken_at: r.taken_at,
      time_taken: r.time_taken ?? 0,
      // Null subject = the quiz is gone, or its first question is unreadable by
      // this user. "Mixed" is the same fallback getEnrichedResults uses.
      subject: r.subject ? (subjectName.get(r.subject) ?? r.subject) : "Mixed",
      difficulty: r.difficulty,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
  };
}

/** Subjects this user actually has history in, for the filter dropdown. */
export async function getHistorySubjects(): Promise<HistorySubjectOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_quiz_history_subjects");
  if (error) throw new Error(error.message);

  const subjectName = new Map(getSubjects().map(s => [s.id, s.name]));
  return ((data ?? []) as { subject: string; cnt: number }[])
    .map(r => ({ id: r.subject, name: subjectName.get(r.subject) ?? r.subject, count: r.cnt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
