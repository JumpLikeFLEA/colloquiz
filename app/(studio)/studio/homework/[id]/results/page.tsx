import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { isHomeworkId } from "@/lib/homework/homework";
import { getHomeworkResults } from "@/lib/homework/homeworkServer";
import { buildResultsGrid, cellKey } from "@/lib/homework/results";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { loadHomeworkViews } from "../../data";
import { dueLabel, homeworkTitle, MUTED_PILL } from "../../HomeworkCard";

// /studio/homework/[id]/results — an assignment's results by exercise (TCH-018,
// docs/decisions/0213). One row per current recipient, one column per exercise,
// each cell the student's best attempt as earned/possible. A cell is a link
// (?s=<student>&e=<lesson>:<block>) that shows that answer under the grid: a
// Server Component with no client JS. Which students and which attempt are
// decided in SQL (homework_results, 106); the answer text is TCH-003's
// lib/learners/answerText. The assignment must be in the caller's own list, so
// another teacher's id is a 404, the same page an unknown id gets.

export const metadata = { title: "Homework results" };

export default async function HomeworkResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string; e?: string }>;
}) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const { id } = await params;
  if (!isHomeworkId(id)) notFound();
  const { views, labelOf } = await loadHomeworkViews();
  const h = views.find((v) => v.id === id);
  if (!h) notFound();

  const rows = await getHomeworkResults(id);
  const grid = buildResultsGrid(rows);
  const students = [...grid.studentIds].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  const q = await searchParams;
  const selected =
    q.s && q.e && grid.cells.get(q.s)?.get(q.e)
      ? { studentId: q.s, key: q.e, cell: grid.cells.get(q.s)!.get(q.e)! }
      : null;
  const selectedExercise = selected ? grid.lessons.flatMap((l) => l.exercises.map((e) => ({ l, e }))).find((x) => x.e.key === selected.key) : null;
  const today = new Date();
  const due = dueLabel(h.dueOn, today);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <Link
          href={`/studio/homework#hw-${h.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} aria-hidden />
          Homework
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground break-words">{homeworkTitle(h)}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {due && <span className={MUTED_PILL}>{due}</span>}
            <p className="text-sm text-muted-foreground">
              Results by exercise: each cell is the student&apos;s best attempt, earned/possible. Choose a cell to read the
              answer. A dash means no attempt yet on the current version of the lesson.
            </p>
          </div>
        </div>
      </div>

      {grid.lessons.length === 0 || students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          Nothing to show: this assignment has no current recipients, or its lessons have no exercises.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-card px-3 py-2 text-left align-bottom text-xs font-medium text-muted-foreground">
                  Student
                </th>
                {grid.lessons.map((l) => (
                  <th
                    key={l.lessonId}
                    scope="colgroup"
                    colSpan={Math.max(l.exercises.length, 1)}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground border-l border-border whitespace-nowrap"
                  >
                    {grid.lessons.length > 1 ? `${l.ordinal}. ${l.title}` : l.title}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border">
                {grid.lessons.flatMap((l) =>
                  l.exercises.map((e, i) => (
                    <th
                      key={e.key}
                      scope="col"
                      title={e.prompt ?? undefined}
                      className={`px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap ${i === 0 ? "border-l border-border" : ""}`}
                    >
                      {e.number}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((sid) => (
                <tr key={sid}>
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal align-top">
                    <Link
                      href={`/studio/learners/${sid}`}
                      className="block max-w-40 truncate text-foreground hover:underline"
                      title={labelOf(sid)}
                    >
                      {labelOf(sid)}
                    </Link>
                  </th>
                  {grid.lessons.flatMap((l) =>
                    l.exercises.map((e, i) => {
                      const cell = grid.cells.get(sid)?.get(cellKey(l.lessonId, e.blockId));
                      const isSel = selected?.studentId === sid && selected.key === e.key;
                      return (
                        <td key={e.key} className={`px-3 py-2 align-top whitespace-nowrap ${i === 0 ? "border-l border-border" : ""}`}>
                          {cell?.score ? (
                            <Link
                              href={`?s=${sid}&e=${encodeURIComponent(e.key)}#answer`}
                              scroll={false}
                              aria-current={isSel ? "true" : undefined}
                              className={`inline-block text-xs px-2 py-0.5 rounded-full tabular-nums hover:underline ${
                                isSel ? "bg-brand-subtle text-brand-text font-medium" : "bg-muted text-foreground"
                              }`}
                            >
                              {cell.score}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && selectedExercise && (
        <section id="answer" className="rounded-2xl border border-border bg-card p-4 space-y-2 scroll-mt-20">
          <p className="text-xs text-muted-foreground break-words">
            {labelOf(selected.studentId)} · {selectedExercise.l.title} · Exercise {selectedExercise.e.number}
            {selected.cell.attemptedAt && (
              <>
                {" · "}
                <LocalTime iso={selected.cell.attemptedAt} />
              </>
            )}
            {" · "}
            <span className="text-foreground font-medium">
              {selected.cell.earned} of {selected.cell.possible}
            </span>
          </p>
          {selectedExercise.e.prompt && <p className="text-sm text-foreground break-words">{selectedExercise.e.prompt}</p>}
          {selected.cell.answer?.status === "ok" ? (
            <ul className="text-sm text-foreground space-y-0.5">
              {selected.cell.answer.lines.map((line, j) => (
                <li key={j} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {selected.cell.answer?.status === "unreadable"
                ? "The answer can't be shown: the exercise no longer reads."
                : "No answer stored for this attempt."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
