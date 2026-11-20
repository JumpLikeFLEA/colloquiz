import { cookies } from "next/headers";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";
import {
  currentEnrolmentId,
  parseVoiceAnalysisMode,
  submissionsForEnrolment,
  voiceSendSlot,
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
 * An anonymous visitor gets `practice` without the submission reads. A
 * signed-in learner with no enrolment in the course gets `send` too, filed in
 * the self-paced slot (VOICE-010, docs/decisions/0183), unless
 * VOICE_ANALYSIS_MODE is `off` (unset counts as off).
 *
 * A failed read degrades to `practice` rather than failing the lesson: the
 * lesson's content doesn't depend on the recorder.
 */
export async function getVoiceTasksContext(
  lessonId: string,
  courseId: string,
  lessonOpen: boolean,
  lessonPath: string,
): Promise<VoiceTasksContext> {
  const analysisMode = parseVoiceAnalysisMode(process.env.VOICE_ANALYSIS_MODE);
  // VOICE-014: the view and the "Try to use" list exist only while the analysis is switched on.
  const analysis = analysisMode !== "off";
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    // VOICE-018: a visitor on an open lesson is invited to sign in where Send would be, but only
    // while the analysis is on: with it off nobody can send, so there is nothing to sign in for.
    if (!user) return { mode: "practice", analysis, lang, ...(analysis && lessonOpen ? { signInNext: lessonPath } : {}) };

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
    const slot = voiceSendSlot({
      signedIn: true,
      lessonOpen,
      enrolmentId,
      analysisMode,
    });
    if (!slot) return { mode: "practice", analysis, lang };

    const { data: rows, error: subErr } = await supabase
      .from("voice_submissions")
      .select("id, enrolment_id, block_id, object_name, voice_feedback(body, published_at)")
      .eq("lesson_id", lessonId)
      .eq("user_id", user.id);
    if (subErr) throw new Error(subErr.message);

    const current = submissionsForEnrolment(
      ((rows ?? []) as unknown as {
        id: string;
        enrolment_id: string | null;
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
      slot === "enrolment" ? enrolmentId : null,
      (id) => console.error(`voice_feedback for submission ${id} does not parse as FeedbackContent`),
    );

    const submissions: Extract<VoiceTasksContext, { mode: "send" }>["submissions"] = {};
    await Promise.all(
      [...current].map(async ([blockId, s]) => {
        const signed = s.objectName ? await signVoicePlaybackUrl(supabase, s.objectName) : null;
        submissions[blockId] = { id: s.id, removed: s.removed, feedback: s.feedback, playbackUrl: signed?.url ?? null };
      }),
    );

    return { mode: "send", analysis, lang, slot, lessonId, courseId, userId: user.id, submissions };
  } catch (err) {
    console.error("failed to read the voice task context", err);
    return { mode: "practice", analysis, lang };
  }
}
