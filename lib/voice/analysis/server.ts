import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUsageRecorder } from "@/lib/costs/ledgerServer";
import { signVoicePlaybackUrl } from "../storage";
import { VOICE_BUCKET } from "../recording";
import { createSttClient, type SttClient } from "./assemblyai";
import { createClaudeAnalyser } from "./claude";
import { findBeforeBlock, firstAnalysisContext, voiceTaskInfo } from "./context";
import { parseVoiceAnalysisMode } from "./mode";
import {
  runVoiceAnalysis,
  type ClaimResult,
  type JobContext,
  type LoadedJob,
  type PipelineDeps,
  type PipelineOutcome,
  type PipelineStore,
  type StagedAudio,
} from "./pipeline";
import { instructionBody } from "./request";
import { instructionFileName } from "./instructions";
import type { VoiceAnalysisInstruction } from "./schema";
import { isLoopbackUrl, stagedObjectName } from "./staging";

/**
 * The real dependencies of pipeline.ts (VOICE-012, docs/decisions/0187): the service-role
 * client for the state machine and Storage, AssemblyAI and Claude over their own clients.
 * Server only: it holds the service role and both provider keys.
 */

/** A staged copy needs to live only as long as AssemblyAI takes to fetch it. */
const STAGED_URL_TTL_SECONDS = 600;

const INSTRUCTION_DIR = join(process.cwd(), "prompts", "voice-analysis");
const instructionCache = new Map<VoiceAnalysisInstruction, string>();

/** Read from the repo's prompts/ folder, which next.config's outputFileTracingIncludes ships with the routes. */
export async function readInstruction(kind: VoiceAnalysisInstruction): Promise<string> {
  const cached = instructionCache.get(kind);
  if (cached) return cached;
  const text = instructionBody(await readFile(join(INSTRUCTION_DIR, instructionFileName(kind)), "utf8"));
  instructionCache.set(kind, text);
  return text;
}

function rpcFailed(name: string, error: { message: string }): never {
  throw new Error(`${name}: ${error.message}`);
}

export function createPipelineStore(admin: SupabaseClient): PipelineStore {
  return {
    async claim(submissionId, leaseSeconds): Promise<ClaimResult> {
      const { data, error } = await admin.rpc("voice_analysis_claim", {
        p_submission_id: submissionId,
        p_lease_seconds: leaseSeconds,
      });
      if (error) rpcFailed("voice_analysis_claim", error);
      const r = data as {
        claimed: boolean;
        status: string;
        stt_job_id?: string | null;
        transcript?: string | null;
        audio_seconds?: number | null;
      };
      return {
        claimed: r.claimed,
        status: r.status,
        sttJobId: r.stt_job_id ?? null,
        transcript: r.transcript ?? null,
        audioSeconds: r.audio_seconds ?? null,
      };
    },

    async advance(submissionId, step, patch) {
      const { data, error } = await admin.rpc("voice_analysis_advance", {
        p_submission_id: submissionId,
        p_status: step,
        p_stt_job_id: patch.sttJobId ?? null,
        p_transcript: patch.transcript ?? null,
        p_audio_seconds: patch.audioSeconds ?? null,
      });
      if (error) rpcFailed("voice_analysis_advance", error);
      return data === true;
    },

    async pause(submissionId) {
      const { data, error } = await admin.rpc("voice_analysis_pause", { p_submission_id: submissionId });
      if (error) rpcFailed("voice_analysis_pause", error);
      return data === true;
    },

    async finish(args) {
      const { data, error } = await admin.rpc("voice_analysis_finish", {
        p_submission_id: args.submissionId,
        p_transcript: args.transcript,
        p_result: args.result,
        p_instruction: args.instruction,
        p_prompt_version: args.promptVersion,
        p_model: args.model,
        p_usage: args.usage,
        p_baseline: args.baselineSubmissionId,
      });
      if (error) rpcFailed("voice_analysis_finish", error);
      return data === true;
    },

    async fail(submissionId, code) {
      const { data, error } = await admin.rpc("voice_analysis_fail", { p_submission_id: submissionId, p_failure: code });
      if (error) rpcFailed("voice_analysis_fail", error);
      return data === true;
    },

    async load(submissionId): Promise<LoadedJob> {
      const { data: sub, error } = await admin
        .from("voice_submissions")
        .select("user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, enrolment_id")
        .eq("id", submissionId)
        .maybeSingle();
      if (error) rpcFailed("voice_submissions read", error);
      if (!sub) return { ok: false, code: "take_gone" };

      const { data: version, error: vErr } = await admin
        .from("lesson_versions")
        .select("document")
        .eq("id", sub.lesson_version_id)
        .maybeSingle();
      if (vErr) rpcFailed("lesson_versions read", vErr);
      // Read through parseLessonDocument, never raw: listenFor is trimmed at parse (0186 D2).
      const lookup = voiceTaskInfo(version?.document, sub.block_id);
      if (!lookup.ok) return { ok: false, code: lookup.reason };

      let baseline: JobContext["baseline"] = null;
      if (lookup.task.role === "after") baseline = await loadBaseline(admin, sub);

      return { ok: true, job: { objectName: sub.object_name, task: lookup.task, baseline } };
    },
  };
}

/**
 * The learner's `before` take and its transcript, for an `after` task. The before block is
 * found in the course's published lessons (lib/lessons/voiceCompare.ts keeps it unique);
 * the take is the learner's current one in the same slot (the same enrolment, or none).
 * Anything missing is "no baseline", and the pipeline falls back to `first`.
 */
async function loadBaseline(
  admin: SupabaseClient,
  sub: { user_id: string; course_id: string; enrolment_id: string | null },
): Promise<JobContext["baseline"]> {
  const { data: lessons, error } = await admin
    .from("lessons")
    .select("id, published_version_id")
    .eq("course_id", sub.course_id)
    .not("published_version_id", "is", null);
  if (error) rpcFailed("lessons read", error);
  const versionIds = (lessons ?? []).map((l) => l.published_version_id as string);
  if (versionIds.length === 0) return null;

  const { data: versions, error: vErr } = await admin.from("lesson_versions").select("id, document").in("id", versionIds);
  if (vErr) rpcFailed("lesson_versions read", vErr);
  const documents = new Map((versions ?? []).map((v) => [v.id as string, v.document as unknown]));

  const before = findBeforeBlock(
    (lessons ?? []).map((l) => ({ lessonId: l.id as string, document: documents.get(l.published_version_id as string) })),
  );
  if (!before) return null;

  let q = admin
    .from("voice_submissions")
    .select("id")
    .eq("user_id", sub.user_id)
    .eq("lesson_id", before.lessonId)
    .eq("block_id", before.blockId);
  q = sub.enrolment_id === null ? q.is("enrolment_id", null) : q.eq("enrolment_id", sub.enrolment_id);
  const { data: take, error: tErr } = await q.maybeSingle();
  if (tErr) rpcFailed("voice_submissions read", tErr);
  if (!take) return null;

  const { data: analysis, error: aErr } = await admin
    .from("voice_analyses")
    .select("transcript, result")
    .eq("submission_id", take.id)
    .maybeSingle();
  if (aErr) rpcFailed("voice_analyses read", aErr);
  return analysis?.transcript
    ? {
        submissionId: take.id as string,
        transcript: analysis.transcript as string,
        firstAnalysis: firstAnalysisContext(analysis.result),
      }
    : null;
}

/** See staging.ts for why the take's own URL is never given to the provider. */
export function createStager(admin: SupabaseClient, stt: SttClient): PipelineDeps["stage"] {
  return async (objectName): Promise<StagedAudio> => {
    const own = await signVoicePlaybackUrl(admin, objectName, STAGED_URL_TTL_SECONDS);
    if (!own) throw new Error("could not sign the take");

    if (isLoopbackUrl(own.url)) {
      // A local stack: AssemblyAI cannot fetch it, so the bytes go over /v2/upload. Never
      // taken for a hosted project (staging.ts, isLoopbackUrl).
      const { data, error } = await admin.storage.from(VOICE_BUCKET).download(objectName);
      if (error || !data) throw new Error("could not read the take");
      const url = await stt.upload(new Uint8Array(await data.arrayBuffer()));
      return { url, cleanup: async () => {} };
    }

    const staged = stagedObjectName(objectName, randomUUID(), randomUUID());
    const { error } = await admin.storage.from(VOICE_BUCKET).copy(objectName, staged);
    if (error) throw new Error("could not stage the take");
    const url = await signVoicePlaybackUrl(admin, staged, STAGED_URL_TTL_SECONDS);
    const cleanup = async () => {
      try {
        await admin.storage.from(VOICE_BUCKET).remove([staged]);
      } catch (e) {
        // Left behind, the copy is an unreferenced object: the daily purge removes it after 24 h.
        console.error("voice analysis: staged copy not removed:", e);
      }
    };
    if (!url) {
      await cleanup();
      throw new Error("could not sign the staged copy");
    }
    return { url: url.url, cleanup };
  };
}

export function sttFromEnv(env: Record<string, string | undefined> = process.env): SttClient | null {
  const apiKey = env.ASSEMBLYAI_API_KEY?.trim();
  return apiKey ? createSttClient({ apiKey }) : null;
}

/** Builds the real pipeline. In `on`, a missing key is a loud configuration error, not a silent pause. */
export function createPipelineDeps(env: Record<string, string | undefined> = process.env): PipelineDeps {
  const mode = parseVoiceAnalysisMode(env.VOICE_ANALYSIS_MODE);
  const admin = createAdminClient();
  const store = createPipelineStore(admin);
  const stt = sttFromEnv(env);
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (mode === "on" && (!stt || !anthropicKey)) {
    throw new Error("VOICE_ANALYSIS_MODE is on but ASSEMBLYAI_API_KEY or ANTHROPIC_API_KEY is not set");
  }
  const sttClient = stt ?? createSttClient({ apiKey: "" });
  return {
    mode,
    store,
    stt: sttClient,
    stage: createStager(admin, sttClient),
    claude: createClaudeAnalyser({ apiKey: anthropicKey }),
    instruction: readInstruction,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    recordUsage: createUsageRecorder(admin),
  };
}

/**
 * What the routes call from `after()`: never throws, and says what happened in the log. The
 * log is only a convenience (0182: runtime logs drop lines written after the response); the
 * row is the record.
 */
export async function runAnalysisForSubmission(submissionId: string): Promise<PipelineOutcome | null> {
  try {
    const outcome = await runVoiceAnalysis(submissionId, createPipelineDeps());
    if (outcome.kind === "failed" || outcome.kind === "retry") {
      console.error(`voice analysis ${submissionId}: ${outcome.kind} ${outcome.code}`);
    }
    return outcome;
  } catch (e) {
    console.error(`voice analysis ${submissionId}:`, e);
    return null;
  }
}
