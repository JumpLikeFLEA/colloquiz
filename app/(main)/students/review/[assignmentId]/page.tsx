import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getAssignmentForReview } from "@/lib/author";

function getGrade(pct: number): { letter: string; color: string; bg: string } {
  if (pct >= 90) return { letter: "A", color: "text-green-700", bg: "bg-green-50 border-green-200" };
  if (pct >= 80) return { letter: "B", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
  if (pct >= 70) return { letter: "C", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" };
  if (pct >= 60) return { letter: "D", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" };
  return { letter: "F", color: "text-red-700", bg: "bg-red-50 border-red-200" };
}

export default async function ReviewAttemptPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  const review = await getAssignmentForReview(supabase, assignmentId, user.id);
  if (!review) notFound();

  const { quizTitle, studentName, questions, result } = review;

  const answerMap = new Map((result?.answers ?? []).map((a) => [a.question_id, a.user_answer]));
  const isCorrect = (qId: string, correct: string) => answerMap.get(qId) === correct;

  const pct = result ? Math.round(result.score * 100) : 0;
  const grade = getGrade(pct);

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-10">
      <div className="w-full max-w-xl">
        <Link
          href="/students"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={16} /> Back to students
        </Link>

        <h1 className="text-xl font-semibold mb-1">Student attempt</h1>
        <p className="text-sm text-zinc-400 mb-8">
          <span className="font-medium text-zinc-600">{studentName}</span> · {quizTitle}
        </p>

        {!result ? (
          <div className="p-6 rounded-2xl border border-dashed border-border text-center text-muted-foreground">
            This student hasn&rsquo;t completed the quiz yet.
          </div>
        ) : (
          <>
            {/* Score card (no XP — this is the tutor's view) */}
            <div className={`flex items-center gap-6 p-6 rounded-2xl border mb-8 ${grade.bg}`}>
              <div className={`text-6xl font-bold leading-none ${grade.color}`}>{grade.letter}</div>
              <div className="flex-1">
                <p className={`text-3xl font-bold ${grade.color}`}>{pct}%</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {result.correct} / {result.total_questions} correct
                </p>
              </div>
            </div>

            {/* Segment bar */}
            {questions.length > 0 && (
              <div className="mb-8">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
                  Question breakdown
                </p>
                <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      className={`flex-1 ${isCorrect(q.id, q.correct_answer) ? "bg-green-400" : "bg-red-400"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Per-question review with the student's chosen answer */}
            <div className="mb-8">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Answers</p>
              <div className="flex flex-col gap-2">
                {questions.map((q) => {
                  const chosen = answerMap.get(q.id);
                  const correct = isCorrect(q.id, q.correct_answer);
                  return (
                    <div key={q.id} className="rounded-xl border border-zinc-100 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                            correct ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                          }`}
                        >
                          {correct ? "✓" : "✗"}
                        </span>
                        <span className="text-sm text-zinc-700 flex-1">{q.question}</span>
                      </div>
                      <div className="px-4 pb-4 pt-1 border-t border-zinc-100 bg-zinc-50/50 flex flex-col gap-1.5">
                        <p className="text-sm">
                          <span className="text-zinc-400">Answered: </span>
                          <span className={correct ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                            {chosen && chosen.length > 0 ? chosen : "— no answer —"}
                          </span>
                        </p>
                        {!correct && (
                          <p className="text-sm text-green-700">
                            <span className="text-zinc-400">Correct: </span>
                            {q.correct_answer}
                          </p>
                        )}
                        {q.explanation && (
                          <p className="text-xs text-zinc-500 leading-relaxed mt-1">{q.explanation}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {answerMap.size === 0 && (
              <p className="text-xs text-muted-foreground -mt-4 mb-8">
                Per-answer detail wasn&rsquo;t recorded for this attempt.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
