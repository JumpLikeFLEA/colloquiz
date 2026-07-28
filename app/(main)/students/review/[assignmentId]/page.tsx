import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getAssignmentForReview } from "@/lib/author";
import { chipStyle } from "@/lib/categoricalColor";

/** The learner-facing twin of this scale lives in results/[id]/page.tsx — see
 *  the note there for why the shade steps are deliberately uneven. */
function getGrade(pct: number): { letter: string; hue: string } {
  if (pct >= 90) return { letter: "A", hue: "#059669" };
  if (pct >= 80) return { letter: "B", hue: "#2563eb" };
  if (pct >= 70) return { letter: "C", hue: "#a16207" };
  if (pct >= 60) return { letter: "D", hue: "#c2410c" };
  return { letter: "F", hue: "#dc2626" };
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
        <p className="text-sm text-muted-foreground mb-8">
          <span className="font-medium text-muted-foreground">{studentName}</span> · {quizTitle}
        </p>

        {!result ? (
          <div className="p-6 rounded-2xl border border-dashed border-border text-center text-muted-foreground">
            This student hasn&rsquo;t completed the quiz yet.
          </div>
        ) : (
          <>
            {/* Score card (no XP — this is the tutor's view) */}
            <div
              className="flex items-center gap-6 p-6 rounded-2xl border mb-8"
              style={chipStyle(grade.hue, { border: true })}
            >
              <div className="text-6xl font-bold leading-none">{grade.letter}</div>
              <div className="flex-1">
                <p className="text-3xl font-bold">{pct}%</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {result.correct} / {result.total_questions} correct
                </p>
              </div>
            </div>

            {/* Segment bar */}
            {questions.length > 0 && (
              <div className="mb-8">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Question breakdown
                </p>
                <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      className={`flex-1 ${isCorrect(q.id, q.correct_answer) ? "bg-success" : "bg-destructive"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Per-question review with the student's chosen answer */}
            <div className="mb-8">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Answers</p>
              <div className="flex flex-col gap-2">
                {questions.map((q) => {
                  const chosen = answerMap.get(q.id);
                  const correct = isCorrect(q.id, q.correct_answer);
                  return (
                    <div key={q.id} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                            correct ? "bg-success-subtle text-success" : "bg-destructive-subtle text-destructive-text"
                          }`}
                        >
                          {correct ? "✓" : "✗"}
                        </span>
                        <span className="text-sm text-foreground flex-1">{q.question}</span>
                      </div>
                      <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/50 flex flex-col gap-1.5">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Answered: </span>
                          <span className={correct ? "text-success font-medium" : "text-destructive-text font-medium"}>
                            {chosen && chosen.length > 0 ? chosen : "— no answer —"}
                          </span>
                        </p>
                        {!correct && (
                          <p className="text-sm text-success">
                            <span className="text-muted-foreground">Correct: </span>
                            {q.correct_answer}
                          </p>
                        )}
                        {q.explanation && (
                          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{q.explanation}</p>
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
