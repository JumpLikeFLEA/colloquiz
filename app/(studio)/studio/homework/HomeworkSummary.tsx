import Link from "next/link";
import type { ReactNode } from "react";
import type { HomeworkView } from "@/lib/homework/homework";
import { DONE_PILL, dueLabel, homeworkTitle, MUTED_PILL } from "./HomeworkCard";

// TCH-005 (docs/decisions/0152) — a short list of assignments on the learner,
// group and course pages, each linking to its card on /studio/homework.
// `studentId` narrows the status to that student (done or not yet); without
// it the status is "N of M done". Composed from the roster cards' link-row
// frame; no new tokens.

export function HomeworkSummary({
  title,
  homework,
  studentId,
  empty,
  action,
  today,
}: {
  title: string;
  homework: HomeworkView[];
  studentId?: string;
  empty: string;
  action: ReactNode;
  today: Date;
}) {
  return (
    <section className="space-y-2" data-studio="homework-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {homework.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {homework.map((h) => {
            const mine = studentId ? h.recipients.find((r) => r.studentId === studentId) : null;
            const due = dueLabel(h.dueOn, today);
            return (
              <li key={h.id}>
                <Link
                  href={`/studio/homework#hw-${h.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
                >
                  <span className="text-sm font-medium text-foreground min-w-0 break-words">{homeworkTitle(h)}</span>
                  {due && <span className={MUTED_PILL}>{due}</span>}
                  {mine ? (
                    <span className={mine.done ? DONE_PILL : MUTED_PILL}>
                      {mine.done ? "Done" : mine.totalLessons > 1 ? `${mine.doneLessons} of ${mine.totalLessons} lessons` : "Not yet"}
                    </span>
                  ) : (
                    <span className={h.recipients.length > 0 && h.doneCount === h.recipients.length ? DONE_PILL : MUTED_PILL}>
                      {h.recipients.length === 0 ? "No one yet" : `${h.doneCount} of ${h.recipients.length} done`}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
