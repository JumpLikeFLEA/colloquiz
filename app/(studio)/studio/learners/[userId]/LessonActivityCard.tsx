import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import type { CourseLessons } from "@/lib/learners/detail";
import { weekLabel } from "../../reviews/statusLabels";

// One course's lessons for one learner (learner_lessons(), 064): the
// roster's columns (063) broken down per lesson. Every value comes from SQL;
// this only lays it out. No scores (docs/decisions/0109 Decision 8).

export function LessonActivityCard({ course }: { course: CourseLessons }) {
  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{course.courseTitle}</h3>
        <p className="text-xs text-muted-foreground">
          Opened {course.openedCount} of {course.listedCount} · completed {course.completedCount} of{" "}
          {course.listedCount}
        </p>
      </div>
      <ol className="border-t border-border divide-y divide-border">
        {course.lessons.map((l) => (
          <li key={l.lessonId} className="px-4 py-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {l.lessonOrdinal}. {l.lessonTitle}
              </span>
              {l.week != null && (
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                  {weekLabel(l.week)}
                </span>
              )}
              {!l.lessonListed && (
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                  No longer published
                </span>
              )}
              {l.firstCompletedAt ? (
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-brand-subtle text-brand-text">
                  Completed
                </span>
              ) : l.opened ? (
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                  Opened
                </span>
              ) : null}
            </div>
            {l.opened ? (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="inline">Last opened: </dt>
                  <dd className="inline">{l.lastOpenedAt ? <LocalTime iso={l.lastOpenedAt} /> : "not recorded"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="inline">Completed: </dt>
                  <dd className="inline">
                    {l.firstCompletedAt ? <LocalTime iso={l.firstCompletedAt} /> : "not yet"}
                  </dd>
                </div>
                {l.voicesSent > 0 && (
                  <div className="min-w-0">
                    <dt className="inline">Recordings: </dt>
                    <dd className="inline">
                      {l.voicesSent} sent · {l.voicesAnswered} answered
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">Not opened</p>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
