import { CalendarClock } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { groupLessonsByWeek } from "@/lib/cohortCoursePage";
import { bestScoreForLesson, type AttemptsByLessonSlug, type PublicCourseLesson } from "@/lib/coursePageProgress";
import { LocalDateTime } from "../../LocalDateTime";
import { courseCopy } from "./courseCopy";
import { LessonListItem } from "./LessonListItem";

/**
 * COH-004 (docs/decisions/0108) — a cohort course's lesson list, grouped by
 * week: the weekless taster first ("Open lessons"), then Week 1, 2, … Each
 * `scheduled` lesson shows "Opens <date>" in the viewer's local time. When a
 * whole week opens at the same moment (the usual case), the date sits once in
 * the week's header instead of on every row.
 *
 * A Server Component. The state and the date come from `course_lesson_states`
 * (058); `LocalDateTime` only formats the instant in the browser's zone.
 */
export function CohortLessonList({
  lang,
  courseSlug,
  lessons,
  attempts,
  showFreeBadge,
}: {
  lang: SurfaceLang;
  courseSlug: string;
  lessons: readonly PublicCourseLesson[];
  attempts: AttemptsByLessonSlug;
  showFreeBadge: (lesson: PublicCourseLesson) => boolean;
}) {
  const c = courseCopy[lang];
  const locale = lang === "ru" ? "ru-RU" : "en-GB";

  return (
    <div className="flex flex-col gap-8">
      {groupLessonsByWeek(lessons).map((group) => (
        <section key={group.week ?? "open"} className="flex flex-col gap-3" data-week={group.week ?? "none"}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              {group.week === null ? c.openLessonsGroup : `${c.week} ${group.week}`}
            </h3>
            {group.opensAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {c.opensOn} <LocalDateTime iso={group.opensAt} locale={locale} />
              </span>
            )}
          </div>
          <ol className="flex flex-col gap-3">
            {group.lessons.map((lesson) => (
              <LessonListItem
                key={lesson.slug}
                lang={lang}
                href={`/courses/${courseSlug}/${lesson.slug}`}
                position={lesson.position}
                lesson={lesson}
                showFreeBadge={showFreeBadge(lesson)}
                bestPercent={bestScoreForLesson(lesson.slug, attempts)}
                headingTag="h4"
                opensAt={
                  lesson.state === "scheduled" && lesson.opensAt && !group.opensAt ? (
                    <LocalDateTime iso={lesson.opensAt} locale={locale} />
                  ) : null
                }
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
