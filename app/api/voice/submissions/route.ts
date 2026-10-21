import { after, NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseVoiceCap } from "@/lib/voice/analysisCaps";
import { runAnalysisForSubmission } from "@/lib/voice/analysis/server";
import { removeVoiceObjects } from "@/lib/voice/storage";

/**
 * POST /api/voice/submissions — send a voice take (VOICE-004, docs/decisions/
 * 0110). The recorder (VOICE-005) first uploads the take under the caller's
 * own session to voice-recordings/{course}/{user}/{submissionId}.{ext}, then
 * posts { submissionId, lessonId, blockId, objectName } here.
 *
 * Every check is submit_voice_recording's (migration 060), run under the
 * caller's session: published voice block, lesson open, an enrolment, the
 * upload present under this caller and id, the slot not locked. This route
 * adds one thing SQL can't do: when the send REPLACED an earlier take, the
 * earlier object is removed through the Storage API right here, with the
 * service role (no app role may delete from the bucket). The name comes
 * from SQL's answer, never from the request body. If that removal fails, the
 * name is still queued in voice_object_deletions and the daily purge
 * (app/api/cron/voice-purge) removes it.
 *
 * A send over a cap (0156 Decision 6; the ledger trigger in 096) is answered 429 with
 * { error: "voice_cap", kind, retryAt }, and replaced nothing. The recorder reads any
 * non-2xx without a known code as "try again"; the wording for a cap is VOICE-014's.
 *
 * A send that got an analysis (096's `analysed`; a cohort send over a cap does not) starts the
 * pipeline in after(), once the response is out (VOICE-012, docs/decisions/0187). The row
 * 096 created is the record of where it got to, under a lease; a lost or stalled run is
 * claimed again by the status route (GET .../analysis) and failed by the daily sweep. No
 * maxDuration export: the measured worst case is about 30 s against the 300 s default
 * (docs/decisions/0182 Decision 6).
 *
 * A refused send leaves its upload in the bucket; the purge removes any
 * object no submission references after 24 hours. The route never deletes
 * a name taken from the request.
 */

const ERROR_STATUS: Record<string, number> = {
  unauthenticated: 401,
  not_found: 404,
  not_a_voice_block: 422,
  lesson_not_open: 403,
  not_enrolled: 403,
  invalid_object_name: 422,
  object_missing: 422,
  invalid_content_type: 422,
  locked: 409,
  duplicate_submission: 409,
};

type SubmitResult =
  | { ok: true; submission_id: string; replaced_object: string | null; analysed: boolean }
  | { ok: false; error: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= 512 ? v : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Treated as missing fields below.
  }
  const submissionId = str(body.submissionId);
  const lessonId = str(body.lessonId);
  const blockId = str(body.blockId);
  const objectName = str(body.objectName);
  if (!submissionId || !lessonId || !blockId || !objectName) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("submit_voice_recording", {
    p_submission_id: submissionId,
    p_lesson_id: lessonId,
    p_block_id: blockId,
    p_object_name: objectName,
  });
  if (error) {
    // A malformed UUID is a cast error before the function body runs.
    if (error.code === "22P02") {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }
    // A cap from the send ledger's trigger (096, VOICE-011): nothing was replaced, the
    // refused upload is left for the purge, as with any refused send.
    const cap = parseVoiceCap(error);
    if (cap) {
      return NextResponse.json(
        { ok: false, error: "voice_cap", kind: cap.kind, retryAt: cap.retryAt },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("submit_voice_recording:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }

  const result = data as SubmitResult;
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_STATUS[result.error] ?? 400 });
  }

  let replacedRemoved: boolean | null = null;
  if (result.replaced_object) {
    try {
      const { failed } = await removeVoiceObjects(createAdminClient(), [result.replaced_object]);
      replacedRemoved = failed.length === 0;
    } catch (e) {
      console.error("remove replaced voice object:", e);
      replacedRemoved = false;
    }
  }

  // The work starts after the response; what the pipeline does with it (pause under
  // paused or off, run under on) is its own decision, so this is the same call in every mode.
  if (result.analysed) {
    after(() => runAnalysisForSubmission(result.submission_id));
  }

  return NextResponse.json(
    { ok: true, submissionId: result.submission_id, replacedRemoved, analysed: result.analysed === true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
