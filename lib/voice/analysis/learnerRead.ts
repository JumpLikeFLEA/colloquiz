import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalAnalysisView, type FinalAnalysisView } from "./finalView";
import { parseVoiceAnalysisMode, type VoiceAnalysisMode } from "./mode";
import { LEARNER_ANALYSIS_LIMIT, toLearnerAnalysisRows, type LearnerAnalysisRow } from "./learnerList";
import { readAnalysisStatus } from "./status";
import { statusDeps } from "./statusDeps";
import type { AnalysisStatusBody } from "./view";

/**
 * What the learner's own pages read about their AI feedback (PROG-007, docs/decisions/0191), both
 * under the learner's session, so 096's "owner reads shown" policy and the explicit `user_id = me`
 * decide the rows. `user_id = me` is not redundant: the "editor read" policies return OTHER
 * learners' takes to a learner who also edits the course, and those filters only drop rows.
 */

export function voiceAnalysisModeNow(): VoiceAnalysisMode {
  return parseVoiceAnalysisMode(process.env.VOICE_ANALYSIS_MODE);
}

/**
 * The learner's finished, shown analyses, newest take first, for `/my`. Empty while the mode is
 * `off` (nothing is offered to the learner then, 0189 Decision 3) without a read being made.
 */
export async function getLearnerAnalyses(supabase: SupabaseClient, userId: string): Promise<LearnerAnalysisRow[]> {
  if (voiceAnalysisModeNow() === "off") return [];
  const { data, error } = await supabase
    .from("voice_submissions")
    // `voice_analyses` has two foreign keys to the take (the take itself and a final's baseline),
    // so the embed names the one it means.
    .select(
      "id, submitted_at, lessons(slug, title), courses(slug, title), voice_analyses!submission_id!inner(status, instruction, hidden_at)",
    )
    .eq("user_id", userId)
    .eq("voice_analyses.status", "done")
    .is("voice_analyses.hidden_at", null)
    .order("submitted_at", { ascending: false })
    .limit(LEARNER_ANALYSIS_LIMIT);
  if (error) throw new Error(error.message);
  return toLearnerAnalysisRows(data ?? []);
}

/**
 * What the before/after screen draws for the final (After) take's AI feedback. A courtesy, like
 * the other optional sections of the learner pages: a failed read is logged and draws nothing,
 * and the recordings and the author's comment, which do not depend on it, still render.
 */
export async function getFinalAnalysis(takeId: string): Promise<FinalAnalysisView> {
  try {
    if (voiceAnalysisModeNow() === "off") return { kind: "none" };
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return { kind: "none" };
    return finalAnalysisView(await getTakeAnalysis(supabase, user.id, takeId));
  } catch (e) {
    console.error("/runs: final analysis failed", e);
    return { kind: "none" };
  }
}

/**
 * Where one of the caller's takes stands, as the status route answers it (the same function, over
 * the same reads), for a server-rendered page that cannot poll. The caller proves nothing: a take
 * that is not theirs reads `none`.
 */
export async function getTakeAnalysis(
  supabase: SupabaseClient,
  userId: string,
  submissionId: string,
  admin: () => SupabaseClient = createAdminClient,
): Promise<AnalysisStatusBody> {
  const { deps } = statusDeps(supabase, userId, admin);
  return readAnalysisStatus(submissionId, voiceAnalysisModeNow(), deps);
}
