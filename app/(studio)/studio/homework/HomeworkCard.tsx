import Link from "next/link";
import { dueState, formatDueDate, type HomeworkView } from "@/lib/homework/homework";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { HomeworkActions } from "./HomeworkActions";

// TCH-005 (docs/decisions/0152) — one assignment on /studio/homework: what
// was assigned, to whom, and per current recipient done or not yet (the
// lesson_completion rule, 075), the best score and the last activity. A
// Server Component; only the edit/delete buttons are client code. Composed
// from the runs page's card frame, the learner page's pills and native
// <details>; no new tokens. Recipients are exactly the rows
// teacher_homework_progress() returns, i.e. who currently receives it.

export const MUTED_PILL = "text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground";
export const DONE_PILL = "text-xs px-2 py-0.5 rounded-full shrink-0 bg-brand-subtle text-brand-text";

/** "Due 20 Oct" / "Was due 20 Oct" / null. Information only; never a lock. */
export function dueLabel(dueOn: string | null, today: Date): string | null {
  if (!dueOn) return null;
  const when = formatDueDate(dueOn, "en-GB", today);
  return dueState(dueOn, today) === "past" ? `Was due ${when}` : `Due ${when}`;
}

export function homeworkTitle(h: Pick<HomeworkView, "courseTitle" | "lessonTitle">): string {
  return h.lessonTitle ? `${h.courseTitle} · ${h.lessonTitle}` : `${h.courseTitle} · whole course`;
}

export function HomeworkCard({
  homework: h,
  labelOf,
  groupNames,
  today,
}: {
  homework: HomeworkView;
  labelOf: (studentId: string) => string;
  groupNames: Map<string, string>;
  today: Date;
}) {
  const due = dueLabel(h.dueOn, today);
  const title = homeworkTitle(h);
  const groups = h.groupIds.map((id) => groupNames.get(id)).filter((n): n is string => !!n);
  const direct = h.studentIds.map(labelOf);

  return (
    <article id={`hw-${h.id}`} className="rounded-2xl border border-border bg-card overflow-hidden scroll-mt-20">
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-foreground min-w-0 break-words">{title}</h2>
          {due && <span className={MUTED_PILL}>{due}</span>}
          <span className={h.recipients.length > 0 && h.doneCount === h.recipients.length ? DONE_PILL : MUTED_PILL}>
            {h.recipients.length === 0 ? "No one yet" : `${h.doneCount} of ${h.recipients.length} done`}
          </span>
          {!h.coursePublished && <span className={MUTED_PILL}>Course not published: students don&apos;t see it</span>}
        </div>
        {h.note && <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{h.note}</p>}
        <p className="text-xs text-muted-foreground break-words">
          For:{" "}
          {[...groups.map((g) => `${g} (group)`), ...direct].join(", ") || "no one: every student left or was removed"}
        </p>
        <HomeworkActions assignmentId={h.id} title={title} dueOn={h.dueOn} note={h.note} />
      </div>

      {h.recipients.length > 0 && (
        <details className="border-t border-border group">
          <summary className="px-4 py-3 text-sm font-medium text-foreground cursor-pointer list-none min-h-11 flex items-center">
            Students ({h.recipients.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {h.recipients.map((r) => (
              <li key={r.studentId} className="px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/studio/learners/${r.studentId}`}
                    className="text-sm font-medium text-foreground break-all min-w-0 hover:underline"
                  >
                    {labelOf(r.studentId)}
                  </Link>
                  {r.done ? (
                    <span className={DONE_PILL}>Done</span>
                  ) : (
                    <span className={MUTED_PILL}>
                      {r.totalLessons > 1 ? `${r.doneLessons} of ${r.totalLessons} lessons` : "Not yet"}
                    </span>
                  )}
                  {r.bestPercent != null && <span className={MUTED_PILL}>Best: {r.bestPercent}%</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last activity: {r.lastActivityAt ? <LocalTime iso={r.lastActivityAt} /> : "none yet"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
