import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";
import { beforeAfterView, type BeforeAfterView, type EnrolmentTake, type ReadableLesson } from "@/lib/voice/beforeAfter";

/**
 * COH-005 (docs/decisions/0115) — the before/after screen's read, for one
 * run. Every read runs under the caller's own session and is scoped by RLS;
 * nothing here widens it:
 *   - course_runs "published read" / "enrolled read" (058), courses
 *     "published read": the run and its course;
 *   - run_enrolments "owner read" (058): the caller's own row for the run.
 *     No row (or a revoked one) means the screen is not theirs: not_found;
 *   - lessons + lesson_versions "published content read" (058, gated by
 *     can_read_lesson): only the documents the learner can open now. A
 *     later week not open yet stays invisible, which beforeAfterView shows
 *     as `unknown`, never as missing;
 *   - voice_submissions "owner or editor read" (060), filtered to this
 *     enrolment;
 *   - run_final_comments "owner reads published" (061): a draft never comes
 *     back to the learner;
 *   - playback URLs signed under the bucket's SELECT policy (060).
 *
 * An editor of the course who is not enrolled in the run gets not_found
 * here: they read the same rows in the Studio review queue (0114).
 */

export type FinalScreenRun = {
  runId: string;
  runTitle: string | null;
  courseSlug: string;
  courseTitle: string;
};

export type FinalScreen =
  | { state: "not_found" }
  | ({ state: "signed_out" } & FinalScreenRun)
  | ({
      state: "ok";
      view: BeforeAfterView;
      /** Signed URLs by take id; a take whose URL couldn't be signed is
       * absent and its player offers to load one (SignedAudio). */
      playback: Record<string, string>;
    } & FinalScreenRun);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getFinalScreen(runId: string): Promise<FinalScreen> {
  // A malformed id would be a cast error in PostgREST; to the visitor it is
  // the same as "no such run".
  if (!UUID_RE.test(runId)) return { state: "not_found" };

  const supabase = await createClient();
  const user = await authUserFrom(supabase);

  const { data: run, error: runErr } = await supabase
    .from("course_runs")
    .select("id, title, courses!inner(id, slug, title)")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);
  if (!run) return { state: "not_found" };
  const course = run.courses as unknown as { id: string; slug: string; title: string };
  const base: FinalScreenRun = { runId: run.id, runTitle: run.title, courseSlug: course.slug, courseTitle: course.title };

  if (!user) return { state: "signed_out", ...base };

  const { data: enrolment, error: enrolErr } = await supabase
    .from("run_enrolments")
    .select("id")
    .eq("run_id", runId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (enrolErr) throw new Error(enrolErr.message);
  if (!enrolment) return { state: "not_found" };

  const [lessonsRes, takesRes, commentRes] = await Promise.all([
    supabase.from("lessons").select("id, slug, title, ordinal, archived_at, published_version_id").eq("course_id", course.id),
    supabase
      .from("voice_submissions")
      .select("id, lesson_id, block_id, object_name, submitted_at")
      .eq("enrolment_id", enrolment.id)
      .eq("user_id", user.id),
    supabase
      .from("run_final_comments")
      .select("body, published_at")
      .eq("enrolment_id", enrolment.id)
      .eq("user_id", user.id)
      .not("published_at", "is", null)
      .maybeSingle(),
  ]);
  if (lessonsRes.error) throw new Error(lessonsRes.error.message);
  if (takesRes.error) throw new Error(takesRes.error.message);
  if (commentRes.error) throw new Error(commentRes.error.message);

  const lessons = (lessonsRes.data ?? []).filter((l) => l.published_version_id);
  const versionIds = lessons.map((l) => l.published_version_id as string);
  const { data: versions, error: versionsErr } = versionIds.length
    ? await supabase.from("lesson_versions").select("id, document").in("id", versionIds)
    : { data: [], error: null };
  if (versionsErr) throw new Error(versionsErr.message);
  const documentByVersion = new Map((versions ?? []).map((v) => [v.id as string, v.document as unknown]));

  const readable: ReadableLesson[] = [];
  for (const l of lessons) {
    const document = documentByVersion.get(l.published_version_id as string);
    if (!Array.isArray(document)) continue;
    readable.push({
      lessonId: l.id,
      slug: l.slug,
      title: l.title,
      ordinal: l.ordinal,
      archived: l.archived_at !== null,
      document,
    });
  }

  const takes: EnrolmentTake[] = (takesRes.data ?? []).map((t) => ({
    id: t.id,
    lessonId: t.lesson_id,
    blockId: t.block_id,
    objectName: t.object_name,
    submittedAt: t.submitted_at,
  }));

  const view = beforeAfterView(readable, takes, commentRes.data?.body ?? null, () =>
    console.error(`run_final_comments for enrolment ${enrolment.id} does not parse as FeedbackContent`),
  );

  const playback: Record<string, string> = {};
  await Promise.all(
    [view.before, view.after].map(async (slot) => {
      if (slot.kind !== "recorded") return;
      const signed = await signVoicePlaybackUrl(supabase, slot.objectName);
      if (signed) playback[slot.takeId] = signed.url;
    }),
  );

  return { state: "ok", ...base, view, playback };
}
