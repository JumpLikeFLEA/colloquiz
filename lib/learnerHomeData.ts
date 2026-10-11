import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPublicCourse } from "@/lib/coursePage";
import { courseProgress, type AttemptsByLessonSlug, type CourseProgress } from "@/lib/coursePageProgress";
import {
  feedbackItems,
  listedCourses,
  nextCall,
  type FeedbackItem,
  type FeedbackRow,
  type HomeCall,
  type HomeCourse,
  type HomeEnrolment,
} from "@/lib/learnerHome";

/**
 * PROG-002 (docs/decisions/0120) — the learner home's reads. Every read runs
 * under the learner's own session and is scoped by the existing RLS and
 * SECURITY DEFINER readers; nothing here widens or re-decides it:
 *   - courses "published read" (028): the published catalogue;
 *   - get_course_attempt_summary (050), once per published course: the
 *     learner's own best score per lesson, across every lesson version.
 *     This is how "attempted" is found without a new SQL function: a
 *     lesson_attempts embed through lesson_versions loses attempts on a
 *     superseded version (050's header);
 *   - run_enrolments "owner read" (058), non-revoked rows only;
 *   - course_entitlements "owner read" (041);
 *   - getPublicCourse (lib/coursePage.ts): each listed course's published
 *     lessons with their SQL states (055 course_lesson_states);
 *   - course_calls (058), only for courses with an extended enrolment;
 *   - voice_submissions + voice_feedback "owner reads published" (060),
 *     and run_final_comments "owner reads published" (061).
 *
 * The voice and final-comment reads also filter `user_id = me`, and the
 * feedback read filters `published_at IS NOT NULL`: the "editor read"
 * policies on those tables return OTHER learners' rows and drafts to a
 * learner who is also an editor of the course (060:183-213, 061:81-91).
 * Those filters only drop rows.
 */

export type HomeCourseCard = {
  course: HomeCourse;
  enrolments: HomeEnrolment[];
  granted: boolean;
  progress: CourseProgress;
};

export type LearnerHome = {
  courses: HomeCourseCard[];
  nextCall: (HomeCall & { courseSlug: string; courseTitle: string }) | null;
  feedback: FeedbackItem[];
};

type EnrolmentRow = {
  run_id: string;
  tier: "basic" | "extended";
  course_runs: { title: string | null; starts_at: string; course_id: string };
};

type CourseRef = { slug: string; title: string } | null;

type VoiceRow = {
  id: string;
  lessons: { slug: string; title: string } | null;
  courses: CourseRef;
  voice_feedback: { body: unknown; published_at: string | null } | null;
};

type FinalRow = { run_id: string; body: unknown; published_at: string | null; courses: CourseRef };

/** Null when nobody is signed in; the page redirects to sign-in then. */
export async function getLearnerHome(now: Date): Promise<LearnerHome | null> {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return null;

  const { data: courseRows, error: coursesErr } = await supabase
    .from("courses")
    .select("id, slug, title, level, cover_image_url, format")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (coursesErr) throw new Error(coursesErr.message);
  const published: HomeCourse[] = (courseRows ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    level: c.level,
    coverImageUrl: c.cover_image_url,
    format: c.format === "cohort" ? "cohort" : "self_paced",
  }));

  const [summaries, enrolmentsRes, grantsRes, voiceRes, finalRes] = await Promise.all([
    Promise.all(
      published.map(async (c) => {
        const { data, error } = await supabase.rpc("get_course_attempt_summary", { p_course_id: c.id });
        if (error) throw new Error(error.message);
        const attempts: Record<string, { bestPercent: number }> = {};
        for (const row of data ?? []) attempts[row.lesson_slug] = { bestPercent: row.best_percent };
        return [c.id, attempts] as const;
      }),
    ),
    supabase
      .from("run_enrolments")
      .select("run_id, tier, course_runs!inner(title, starts_at, course_id)")
      .eq("user_id", user.id)
      .is("revoked_at", null),
    supabase.from("course_entitlements").select("course_id").eq("user_id", user.id),
    supabase
      .from("voice_submissions")
      .select("id, lessons(slug, title), courses(slug, title), voice_feedback!inner(body, published_at)")
      .eq("user_id", user.id)
      .not("voice_feedback.published_at", "is", null),
    supabase
      .from("run_final_comments")
      .select("run_id, body, published_at, courses(slug, title)")
      .eq("user_id", user.id)
      .not("published_at", "is", null),
  ]);
  if (enrolmentsRes.error) throw new Error(enrolmentsRes.error.message);
  if (grantsRes.error) throw new Error(grantsRes.error.message);
  if (voiceRes.error) throw new Error(voiceRes.error.message);
  if (finalRes.error) throw new Error(finalRes.error.message);

  const attemptsByCourse = new Map<string, AttemptsByLessonSlug>(summaries);
  const attempted = new Set(summaries.filter(([, a]) => Object.keys(a).length > 0).map(([id]) => id));
  const enrolments: HomeEnrolment[] = ((enrolmentsRes.data ?? []) as unknown as EnrolmentRow[]).map((e) => ({
    courseId: e.course_runs.course_id,
    runId: e.run_id,
    runTitle: e.course_runs.title,
    runStartsAt: e.course_runs.starts_at,
    tier: e.tier,
  }));
  const granted = new Set((grantsRes.data ?? []).map((g) => g.course_id as string));
  const listed = listedCourses(published, attempted, enrolments, granted);

  const [cards, callLists] = await Promise.all([
    Promise.all(
      listed.map(async (l): Promise<HomeCourseCard | null> => {
        const course = await getPublicCourse(l.course.slug);
        if (course.state === "not_found") return null;
        return {
          course: l.course,
          enrolments: l.enrolments,
          granted: l.granted,
          progress: courseProgress(course.lessons, attemptsByCourse.get(l.course.id) ?? {}),
        };
      }),
    ),
    Promise.all(
      listed
        .filter((l) => l.enrolments.some((e) => e.tier === "extended"))
        .map(async (l) => {
          const { data, error } = await supabase.rpc("course_calls", { p_course_id: l.course.id });
          if (error) throw new Error(error.message);
          return ((data ?? []) as { call_id: string; run_id: string; starts_at: string; meet_url: string; title: string | null }[]).map(
            (c): HomeCall => ({
              id: c.call_id,
              runId: c.run_id,
              courseId: l.course.id,
              startsAt: c.starts_at,
              meetUrl: c.meet_url,
              title: c.title,
            }),
          );
        }),
    ),
  ]);

  const call = nextCall(callLists.flat(), enrolments, now);
  const callCourse = call ? published.find((c) => c.id === call.courseId) : undefined;

  const rows: FeedbackRow[] = [
    ...((voiceRes.data ?? []) as unknown as VoiceRow[])
      .filter((r) => r.voice_feedback?.published_at)
      .map(
        (r): FeedbackRow => ({
          kind: "voice",
          submissionId: r.id,
          courseSlug: r.courses?.slug ?? null,
          courseTitle: r.courses?.title ?? null,
          lessonSlug: r.lessons?.slug ?? null,
          lessonTitle: r.lessons?.title ?? null,
          publishedAt: r.voice_feedback!.published_at!,
          body: r.voice_feedback!.body,
        }),
      ),
    ...((finalRes.data ?? []) as unknown as FinalRow[])
      .filter((r) => r.published_at)
      .map(
        (r): FeedbackRow => ({
          kind: "final",
          runId: r.run_id,
          courseSlug: r.courses?.slug ?? null,
          courseTitle: r.courses?.title ?? null,
          publishedAt: r.published_at!,
          body: r.body,
        }),
      ),
  ];

  return {
    courses: cards.filter((c): c is HomeCourseCard => c !== null),
    nextCall: call && callCourse ? { ...call, courseSlug: callCourse.slug, courseTitle: callCourse.title } : null,
    feedback: feedbackItems(rows, (key) => console.error(`feedback ${key} does not parse as FeedbackContent`)),
  };
}
