import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { canEditCourse } from "@/lib/courseAccess";
import { getAuthoredCourseDetail } from "@/lib/courseAuthoring";
import { pluralize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AVERAGE_MIN_LEARNERS, formatAverage, groupCourseStats, type LessonStat } from "@/lib/courseStats";

// AUTH-014 — which lesson loses learners and which exercise is broken or
// too hard, without identifying anyone (docs/decisions/0109 Decision 9,
// 0121). Every number comes from course_stats() (065), which returns no
// rows unless the caller can edit the course and withholds an exercise's
// average below 5 learners. canEditCourse() is the page gate, the same as
// the course editor's; it is not the data boundary.

export const metadata = { title: "Course stats" };

export default async function CourseStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await canEditCourse(id))) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin or delegated-editor access to see this page.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [detail, stats] = await Promise.all([
    getAuthoredCourseDetail(id, false),
    supabase.rpc("course_stats", { p_course_id: id }),
  ]);
  if (!detail) notFound();
  if (stats.error) throw new Error(stats.error.message);

  const lessons = groupCourseStats((stats.data ?? []) as Record<string, unknown>[]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      <div>
        <Link
          href={`/studio/courses/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {detail.course.title}
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2">Stats</h1>
        <div className="text-xs text-muted-foreground mt-1 space-y-1">
          <p>
            Signed-in learners only. A visitor who isn&rsquo;t signed in keeps their answers in their own
            browser, so they aren&rsquo;t counted here.
          </p>
          <p>
            An exercise&rsquo;s average is each learner&rsquo;s first try. It shows once {AVERAGE_MIN_LEARNERS}{" "}
            learners have tried the exercise, so no one&rsquo;s score can be picked out. Editing an exercise starts
            its average over.
          </p>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          No published lessons yet.
        </div>
      ) : (
        <div className="space-y-3">
          {lessons.map((l, i) => (
            <LessonStatCard key={l.lessonId} lesson={l} number={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonStatCard({ lesson, number }: { lesson: LessonStat; number: number }) {
  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {number}. {lesson.title}
          </h2>
          {lesson.week !== null && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
              Week {lesson.week}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm max-w-xs">
          <div>
            <dt className="text-xs text-muted-foreground">Opened</dt>
            <dd className="font-medium text-foreground">{pluralize(lesson.opened, "learner")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completed</dt>
            <dd className="font-medium text-foreground">{pluralize(lesson.completed, "learner")}</dd>
          </div>
        </dl>
      </div>

      {lesson.exercises.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">No exercises in this lesson.</p>
      ) : (
        <ul className="border-t border-border divide-y divide-border">
          {lesson.exercises.map((e) => (
            <li key={e.blockId} className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">Exercise {e.number}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{e.type}</span>
                </div>
                {e.promptText && <p className="text-sm text-muted-foreground line-clamp-2">{e.promptText}</p>}
              </div>
              <div className="sm:w-48 shrink-0 space-y-1">
                {e.average === null ? (
                  <p className="text-xs text-muted-foreground">
                    {pluralize(e.learners, "learner")} · average shows from {AVERAGE_MIN_LEARNERS}
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{formatAverage(e.average)}</span>
                      <span className="text-xs text-muted-foreground">{pluralize(e.learners, "learner")}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-brand" style={{ width: formatAverage(e.average) }} />
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
