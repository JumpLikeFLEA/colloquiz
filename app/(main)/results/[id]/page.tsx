import { notFound } from "next/navigation";
import Link from "next/link";
import { getQuestionsByIds, getQuizById, getSubjects } from "@/lib/questions";
import { createClient } from "@/lib/supabase/server";
import { QuizMode } from "@/types";

function getGrade(pct: number): { letter: string; color: string; bg: string } {
  if (pct >= 90) return { letter: "A", color: "text-green-700", bg: "bg-green-50 border-green-200" };
  if (pct >= 80) return { letter: "B", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
  if (pct >= 70) return { letter: "C", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" };
  if (pct >= 60) return { letter: "D", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" };
  return { letter: "F", color: "text-red-700", bg: "bg-red-50 border-red-200" };
}

function calcXP(correct: number, total: number, mode: QuizMode): number {
  const base = correct * (mode === "exam" ? 15 : 10);
  const ratio = total > 0 ? correct / total : 0;
  const bonus = ratio >= 1 ? 50 : ratio >= 0.9 ? 25 : ratio >= 0.8 ? 10 : 0;
  return base + bonus;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: result } = await supabase
    .from("results")
    .select("*")
    .eq("id", id)
    .single();
  if (!result) notFound();

  const quiz = await getQuizById(result.quiz_id);
  // Only the questions this result references — the quiz's set, or the
  // wrong-answers fallback when the quiz is gone. Cap-safe (see getQuestionsByIds).
  const neededIds = quiz
    ? (quiz.question_ids as string[])
    : (result.wrong_question_ids as string[]);
  const allQuestions = await getQuestionsByIds(neededIds);

  const pct = Math.round(result.score * 100);
  const grade = getGrade(pct);
  const xp = calcXP(result.correct, result.total_questions, result.mode);

  const subjects = getSubjects();
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  let subjectLabel = "Mixed";
  if (quiz) {
    const firstQ = allQuestions.find((q) => q.id === quiz.question_ids[0]);
    if (firstQ?.subject) subjectLabel = subjectMap.get(firstQ.subject) ?? firstQ.subject;
  }
  const wrongIds = result.wrong_question_ids as string[];
  const wrongSet = new Set(wrongIds);
  // Reported+skipped questions. They are absent from wrong_question_ids, and
  // this page treats "not wrong" as correct — so without this set they'd render
  // as green ticks. They are not scored: neither correct nor incorrect.
  const excludedSet = new Set((result.excluded_question_ids ?? []) as string[]);

  // Ordered question list from the original quiz, falling back to wrong-only
  const orderedQuestions = quiz
    ? quiz.question_ids.map((qid: string) => allQuestions.find((q) => q.id === qid)).filter(Boolean)
    : wrongIds.map((qid) => allQuestions.find((q) => q.id === qid)).filter(Boolean);

  const reviewQuestions = orderedQuestions as typeof allQuestions;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <h1 className="text-xl font-semibold mb-1">Quiz Complete</h1>
        <p className="text-sm text-zinc-400 mb-8 capitalize">
          {result.mode} mode · {result.total_questions} questions
          {result.time_taken != null && ` · ${formatTime(result.time_taken)}`}
        </p>

        {/* Score card */}
        <div className={`flex items-center gap-6 p-6 rounded-2xl border mb-8 ${grade.bg}`}>
          <div className={`text-6xl font-bold leading-none ${grade.color}`}>
            {grade.letter}
          </div>
          <div className="flex-1">
            <p className={`text-3xl font-bold ${grade.color}`}>{pct}%</p>
            <p className="text-sm text-zinc-500 mt-0.5">
              {result.correct} / {result.total_questions} correct
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-zinc-900">+{xp}</p>
            <p className="text-xs text-zinc-400 mt-0.5">XP earned</p>
          </div>
        </div>

        {/* Score bar — one segment per question */}
        {reviewQuestions.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
              Question breakdown
            </p>
            <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
              {reviewQuestions.map((q) => (
                <div
                  key={q.id}
                  className={`flex-1 ${
                    excludedSet.has(q.id)
                      ? "bg-zinc-300"
                      : wrongSet.has(q.id)
                      ? "bg-red-400"
                      : "bg-green-400"
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-zinc-400 mt-1">
              <span>{result.correct} correct</span>
              {excludedSet.size > 0 && <span>{excludedSet.size} reported — not scored</span>}
              <span>{result.total_questions - result.correct} incorrect</span>
            </div>
          </div>
        )}

        {/* Tag breakdown */}
        {Object.keys(result.tag_breakdown).length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
              By topic
            </p>
            <div className="flex flex-col gap-2">
              {Object.entries(result.tag_breakdown as Record<string, { correct: number; total: number }>).map(([tag, { correct, total }]) => {
                const tagPct = Math.round((correct / total) * 100);
                return (
                  <div key={tag} className="flex items-center gap-3">
                    <span className="text-sm w-28 truncate capitalize text-zinc-600">{tag}</span>
                    <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tagPct >= 80 ? "bg-green-400" : tagPct >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                        style={{ width: `${tagPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-10 text-right">
                      {correct}/{total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Question review — expandable per question */}
        {reviewQuestions.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
              Review
            </p>
            <div className="flex flex-col gap-2">
              {reviewQuestions.map((q, i) => {
                const isExcluded = excludedSet.has(q.id);
                const isWrong = !isExcluded && wrongSet.has(q.id);
                return (
                  <details key={q.id} className="group rounded-xl border border-zinc-100 overflow-hidden">
                    <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none hover:bg-zinc-50 transition-colors">
                      <span
                        className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                          isExcluded
                            ? "bg-zinc-100 text-zinc-500"
                            : isWrong
                            ? "bg-red-100 text-red-600"
                            : "bg-green-100 text-green-600"
                        }`}
                      >
                        {isExcluded ? "⚑" : isWrong ? "✗" : "✓"}
                      </span>
                      <span className="text-sm text-zinc-700 flex-1 line-clamp-1">
                        {q.question}
                        {isExcluded && (
                          <span className="ml-2 text-xs text-zinc-400">Reported — not scored</span>
                        )}
                      </span>
                      <span className="text-xs text-zinc-300 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="px-4 pb-4 pt-1 border-t border-zinc-100 bg-zinc-50/50">
                      <p className="text-sm text-zinc-700 mb-3 leading-relaxed">{q.question}</p>
                      <p className="text-sm text-green-700 font-medium mb-2">
                        ✓ {q.correct_answer}
                      </p>
                      <p className="text-xs text-zinc-500 leading-relaxed">{q.explanation}</p>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href="/build"
            className="flex-1 text-center py-3 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            New Quiz
          </Link>
          <Link
            href="/"
            className="flex-1 text-center py-3 rounded-xl border border-zinc-200 text-zinc-900 text-sm font-medium hover:bg-zinc-50 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>

    </main>
  );
}
