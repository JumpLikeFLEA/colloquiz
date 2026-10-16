import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import type { AnswerCourse, LessonAnswers } from "@/lib/learners/answers";

// A linked student's answers and best scores (TCH-003, docs/decisions/0150).
// Rendered only for a student linked to the caller; the rows come from
// linked_student_attempts() / linked_student_lesson_scores() (078, widened by
// 080 to the lessons and courses the teacher assigned: docs/decisions/0152),
// which return nothing otherwise. Native <details>: no client JS.

const pct = (earned: number, possible: number) => Math.round((100 * earned) / possible);

export function LinkedAnswers({
  courses,
  answers,
}: {
  courses: AnswerCourse[];
  answers: Map<string, LessonAnswers>;
}) {
  const shown = courses
    .map((c) => ({ ...c, lessons: c.lessons.filter((l) => answers.has(l.lessonId)) }))
    .filter((c) => c.lessons.length > 0);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Answers</h2>
        <p className="text-xs text-muted-foreground">
          Every attempt this linked student made, with the answer they gave. Answers are read against the version of
          the lesson they were made on.
        </p>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          No answers recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((c) => (
            <article key={c.courseId} className="rounded-2xl border border-border bg-card overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-foreground">{c.courseTitle}</h3>
              <div className="border-t border-border divide-y divide-border">
                {c.lessons.map((l) => {
                  const a = answers.get(l.lessonId)!;
                  return (
                    <details key={l.lessonId} className="group">
                      <summary className="px-4 py-3 flex flex-wrap items-center gap-2 cursor-pointer list-none min-h-11">
                        <span className="text-sm font-medium text-foreground min-w-0 break-words">
                          {l.lessonOrdinal}. {l.lessonTitle}
                        </span>
                        {a.score?.bestPercent != null ? (
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-brand-subtle text-brand-text">
                            Best: {a.score.bestPercent}%
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                            {a.score ? `${a.score.answered} of ${a.score.total} answered` : "Not completed"}
                          </span>
                        )}
                      </summary>
                      <ol className="px-4 pb-4 space-y-3">
                        {a.exercises.map((ex) => (
                          <li key={ex.key} className="rounded-xl border border-border p-3 space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Exercise {ex.number}</p>
                            {(() => {
                              const first = ex.attempts.find((t) => t.answer.status === "ok");
                              return first && first.answer.status === "ok" ? (
                                <p className="text-sm text-foreground break-words">{first.answer.prompt}</p>
                              ) : null;
                            })()}
                            <ul className="space-y-2">
                              {ex.attempts.map((t, i) => (
                                <li key={t.attemptId} className="space-y-1 min-w-0">
                                  <p className="text-xs text-muted-foreground">
                                    Attempt {i + 1} · <LocalTime iso={t.createdAt} /> ·{" "}
                                    <span className="text-foreground font-medium">
                                      {t.earned} of {t.possible} ({pct(t.earned, t.possible)}%)
                                    </span>
                                  </p>
                                  {t.answer.status === "ok" ? (
                                    <ul className="text-sm text-foreground space-y-0.5">
                                      {t.answer.lines.map((line, j) => (
                                        <li key={j} className="break-words">
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">
                                      {t.answer.status === "no_response"
                                        ? "No answer stored for this attempt."
                                        : "The answer can't be shown: the exercise no longer reads."}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    </details>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
