import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicLesson } from "@/lib/publicLesson";
import { getPublicCourse } from "@/lib/coursePage";
import { getNextCatalogueCourse } from "@/lib/publicCatalogue";
import type { LessonCourseContext } from "@/lib/courseCompletion";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { getCourseAttemptSummary } from "@/lib/courseAttempts";
import { bestScoreForLesson, lessonNav, type AttemptsByLessonSlug } from "@/lib/coursePageProgress";
import { getVoiceTasksContext } from "@/lib/voiceTaskContext";
import { getAskTeacherOptions } from "@/lib/askTeacher/askTeacherServer";
import { homeworkForLesson, homeworkPillText } from "@/lib/homework/homework";
import { getMyHomework } from "@/lib/homework/homeworkServer";
import { AccountMenu } from "../../../AccountMenu";
import { LessonBand } from "./LessonBand";
import { LessonPageClient } from "./LessonPageClient";
import { LessonUnavailable } from "./LessonUnavailable";
import { LinkedLesson } from "./LinkedLesson";
import { StripBackLink } from "./StripBackLink";

/**
 * PLAY-006 — the first genuinely public read path. Replaces SHELL-007's
 * placeholder (which deliberately read no data, to prove the route group and
 * layout in isolation). Reads with the anon key and no session for an
 * anonymous visitor, or that caller's own JWT when signed in — see
 * lib/publicLesson.ts for how `state` is decided. This Server Component
 * fetches `next/headers` cookies via lib/supabase/server.ts, which makes the
 * route dynamic — correct for now (docs/decisions/0056): any future caching
 * of this route may only ever cache the free-sample case, never a
 * caller-specific entitlement result.
 *
 * attemptId is generated here, per request, server-side (docs/decisions/0029
 * Decision 1) — never derived from anything the client sends.
 */
// SHELL-009 — title/description visible for every lesson regardless of
// entitlement (docs/handoff.md, "Preview, precisely"), so this reads the
// same "not_available" (paid) state as the page and still returns real
// metadata for it, not a placeholder. og:image comes from the co-located
// opengraph-image.tsx; cache() (lib/publicLesson.ts) dedupes the repeat
// getPublicLesson call between this function and the page component.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug, lessonSlug } = await params;
  const lesson = await getPublicLesson(courseSlug, lessonSlug);
  if (lesson.state === "not_found") return {};

  return {
    title: lesson.title,
    description: lesson.description ?? undefined,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const lesson = await getPublicLesson(courseSlug, lessonSlug);

  if (lesson.state === "not_found") notFound();

  // PROG-008 (docs/decisions/0209): the course's lessons and their SQL states
  // come from the course page's own read (cached per request), which replaces
  // getLessonNav's lessons read here: the same published lessons in the same
  // ordinal-then-slug order, so "Lesson N of M" is unchanged.
  const course = await getPublicCourse(courseSlug);
  const navInfo = course.state === "ok" ? lessonNav(course.lessons, lessonSlug) : null;
  const nav = navInfo && {
    position: navInfo.position,
    total: navInfo.total,
    next: navInfo.next ? { slug: navInfo.next.slug, title: navInfo.next.title } : null,
  };
  // SHELL-019 (docs/decisions/0086): the account chip, always English here
  // (lesson chrome, docs/decisions/0080 Decision 5).
  const signedIn = await getSignedInAccount();
  // TCH-005 (docs/decisions/0152): a signed-in learner whose teacher assigned
  // this lesson (or its course) sees a "Homework" pill with the due date. A
  // failed read shows no pill rather than failing the lesson.
  const homework = signedIn ? await getHomeworkPill(lesson.courseId, lessonSlug) : null;
  const band = (
    <LessonBand
      courseSlug={courseSlug}
      courseTitle={lesson.courseTitle}
      title={lesson.title}
      description={lesson.description}
      position={nav && { index: nav.position, total: nav.total }}
      estimatedMinutes={lesson.estimatedMinutes}
      itemCount={lesson.itemCount}
      homework={homework}
      account={
        signedIn && <AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang="en" next={`/courses/${courseSlug}/${lessonSlug}`} />
      }
    />
  );

  if (lesson.state === "not_available") {
    // docs/decisions/0079 D8; ANON-011's sign-in prompt (0104). The course
    // editor's "Visitor view" renders the same component (AUTH-009).
    return (
      <main className="grid-paper flex-1">
        <LessonUnavailable
          band={band}
          courseSlug={courseSlug}
          lessonPath={`/courses/${courseSlug}/${lessonSlug}`}
          state={lesson}
        />
      </main>
    );
  }

  const attemptId = crypto.randomUUID();

  // TCH-006 (docs/decisions/0153): the teachers this student may ask about the
  // lesson, started now and awaited below so it overlaps the other reads. Read
  // for a signed-in learner only: an anonymous visitor pays nothing, and a
  // learner nobody qualifies for gets no link and downloads no dialog code.
  const askPromise = signedIn ? getAskTeacherOptions(lesson.lessonId) : null;
  const nextCoursePromise = getNextCatalogueCourse(courseSlug);

  // docs/decisions/0088 — the same "Best" the course page shows for this
  // lesson. A failed read shows no note rather than failing the lesson.
  let summary: AttemptsByLessonSlug | null = null;
  if (signedIn) {
    try {
      summary = await getCourseAttemptSummary(lesson.courseId);
    } catch (err) {
      console.error("failed to read the lesson's best score", err);
    }
  }
  const previousBestPercent = summary ? bestScoreForLesson(lessonSlug, summary) : null;

  // PROG-008: what the completion card needs to say "Course complete" and
  // where to go next. A signed-in learner whose summary failed to read gets
  // no context, and the card falls back to the next lesson in course order,
  // rather than deciding completion from an empty map.
  const nextCourse = await nextCoursePromise;
  const courseContext: LessonCourseContext | undefined =
    course.state === "ok" && (!lesson.isSignedIn || summary)
      ? {
          title: course.title,
          lessonSlug,
          lessons: course.lessons.map((l) => ({
            slug: l.slug,
            title: l.title,
            state: l.state,
            versionId: course.versionIds[l.slug] ?? null,
            itemCount: l.itemCount,
          })),
          attempts: lesson.isSignedIn ? summary : null,
          nextCourse,
        }
      : undefined;

  // VOICE-005 (docs/decisions/0111) — read only when the lesson has a voice
  // task, so every other lesson pays nothing for it.
  const hasVoiceTask = lesson.document.some(
    (block) => typeof block === "object" && block !== null && (block as { kind?: unknown }).kind === "task",
  );
  const voiceTasks = hasVoiceTask ? await getVoiceTasksContext(lesson.lessonId, lesson.courseId, lesson.state === "ok") : undefined;

  const ask = askPromise ? await askPromise : null;

  const pageProps = {
    header: band,
    backLink: <StripBackLink courseSlug={courseSlug} />,
    document: lesson.document,
    lessonTitle: lesson.title,
    attemptId,
    courseSlug,
    nextLesson: nav?.next ?? null,
    lessonVersionId: lesson.lessonVersionId,
    isSignedIn: lesson.isSignedIn,
    lessonPath: `/courses/${courseSlug}/${lessonSlug}`,
    previousBestPercent,
    voiceTasks,
    course: courseContext,
  };

  // TCH-006 (docs/decisions/0153): a student with a teacher to ask gets the
  // sibling client with the "Ask the teacher" links, as a lazy chunk; everyone
  // else gets the page client untouched.
  if (ask) {
    return (
      <LinkedLesson
        {...pageProps}
        askTeacher={{
          studentId: ask.studentId,
          teachers: ask.teachers,
          course: { slug: courseSlug, title: lesson.courseTitle },
          lesson: { id: lesson.lessonId, slug: lessonSlug, title: lesson.title },
          versionId: lesson.lessonVersionId,
        }}
      />
    );
  }
  return <LessonPageClient {...pageProps} />;
}


async function getHomeworkPill(courseId: string, lessonSlug: string): Promise<string | null> {
  try {
    const h = homeworkForLesson(await getMyHomework(), courseId, lessonSlug);
    return h ? homeworkPillText(h, new Date()) : null;
  } catch (err) {
    console.error("failed to read the lesson's homework", err);
    return null;
  }
}
