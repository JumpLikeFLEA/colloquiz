"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import type { EnrichedResult } from "@/lib/questions";
import { formatDuration } from "@/lib/format";

// The quiz-results table, shared by Progress > Stats ("Recent Quizzes", capped
// at 10) and Progress > History (the paginated full list). Extracted from
// DashboardView so the two cannot drift apart — same columns, same row shape,
// same colour rules. The JSX below is DashboardView's markup verbatim.
//
// The two grid templates are written out in full rather than composed from a
// shared constant: Tailwind scans source text for complete class names, so an
// interpolated `sm:${COLS}` would never be generated. They must stay in sync by
// hand — that is the trade, and it is why they sit next to each other here.

function difficultyColor(d: string) {
  const lower = d.toLowerCase();
  if (lower === "easy") return "text-success bg-success-subtle";
  if (lower === "medium") return "text-warning bg-warning-subtle";
  return "text-destructive-text bg-destructive-subtle";
}

function scoreColor(s: number) {
  if (s >= 80) return "text-success";
  if (s >= 60) return "text-warning";
  return "text-destructive-text";
}

export function QuizResultsTable({
  results,
  empty,
}: {
  results: EnrichedResult[];
  /** Rendered in place of the rows when there are none. */
  empty: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      <div className="hidden sm:grid grid-cols-[1fr_100px_80px_70px_90px_80px] gap-4 px-5 py-3 bg-accent/50 border-b border-border text-xs text-muted-foreground font-medium">
        <span>Subject / Topic</span>
        <span>Difficulty</span>
        <span>Score</span>
        <span>Questions</span>
        <span>Time</span>
        <span>Date</span>
      </div>
      {results.length === 0
        ? empty
        : results.map((r, i) => <QuizResultRow key={r.id} result={r} index={i} />)}
    </div>
  );
}

export function QuizResultRow({ result: r, index }: { result: EnrichedResult; index: number }) {
  const passed = r.score >= 0.6;
  const scorePercent = Math.round(r.score * 100);
  const diffDisplay = r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1);
  const dateDisplay = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(r.taken_at));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04 }}
      className="grid grid-cols-1 sm:grid-cols-[1fr_100px_80px_70px_90px_80px] gap-2 sm:gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-accent/30 transition-colors items-center"
    >
      <div className="flex items-center gap-3">
        {passed
          ? <CheckCircle2 size={16} className="text-success shrink-0" />
          : <XCircle size={16} className="text-destructive-text shrink-0" />
        }
        <div>
          <p className="text-sm font-medium text-foreground">{r.subject}</p>
          <p className="text-xs text-muted-foreground">{r.mode.charAt(0).toUpperCase() + r.mode.slice(1)}</p>
        </div>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${difficultyColor(r.difficulty)}`}>
        {diffDisplay}
      </span>
      <span className={`text-sm font-semibold ${scoreColor(scorePercent)}`}>
        {scorePercent}%
      </span>
      <span className="text-sm text-muted-foreground">{r.total_questions} Q</span>
      <span className="text-sm text-muted-foreground">{formatDuration(r.time_taken ?? 0, "verbose")}</span>
      <span className="text-xs text-muted-foreground">{dateDisplay}</span>
    </motion.div>
  );
}
