import { createClient } from "@/lib/supabase/server";
import { getSubjects, type EnrichedResult } from "@/lib/questions";
import type { SubjectStat } from "@/lib/subjectStats";

// Read side of Progress > Stats. Everything comes from the single migration-034
// RPC get_progress_stats(), which aggregates the user's whole history in SQL and
// returns only bounded data (see the migration header). This replaces
// getEnrichedResults(), which transferred every result row to compute the same
// numbers in JS — a payload that grew without bound.
//
// Like lib/history.ts, this imports the server client (next/headers) and
// getSubjects() (fs), so client components must not import from it.

/** Everything the Stats tab (and the Achievements tab's totals) needs. */
export type ProgressStats = {
  /** All-time aggregates for the stat cards. avgScore is 0..100. */
  totals: { quizzes: number; avgScore: number; totalTimeSeconds: number };
  /** Per-subject aggregate, most-played first (see the sort note below). */
  bySubject: SubjectStat[];
  /** The latest 10 results, subject already resolved to a display name. */
  recent: EnrichedResult[];
  /** Rows from the last 8 days, for the client-side weekday chart. */
  weekResults: { taken_at: string; score: number }[];
};

type RawStats = {
  totals: { quizzes: number; avg_score: number; total_time: number };
  by_subject: { subject: string | null; quizzes: number; avg_score: number }[];
  recent: {
    id: string;
    mode: string;
    score: number;
    correct: number;
    total_questions: number;
    taken_at: string;
    time_taken: number;
    subject: string | null;
    difficulty: string;
  }[];
  last_week: { taken_at: string; score: number }[];
};

export async function getProgressStats(): Promise<ProgressStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_progress_stats");
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as RawStats;

  const subjectName = new Map(getSubjects().map((s) => [s.id, s.name]));
  // Null subject = the quiz is gone or its first question is unreadable — the
  // same "Mixed" fallback getEnrichedResults / getQuizHistory use.
  const nameFor = (id: string | null) => (id ? subjectName.get(id) ?? id : "Mixed");

  const bySubject: SubjectStat[] = (raw.by_subject ?? [])
    .map((g) => ({
      subject: nameFor(g.subject),
      quizzes: g.quizzes,
      avgScore: Math.round(g.avg_score * 100),
    }))
    // Same ordering as aggregateBySubject (lib/subjectStats): most-played first,
    // so toRadarPoints can cap with a plain slice of the head; ties break on
    // score then name so the ranking is stable across renders.
    .sort(
      (a, b) =>
        b.quizzes - a.quizzes ||
        b.avgScore - a.avgScore ||
        a.subject.localeCompare(b.subject),
    );

  const recent: EnrichedResult[] = (raw.recent ?? []).map((r) => ({
    id: r.id,
    mode: r.mode,
    score: r.score,
    correct: r.correct,
    total_questions: r.total_questions,
    taken_at: r.taken_at,
    time_taken: r.time_taken ?? 0,
    subject: nameFor(r.subject),
    difficulty: r.difficulty,
  }));

  return {
    totals: {
      quizzes: raw.totals?.quizzes ?? 0,
      avgScore: Math.round((raw.totals?.avg_score ?? 0) * 100),
      totalTimeSeconds: raw.totals?.total_time ?? 0,
    },
    bySubject,
    recent,
    weekResults: raw.last_week ?? [],
  };
}
