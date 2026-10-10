import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { canEditCourse } from "@/lib/courseAccess";
import { getAuthoredLessonRef } from "@/lib/courseAuthoring";
import { LESSON_ACCESS_LEVEL_LABELS } from "@/lib/lessonAccessLevels";
import { getLessonNav, readPublicLesson } from "@/lib/publicLesson";
import { createAnonClient } from "@/lib/supabase/anon";
import { LessonBand } from "@/app/(english)/courses/[courseSlug]/[lessonSlug]/LessonBand";
import { LessonUnavailable } from "@/app/(english)/courses/[courseSlug]/[lessonSlug]/LessonUnavailable";

// AUTH-009 — what an anonymous visitor sees on this lesson's public page.
// Nothing here decides the state: the lesson is read through the public
// lesson page's own path (`readPublicLesson`, i.e. RLS + `lesson_state`,
// migration 055) with a session-less anon client, and whatever it returns is
// rendered with the same components the lesson page uses (`LessonBand`,
// `LessonUnavailable`). The editor's own session would always read "open"
// (can_read_lesson's editor branch), which is why the anon client is used.
//
// Same two-layer gate as the editor and preview pages: can_edit_course on the
// URL's course id, then the lesson must belong to that course.
export default async function LessonVisitorViewPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id: courseId, lessonId } = await params;

  if (!(await canEditCourse(courseId))) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">You need admin or delegated-editor access to see this page.</p>
      </div>
    );
  }

  const ref = await getAuthoredLessonRef(lessonId);
  if (!ref || ref.courseId !== courseId) notFound();

  const anon = createAnonClient();
  const visitor = await readPublicLesson(anon, ref.courseSlug, ref.lessonSlug);
  const publicPath = `/courses/${ref.courseSlug}/${ref.lessonSlug}`;

  let body;
  if (visitor.state === "not_available") {
    const nav = await getLessonNav(visitor.courseId, ref.lessonSlug, anon);
    body = (
      <div className="overflow-hidden rounded-2xl border border-border">
        <LessonUnavailable
          band={
            <LessonBand
              courseSlug={ref.courseSlug}
              courseTitle={visitor.courseTitle}
              title={visitor.title}
              description={visitor.description}
              position={nav && { index: nav.position, total: nav.total }}
              estimatedMinutes={visitor.estimatedMinutes}
              itemCount={visitor.itemCount}
              account={null}
            />
          }
          courseSlug={ref.courseSlug}
          lessonPath={publicPath}
          state={visitor}
        />
      </div>
    );
  } else if (visitor.state === "ok") {
    body = (
      <p className="rounded-2xl border border-border bg-card p-5 text-sm text-foreground">
        A visitor who isn&rsquo;t signed in can open this lesson, so there is no denied screen.{" "}
        <Link href={publicPath} className="text-brand-text underline underline-offset-2">
          Open the lesson page
        </Link>
      </p>
    );
  } else {
    body = (
      <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Visitors can&rsquo;t reach this lesson yet. Publish the lesson and the course, then come back to see what
        they get.
      </p>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link
          href={`/app/admin/courses/${courseId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} />
          Back to course
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-1">Visitor view: {ref.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {LESSON_ACCESS_LEVEL_LABELS[ref.accessLevel]}. This is what a visitor who isn&rsquo;t signed in sees at{" "}
          <span className="font-mono">{publicPath}</span>, read the same way the lesson page reads it.
        </p>
      </div>
      {body}
    </div>
  );
}
