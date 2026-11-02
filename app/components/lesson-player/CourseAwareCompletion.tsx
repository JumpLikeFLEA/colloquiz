"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { LessonScoreResult } from "@/lib/items";
import type { AttemptsByLessonSlug, CourseProgress } from "@/lib/coursePageProgress";
import { courseCompletionView, type LessonCourseContext } from "@/lib/courseCompletion";
import { anonAttemptSummary, anonStoreSnapshot, parseAnonSnapshot } from "@/lib/lessonPlayer/anonProgress";
import type { NextLessonLink } from "@/lib/publicLesson";
import { ShareLinkButton } from "@/app/components/ShareLinkButton";
import { OFFSET_CTA_CLASS, OUTLINE_CTA_CLASS } from "@/app/(english)/surfaceClasses";

/**
 * PROG-008 (docs/decisions/0209) — the course-aware half of the completion
 * card, a lazy chunk `LessonCompletion` loads only once the lesson is
 * complete. Bundled into the lesson's first load it put the free lesson at
 * 260.9 KB of its 260 KB budget (`npm run budget`, 256.7 KB before the card).
 *
 * It decides, from the course summary plus this session, whether the lesson
 * finished the course. If so it draws the course-complete card; if not it
 * hands the pick for "Next lesson" back to `renderLesson`, which draws the
 * ordinary completed-lesson card (kept in the main chunk, so the fallback
 * shown while this loads is the same card).
 */
export default function CourseAwareCompletion({
  course,
  courseSlug,
  lessonScore,
  renderLesson,
}: {
  course: LessonCourseContext;
  courseSlug: string;
  /** This session's score when every exercise is answered; null for a lesson
   * with no exercises, which is complete once opened (0143). */
  lessonScore: LessonScoreResult | null;
  renderLesson: (next: NextLessonLink | null) => ReactNode;
}) {
  const attempts = useCourseAttempts(course);
  const view = courseCompletionView(course.lessons, attempts, {
    slug: course.lessonSlug,
    complete: true,
    percent: lessonScore?.status === "scored" ? lessonScore.percent : null,
  });
  if (!view.complete) return renderLesson(view.next);
  return <CourseCompleteCard course={course} courseSlug={courseSlug} progress={view.progress} lessonScore={lessonScore} />;
}

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const EMPTY_SNAPSHOT = "";
const NEVER_CHANGES = () => () => {};

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * PROG-008 — the learner's per-lesson summary for this course: the server's
 * for a signed-in learner, else built from this browser's attempt and opens
 * stores (PROG-003's `anonAttemptSummary`, over the lessons open to the
 * visitor). The server snapshot is empty, so the first client render matches
 * the server HTML. getSnapshot re-reads on every render, so attempts this
 * session wrote are picked up with the next answer; the session's own result
 * is folded in by `courseCompletionView` either way.
 */
function useCourseAttempts(course: LessonCourseContext): AttemptsByLessonSlug {
  const anonymous = course.attempts === null;
  const snapshot = useSyncExternalStore(
    NEVER_CHANGES,
    () => (anonymous ? anonStoreSnapshot(readStore) : EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  );
  return useMemo(() => {
    if (course.attempts) return course.attempts;
    const { attempts, opens } = snapshot === EMPTY_SNAPSHOT ? { attempts: [], opens: [] } : parseAnonSnapshot(snapshot);
    const local = course.lessons.flatMap((l) =>
      l.state === "open" && l.versionId ? [{ slug: l.slug, versionId: l.versionId, itemCount: l.itemCount }] : [],
    );
    return anonAttemptSummary(local, attempts, opens);
  }, [course, snapshot]);
}

/** PROG-008 — the finish. The marker-yellow card of a completed lesson, with
 * the two course numbers side by side (never one blended figure), this
 * lesson's own score in a quiet line, the next listed course, and a share
 * link to `/completed/<course>`, whose card shows no score (0209 Decision 5). */
function CourseCompleteCard({
  course,
  courseSlug,
  progress,
  lessonScore,
}: {
  course: LessonCourseContext;
  courseSlug: string;
  progress: CourseProgress;
  lessonScore: LessonScoreResult | null;
}) {
  const c = alliengllCopy.completion;
  return (
    <section className="flex flex-col items-center gap-2 rounded-3xl border-2 border-ink bg-highlight px-6 py-10 text-center text-highlight-foreground shadow-offset sm:px-10">
      <h2 className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 py-1 text-sm font-semibold text-foreground">
        <Trophy className="size-4" aria-hidden="true" />
        {c.courseComplete}
      </h2>
      <p className="max-w-full break-words pt-3 font-display text-2xl font-extrabold leading-tight tracking-tight text-balance">
        {course.title}
      </p>
      <dl className="grid w-full max-w-sm grid-cols-2 gap-3 pt-4">
        <div className="flex flex-col-reverse gap-0.5 rounded-xl border-2 border-ink bg-card px-4 py-3 text-foreground">
          <dt className="text-xs text-muted-foreground">{c.courseLessons}</dt>
          <dd className="font-display text-xl font-extrabold tabular-nums">
            {progress.attempted} {c.scoreOf} {progress.total}
          </dd>
        </div>
        {progress.averagePercent !== null && (
          <div className="flex flex-col-reverse gap-0.5 rounded-xl border-2 border-ink bg-card px-4 py-3 text-foreground">
            <dt className="text-xs text-muted-foreground">{c.courseAverage}</dt>
            <dd className="font-display text-xl font-extrabold tabular-nums">{progress.averagePercent}%</dd>
          </div>
        )}
      </dl>
      {lessonScore?.status === "scored" && (
        <p className="pt-1 text-sm tabular-nums text-highlight-foreground/75">
          {c.thisLesson}: {lessonScore.percent}% ({pointsFormat.format(lessonScore.earned)} {c.scoreOf}{" "}
          {pointsFormat.format(lessonScore.possible)})
        </p>
      )}
      {course.nextCourse && (
        <Link href={`/courses/${course.nextCourse.slug}`} className={`${OFFSET_CTA_CLASS} mt-5 max-w-full text-sm`}>
          <span className="min-w-0 text-balance">
            {c.nextCourse}: {course.nextCourse.title}
          </span>
          <ArrowRight className="size-4 flex-none transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      )}
      <div className={`flex flex-wrap items-center justify-center gap-3 ${course.nextCourse ? "pt-2" : "pt-5"}`}>
        <ShareLinkButton
          path={`/completed/${courseSlug}`}
          title={course.title}
          text={c.shareText}
          label={c.share}
          copiedLabel={c.shareCopied}
          className={OUTLINE_CTA_CLASS}
        />
        <Link href={`/courses/${courseSlug}`} className={OUTLINE_CTA_CLASS}>
          {alliengllCopy.player.backToCourse}
        </Link>
      </div>
    </section>
  );
}
