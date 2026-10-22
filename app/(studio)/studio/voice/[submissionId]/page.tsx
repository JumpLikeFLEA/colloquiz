import Link from "next/link";
import { notFound } from "next/navigation";
import { canEnterStudio, canEditCourse, getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";
import { contactLabels, readAnalyses, readTake, readTaskOf } from "@/lib/voice/analysis/studioRead";
import { SignedAudio } from "@/app/components/voice/SignedAudio";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { StudioAnalysis } from "../StudioAnalysis";

// /studio/voice/[submissionId] — one analysed take (VOICE-015, docs/decisions/0190): the signed
// audio and the learner's own AI feedback view, read-only, and Hide. The take is read under the
// caller's session and then checked with can_edit_course: a take that is the caller's OWN on a
// course they do not edit is visible to them through the owner policy, and is not theirs to
// review here. A take that is not there, or not the caller's to review, is the same 404.

export const metadata = { title: "AI feedback" };

export default async function VoiceDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const { submissionId } = await params;
  const supabase = await createClient();
  const take = await readTake(supabase, submissionId);
  if (!take || !(await canEditCourse(take.courseId))) notFound();

  const [analyses, task, course, lesson, labels] = await Promise.all([
    readAnalyses(supabase, [take.submissionId]),
    readTaskOf(supabase, take.versionId, take.blockId),
    supabase.from("courses").select("title").eq("id", take.courseId).maybeSingle(),
    supabase.from("lessons").select("title").eq("id", take.lessonId).maybeSingle(),
    contactLabels([take.userId]),
  ]);
  const analysis = analyses.get(take.submissionId);
  if (!analysis) notFound();

  const signed = take.objectName ? await signVoicePlaybackUrl(supabase, take.objectName) : null;
  const learner = labels.get(take.userId) || "Unknown learner";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/studio/voice" className="text-sm text-muted-foreground hover:text-foreground">
        ← AI feedback
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-bold text-foreground break-all">{learner}</h1>
        <p className="text-sm text-muted-foreground break-words">
          {course.data?.title ?? "Unknown course"} · {lesson.data?.title ?? "Unknown lesson"} ·{" "}
          {take.cohort ? "Cohort" : "Self-paced"}
        </p>
        <p className="text-xs text-muted-foreground">
          Sent <LocalTime iso={take.sentAt} />
        </p>
      </header>

      {task && (
        <section className="rounded-2xl border border-border bg-card px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Task</p>
          <p className="text-sm text-foreground whitespace-pre-line break-words">{task.prompt}</p>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card px-4 py-3">
        {take.objectName ? (
          <SignedAudio submissionId={take.submissionId} initialUrl={signed?.url ?? null} />
        ) : (
          <p className="text-sm text-muted-foreground">This recording was removed by the 6-month purge.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card px-4 py-4">
        <StudioAnalysis data={analysis} listenFor={task?.listenFor} />
      </section>
    </div>
  );
}
