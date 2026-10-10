import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";
import {
  currentEnrolmentId,
  submissionsForEnrolment,
  type EnrolmentRow,
  type SubmissionRow,
  type VoiceTasksContext,
} from "@/lib/voice/taskContext";

/**
 * VOICE-005 (docs/decisions/0111) — the voice blocks' context on the lesson
 * page. Called only when the published document has a voice task, so a
 * lesson without one makes no extra read. Every read runs under the caller's
 * own session and is scoped by 058/060's RLS, nothing here widens it:
 *   - run_enrolments "owner read": the caller's own non-revoked rows;
 *   - voice_submissions "owner or editor read", filtered to the caller;
 *   - voice_feedback "owner reads published": a draft never comes back;
 *   - the playback URL is signed under the bucket's SELECT policy.
 * An anonymous visitor, or a signed-in one with no enrolment in this
 * course, gets `practice` without the submission reads.
 *
 * A failed read degrades to `practice` rather than failing the lesson: the
 * lesson's content doesn't depend on the recorder.
 */
export async function getVoiceTasksContext(lessonId: string, courseId: string): Promise<VoiceTasksContext> {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return { mode: "practice" };

    const { data: enrolments, error: enrolErr } = await supabase
      .from("run_enrolments")
      .select("id, enrolled_at, course_runs!inner(course_id, starts_at)")
      .eq("course_runs.course_id", courseId)
      .is("revoked_at", null);
    if (enrolErr) throw new Error(enrolErr.message);

    const enrolmentId = currentEnrolmentId(
      ((enrolments ?? []) as unknown as { id: string; enrolled_at: string; course_runs: { starts_at: string } }[]).map(
        (e): EnrolmentRow => ({ id: e.id, enrolledAt: e.enrolled_at, runStartsAt: e.course_runs.starts_at }),
      ),
    );
    if (!enrolmentId) return { mode: "practice" };

    const { data: rows, error: subErr } = await supabase
      .from("voice_submissions")
      .select("id, enrolment_id, block_id, object_name, voice_feedback(body, published_at)")
      .eq("lesson_id", lessonId)
      .eq("user_id", user.id);
    if (subErr) throw new Error(subErr.message);

    const current = submissionsForEnrolment(
      ((rows ?? []) as unknown as {
        id: string;
        enrolment_id: string;
        block_id: string;
        object_name: string | null;
        voice_feedback: { body: unknown; published_at: string | null } | null;
      }[]).map(
        (r): SubmissionRow => ({
          id: r.id,
          enrolmentId: r.enrolment_id,
          blockId: r.block_id,
          objectName: r.object_name,
          feedbackBody: r.voice_feedback?.published_at ? r.voice_feedback.body : null,
        }),
      ),
      enrolmentId,
      (id) => console.error(`voice_feedback for submission ${id} does not parse as FeedbackContent`),
    );

    const submissions: Extract<VoiceTasksContext, { mode: "send" }>["submissions"] = {};
    await Promise.all(
      [...current].map(async ([blockId, s]) => {
        const signed = s.objectName ? await signVoicePlaybackUrl(supabase, s.objectName) : null;
        submissions[blockId] = { id: s.id, removed: s.removed, feedback: s.feedback, playbackUrl: signed?.url ?? null };
      }),
    );

    return { mode: "send", lessonId, courseId, userId: user.id, submissions };
  } catch (err) {
    console.error("failed to read the voice task context", err);
    return { mode: "practice" };
  }
}
