import type { ClaudeAnalyser } from "./claude";
import { AnalysisStepError } from "./errors";
import { voiceAnalysisAction, type VoiceAnalysisMode } from "./mode";
import type { VoiceTaskInfo } from "./context";
import { chooseInstruction, buildUserMessage, promptSafeText, promptVersionLabel } from "./request";
import {
  VOICE_ANALYSIS_MAX_SECONDS,
  type StoredAnalysis,
  type VoiceAnalysisInstruction,
} from "./schema";
import type { SttClient } from "./assemblyai";
import { validateAnalysis } from "./validate";

/**
 * One take, from "sent" to "stored" (VOICE-012, docs/decisions/0156 Decisions 1, 4, 5, 0187).
 * Everything it touches is a dependency, so the order of steps and every way of dying
 * between them are tested without a network or a database (pipeline.test.ts); the real
 * dependencies are wired in server.ts.
 *
 * The row in voice_analyses is the state machine, not memory and not logs (0182
 * Decision 6: runtime logs drop lines written after the response):
 *
 *   pending -> transcribing (the job exists, its id is stored) -> analysing (the transcript
 *   is stored, and has been deleted at the provider) -> done | failed
 *
 * Whoever holds the lease runs the next step; the lease is claimed atomically in SQL
 * (voice_analysis_claim), and an expired one is claimed again by the next status poll. A
 * run that dies anywhere therefore costs a delay, never a second STT job once the first
 * exists, and never a second analysis once one is stored.
 */

/** A step is bounded well inside the 300 s function limit (0182 "Vercel"). */
export const LEASE_SECONDS = 150;
/** How long one run waits on AssemblyAI before it lets go and leaves the job for the next poll. */
export const STT_WAIT_MS = 100_000;
export const STT_POLL_MS = 1_500;

export type JobContext = {
  /** NULL once the retention purge removed the audio (060). */
  objectName: string | null;
  task: VoiceTaskInfo;
  /** The learner's `before` take, for an `after` task: its transcript and the take's id. */
  baseline: { submissionId: string; transcript: string } | null;
};

export type LoadedJob = { ok: true; job: JobContext } | { ok: false; code: string };

export type ClaimResult = {
  claimed: boolean;
  status: string;
  sttJobId: string | null;
  transcript: string | null;
  audioSeconds: number | null;
};

export type FinishArgs = {
  submissionId: string;
  transcript: string;
  result: StoredAnalysis;
  instruction: VoiceAnalysisInstruction;
  promptVersion: string;
  model: string;
  usage: Record<string, unknown>;
  baselineSubmissionId: string | null;
};

export type PipelineStore = {
  claim(submissionId: string, leaseSeconds: number): Promise<ClaimResult>;
  advance(
    submissionId: string,
    step: "transcribing" | "analysing",
    patch: { sttJobId?: string; transcript?: string; audioSeconds?: number },
  ): Promise<boolean>;
  pause(submissionId: string): Promise<boolean>;
  finish(args: FinishArgs): Promise<boolean>;
  fail(submissionId: string, code: string): Promise<boolean>;
  load(submissionId: string): Promise<LoadedJob>;
};

export type StagedAudio = {
  /** A URL AssemblyAI can fetch. It names no user (see server.ts, "staged copy"). */
  url: string;
  /** Removes whatever staging made. Never throws. */
  cleanup(): Promise<void>;
};

export type PipelineDeps = {
  mode: VoiceAnalysisMode;
  store: PipelineStore;
  stt: SttClient;
  stage(objectName: string): Promise<StagedAudio>;
  claude: ClaudeAnalyser;
  /** The instruction text for a kind, as the system block. */
  instruction(kind: VoiceAnalysisInstruction): Promise<string>;
  sleep(ms: number): Promise<void>;
  now(): number;
};

export type PipelineOutcome =
  | { kind: "paused" }
  | { kind: "not_claimed"; status: string }
  | { kind: "waiting" }
  | { kind: "done" }
  | { kind: "discarded" }
  | { kind: "failed"; code: string }
  | { kind: "retry"; code: string };

export async function runVoiceAnalysis(submissionId: string, deps: PipelineDeps): Promise<PipelineOutcome> {
  const { store, stt } = deps;

  // Only `on` calls a provider. A paused or off send is given back and never claimed.
  if (voiceAnalysisAction(deps.mode) === "pause") {
    await store.pause(submissionId);
    return { kind: "paused" };
  }

  const claim = await store.claim(submissionId, LEASE_SECONDS);
  if (!claim.claimed) return { kind: "not_claimed", status: claim.status };

  let jobId = claim.sttJobId;
  let staged: StagedAudio | null = null;

  // Cleans up what this run holds at the provider and in storage; best effort, never throws.
  const release = async () => {
    if (jobId) await stt.delete(jobId);
    if (staged) await staged.cleanup();
  };
  const fail = async (code: string): Promise<PipelineOutcome> => {
    await release();
    await store.fail(submissionId, code);
    return { kind: "failed", code };
  };

  try {
    const loaded = await store.load(submissionId);
    if (!loaded.ok) return await fail(loaded.code);
    const { job } = loaded;
    if (job.objectName === null) return await fail("audio_removed");

    // ── Step 1: the transcript ─────────────────────────────────────────────
    let transcript = claim.transcript;
    let audioSeconds = claim.audioSeconds;
    let sttDeleted = false;

    if (transcript === null) {
      if (!jobId) {
        staged = await deps.stage(job.objectName);
        jobId = await stt.create(staged.url);
        // The id is stored before anything waits on the job: a run that dies from here on
        // is picked up by polling this job, not by paying for a second one.
        await store.advance(submissionId, "transcribing", { sttJobId: jobId });
      }

      const deadline = deps.now() + STT_WAIT_MS;
      let result = await stt.get(jobId);
      while (result.status === "processing" && deps.now() < deadline) {
        await deps.sleep(STT_POLL_MS);
        result = await stt.get(jobId);
      }
      if (result.status === "processing") {
        // Not finished and not failed: the lease runs out and the next poll asks again.
        if (staged) await staged.cleanup();
        return { kind: "waiting" };
      }
      if (result.status === "error") return await fail("stt_job_error");
      if (result.text.trim().length === 0) return await fail("no_speech");

      // The model is shown, and its quotes are checked against, the prompt-safe text, so
      // that is what is stored: every offset in the result is into this string.
      transcript = promptSafeText(result.text);
      audioSeconds = result.audioSeconds;
      await store.advance(submissionId, "analysing", { transcript, audioSeconds: audioSeconds ?? undefined });
    }

    // The transcript is stored; the provider's copy goes now (0156 Decision 16, 0182
    // Decision 3). On a re-claimed run this repeats a DELETE that already worked, which
    // the provider answers the same way.
    if (jobId) {
      sttDeleted = (await stt.delete(jobId)).deleted;
      if (!sttDeleted) console.error("voice analysis: the transcript at the provider was not deleted");
    }
    if (staged) await staged.cleanup();
    staged = null;

    // ── Step 2: the analysis ────────────────────────────────────────────────
    const choice = chooseInstruction(job.task.role, job.baseline !== null);
    const firstTranscript = choice.kind === "final" ? (job.baseline?.transcript ?? null) : null;
    const system = await deps.instruction(choice.kind);
    const answer = await deps.claude.analyse({
      kind: choice.kind,
      system,
      user: buildUserMessage({
        kind: choice.kind,
        taskPrompt: job.task.prompt,
        expressions: job.task.listenFor,
        transcript,
        firstTranscript,
      }),
    });

    const truncated = audioSeconds !== null && audioSeconds > VOICE_ANALYSIS_MAX_SECONDS;
    const result = validateAnalysis(answer.raw, {
      kind: choice.kind,
      transcript,
      firstTranscript,
      expressionsListed: job.task.listenFor,
      includeGoal: choice.includeGoal,
      analysedSeconds: audioSeconds === null ? null : Math.min(Math.round(audioSeconds), VOICE_ANALYSIS_MAX_SECONDS),
      truncated,
    });

    const stored = await store.finish({
      submissionId,
      transcript,
      result,
      instruction: choice.kind,
      promptVersion: promptVersionLabel(choice.kind),
      model: answer.model,
      usage: { ...answer.usage, audioSeconds, sttDeleted },
      baselineSubmissionId: choice.kind === "final" ? (job.baseline?.submissionId ?? null) : null,
    });
    // False: the take was replaced or purged while this ran, its row is gone, and the
    // result writes nothing (096, voice_analysis_finish).
    return stored ? { kind: "done" } : { kind: "discarded" };
  } catch (e) {
    if (e instanceof AnalysisStepError && !e.transient) return await fail(e.code);
    // Transient, or unexpected: record nothing. The lease expires and the next status poll
    // claims the row again; the sweep fails it after 24 hours if that never works.
    if (staged) await staged.cleanup();
    return { kind: "retry", code: e instanceof AnalysisStepError ? e.code : "unexpected" };
  }
}
