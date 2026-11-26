import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import type { TeacherNotebookCourse } from "@/lib/notebook/teacherView";
import type { SummaryKind } from "@/lib/notebook/types";

// A linked student's notebook, read-only (PROG-020, docs/decisions/0236 section 5, 0244). Rendered
// only for a student linked to the caller; the rows come from linked_student_notebook() (112),
// which returns only lessons the teacher can read (_teacher_readable_lessons), only copied rows
// (never the student's own notes), and a compared summary only when its first recording's lesson
// is readable too. A summary it leaves out leaves no placeholder (0236 "What each card takes").
// Native <details>: no client JS.

const KIND: Record<SummaryKind, string> = { first: "First recording", final: "Final recording", interim: "End-of-lesson recording" };

export function LinkedNotebook({ courses }: { courses: TeacherNotebookCourse[] | null }) {
  return (
    <section className="space-y-3" data-studio="linked-notebook">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Notebook</h2>
        <p className="text-xs text-muted-foreground">
          The phrases, fixes and AI summaries this linked student&apos;s notebook copied from their recordings, in lessons
          you can read. Their own notes are never shown. AI feedback can be wrong. It is not a grade.
        </p>
      </div>
      {courses === null ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          The notebook couldn&apos;t be read. Reload the page to try again.
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          Nothing in their notebook from lessons you can read yet.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <article key={c.courseId} className="rounded-2xl border border-border bg-card overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-foreground break-words">{c.courseTitle ?? "Course"}</h3>
              <div className="border-t border-border divide-y divide-border">
                {c.lessons.map((l) => (
                  <details key={l.lessonId} className="group" data-notebook-lesson={l.lessonId}>
                    <summary className="px-4 py-3 flex flex-wrap items-center gap-2 cursor-pointer list-none min-h-11">
                      <span className="text-sm font-medium text-foreground min-w-0 break-words">{l.lessonTitle ?? "Lesson"}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                        {[
                          l.said.length > 0 && `${l.said.length} ${l.said.length === 1 ? "phrase" : "phrases"}`,
                          l.fixes.length > 0 && `${l.fixes.length} ${l.fixes.length === 1 ? "fix" : "fixes"}`,
                          l.summaries.length > 0 && `${l.summaries.length} ${l.summaries.length === 1 ? "summary" : "summaries"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      {l.summaries.map((s, i) => (
                        <div key={i} className="rounded-xl border border-border p-3 space-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            AI summary · {KIND[s.kind]} · <LocalTime iso={s.takenAt} />
                          </p>
                          {s.summary && (
                            <p lang="en" className="text-sm text-foreground whitespace-pre-wrap break-words">
                              {s.summary}
                            </p>
                          )}
                          {s.follow && (
                            <p lang="en" className="text-sm text-foreground break-words">
                              <span className="font-semibold">{s.follow.label === "goal" ? "Goal" : "Next step"}:</span>{" "}
                              {s.follow.text}
                            </p>
                          )}
                        </div>
                      ))}
                      {l.said.length > 0 && (
                        <ul className="space-y-2" aria-label="Phrases said">
                          {l.said.map((p) => (
                            <li key={p.id} className="rounded-xl border border-border p-3 space-y-1">
                              <p lang="en" className="text-sm font-semibold text-foreground break-words">
                                {p.phrase}
                                {p.times > 1 && <span className="ml-2 text-xs font-normal text-muted-foreground">× {p.times}</span>}
                              </p>
                              <p className="text-xs text-muted-foreground break-words">
                                Said: <span lang="en">&ldquo;{p.quote}&rdquo;</span>
                                {!p.exact && " (close)"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {l.fixes.length > 0 && (
                        <ul className="space-y-2" aria-label="Fixes">
                          {l.fixes.map((f) => (
                            <li key={f.id} className="rounded-xl border border-border p-3 space-y-1">
                              <p className="text-xs text-muted-foreground break-words">
                                Said: <span lang="en">&ldquo;{f.quote}&rdquo;</span>
                              </p>
                              <p className="text-sm text-foreground break-words">
                                Better: <span lang="en">&ldquo;{f.correction}&rdquo;</span>
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
