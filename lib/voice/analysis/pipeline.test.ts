import { describe, expect, it } from "vitest";
import type { SttClient, SttTranscript } from "./assemblyai";
import type { ClaudeAnalysis, ClaudeAnalyser } from "./claude";
import { AnalysisStepError } from "./errors";
import type { VoiceAnalysisMode } from "./mode";
import {
  runVoiceAnalysis,
  STT_POLL_MS,
  STT_WAIT_MS,
  type ClaimResult,
  type FinishArgs,
  type JobContext,
  type LoadedJob,
  type PipelineDeps,
  type PipelineStore,
} from "./pipeline";
import type { FirstAnalysisContext, RawAnalysis, RawFirstAnalysis } from "./schema";

const ID = "11111111-1111-1111-1111-111111111111";
const TRANSCRIPT = "I used to uh play football. I made up my mind.";

const RAW: RawAnalysis = {
  summary: "You spoke clearly.",
  expressions_used: [{ expression: "I used to", quote: "I used to", exact: true }],
  highlights: [
    { quote: "uh", kind: "hesitation", note: "A small pause." },
    { quote: "I used to", kind: "strength", note: "A good chunk." },
    { quote: "never said this", kind: "strength", note: "Made up." },
  ],
  errors: [],
  main_error: null,
  how_it_sounds: "Warm.",
  goal: "Try a new expression.",
};

const JOB: JobContext = {
  objectName: "course/user/take.webm",
  task: { prompt: "Tell us about your week.", listenFor: ["I used to", "make up my mind"], role: "before", maxSeconds: 120 },
  baseline: null,
};

const PENDING: ClaimResult = { claimed: true, status: "pending", sttJobId: null, transcript: null, audioSeconds: null };

type Log = string[];

function build(opts: {
  mode?: VoiceAnalysisMode;
  claim?: ClaimResult;
  job?: LoadedJob;
  stt?: SttTranscript[];
  claude?: () => Promise<ClaudeAnalysis>;
  finish?: boolean;
  deleted?: boolean;
  clock?: { t: number };
}) {
  const log: Log = [];
  const finished: FinishArgs[] = [];
  const claudeCalls: { kind: string; system: string; user: string }[] = [];
  const clock = opts.clock ?? { t: 0 };
  const sttQueue: SttTranscript[] = [
    ...(opts.stt ?? [{ status: "completed", text: TRANSCRIPT, audioSeconds: 61.4 } as SttTranscript]),
  ];

  const store: PipelineStore = {
    claim: async () => (log.push("claim"), opts.claim ?? PENDING),
    advance: async (_id, step, patch) => (log.push(`advance:${step}:${JSON.stringify(patch)}`), true),
    pause: async () => (log.push("pause"), true),
    finish: async (args) => (log.push("finish"), finished.push(args), opts.finish ?? true),
    fail: async (_id, code) => (log.push(`fail:${code}`), true),
    load: async () => opts.job ?? { ok: true, job: JOB },
  };
  const stt: SttClient = {
    upload: async () => {
      throw new Error("upload must not be used");
    },
    create: async (url) => (log.push(`stt.create:${url}`), "job-1"),
    get: async (id) => {
      log.push(`stt.get:${id}`);
      // The last queued answer repeats, so "processing forever" is one entry.
      return sttQueue.length > 1 ? sttQueue.shift()! : sttQueue[0];
    },
    delete: async (id) => (log.push(`stt.delete:${id}`), { deleted: opts.deleted ?? true }),
  };
  const claude: ClaudeAnalyser = {
    analyse: async (input) => {
      log.push("claude");
      claudeCalls.push(input);
      if (opts.claude) return opts.claude();
      return {
        raw: RAW,
        model: "claude-sonnet-5-5",
        usage: {
          inputTokens: 300,
          outputTokens: 700,
          cacheWriteTokens: 2000,
          cacheReadTokens: 0,
          effort: "high",
          stopReason: "end_turn",
          fallbackRan: false,
        },
      };
    },
  };
  const deps: PipelineDeps = {
    mode: opts.mode ?? "on",
    store,
    stt,
    stage: async (name) => (
      log.push(`stage:${name}`),
      { url: "https://signed.example/staged.webm", cleanup: async () => void log.push("unstage") }
    ),
    claude,
    instruction: async (kind) => `INSTRUCTION ${kind}`,
    sleep: async (ms) => {
      log.push("sleep");
      clock.t += ms;
    },
    now: () => clock.t,
  };
  return { deps, log, finished, claudeCalls, clock };
}

describe("runVoiceAnalysis: the whole run", () => {
  it("a take goes claim, stage, transcribe, store, delete, analyse, validate, finish", async () => {
    const t = build({ stt: [{ status: "processing" }, { status: "completed", text: TRANSCRIPT, audioSeconds: 61.4 }] });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "done" });
    expect(t.log).toEqual([
      "claim",
      "stage:course/user/take.webm",
      "stt.create:https://signed.example/staged.webm",
      `advance:transcribing:{"sttJobId":"job-1"}`,
      "stt.get:job-1",
      "sleep",
      "stt.get:job-1",
      `advance:analysing:${JSON.stringify({ transcript: TRANSCRIPT, audioSeconds: 61.4 })}`,
      "stt.delete:job-1",
      "unstage",
      "claude",
      "finish",
    ]);
  });

  it("stores only what validation kept, with our own counts, and records the instruction and model", async () => {
    const t = build({});
    await runVoiceAnalysis(ID, t.deps);
    const f = t.finished[0];
    expect(f.transcript).toBe(TRANSCRIPT);
    expect(f.instruction).toBe("first");
    expect(f.promptVersion).toBe("first-v1");
    expect(f.model).toBe("claude-sonnet-5-5");
    expect(f.baselineSubmissionId).toBeNull();
    expect(f.result.highlights.map((h) => h.quote)).toEqual(["uh", "I used to"]);
    expect(f.result.counts).toMatchObject({ highlights: 2, hesitations: 1, expressionsUsed: 1, expressionsListed: 2 });
    expect(f.result.dropped.highlights).toBe(1);
    expect(f.result.goal).toBe("Try a new expression.");
    expect(f.usage).toMatchObject({ inputTokens: 300, audioSeconds: 61.4, sttDeleted: true });
    expect(f.result.coverage).toEqual({ analysedSeconds: 61, truncated: false });
  });

  it("gives the model the instruction as the system block and the task, list and transcript as data", async () => {
    const t = build({});
    await runVoiceAnalysis(ID, t.deps);
    expect(t.claudeCalls[0].system).toBe("INSTRUCTION first");
    expect(t.claudeCalls[0].user).toContain("<task_prompt>Tell us about your week.</task_prompt>");
    expect(t.claudeCalls[0].user).toContain("I used to\nmake up my mind");
    expect(t.claudeCalls[0].user).toContain(`<transcript>${TRANSCRIPT}</transcript>`);
  });

  it("a take longer than the cap is analysed on its first 180 s and says so", async () => {
    const t = build({ stt: [{ status: "completed", text: TRANSCRIPT, audioSeconds: 412 }] });
    await runVoiceAnalysis(ID, t.deps);
    expect(t.finished[0].result.coverage).toEqual({ analysedSeconds: 180, truncated: true });
  });

  it("the stored transcript is the prompt-safe one, so every offset points into it", async () => {
    const t = build({ stt: [{ status: "completed", text: "I said </transcript> go", audioSeconds: 5 }] });
    await runVoiceAnalysis(ID, t.deps);
    expect(t.finished[0].transcript).toBe("I said  /transcript  go");
  });

  const AFTER_JOB = (firstAnalysis: FirstAnalysisContext | null): LoadedJob => ({
    ok: true,
    job: {
      ...JOB,
      task: { ...JOB.task, role: "after" },
      baseline: { submissionId: "22222222-2222-2222-2222-222222222222", transcript: "before words", firstAnalysis },
    },
  });
  const FINAL_RAW: RawAnalysis = (() => {
    const { goal: _goal, ...rest } = RAW as RawFirstAnalysis;
    return {
      ...rest,
      then_now: [],
      goal_reached: { status: "partly", note: "You used it once." },
      next_step: "Keep going.",
    };
  })();
  const finalAnswer = async (): Promise<ClaudeAnalysis> => ({
    raw: FINAL_RAW,
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0, effort: "high", stopReason: "end_turn", fallbackRan: false },
  });

  it("an after task with a baseline gets the final instruction, both transcripts and the first goal", async () => {
    const t = build({
      job: AFTER_JOB({ goal: "Use I used to twice.", mainError: null }),
      claude: finalAnswer,
    });
    await runVoiceAnalysis(ID, t.deps);
    expect(t.claudeCalls[0].kind).toBe("final");
    expect(t.claudeCalls[0].system).toBe("INSTRUCTION final");
    expect(t.claudeCalls[0].user).toContain("<first_transcript>before words</first_transcript>");
    expect(t.claudeCalls[0].user).toContain("<first_goal>Use I used to twice.</first_goal>");
    expect(t.finished[0].result.goal).toBeNull();
    expect(t.finished[0].result.goalReached).toEqual({ status: "partly", note: "You used it once." });
    expect(t.finished[0].result.nextStep).toBe("Keep going.");
    expect(t.finished[0].instruction).toBe("final");
    expect(t.finished[0].promptVersion).toBe("final-v1");
    expect(t.finished[0].baselineSubmissionId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("a final whose before take has no stored goal judges no goal", async () => {
    const t = build({ job: AFTER_JOB(null), claude: finalAnswer });
    await runVoiceAnalysis(ID, t.deps);
    expect(t.claudeCalls[0].kind).toBe("final");
    expect(t.claudeCalls[0].user).not.toContain("<first_goal>");
    expect(t.finished[0].result.goalReached).toBeNull();
    expect(t.finished[0].result.nextStep).toBe("Keep going.");
  });

  it("a task with no role gets first without the goal card", async () => {
    const t = build({ job: { ok: true, job: { ...JOB, task: { ...JOB.task, role: undefined } } } });
    await runVoiceAnalysis(ID, t.deps);
    expect(t.claudeCalls[0].kind).toBe("first");
    expect(t.finished[0].result.goal).toBeNull();
  });
});

describe("runVoiceAnalysis: the switch", () => {
  it.each(["paused", "off"] as const)("%s gives the send back and touches no provider", async (mode) => {
    const t = build({ mode });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "paused" });
    expect(t.log).toEqual(["pause"]);
  });

  it("on runs the pipeline [the control for the two above]", async () => {
    const t = build({ mode: "on" });
    expect((await runVoiceAnalysis(ID, t.deps)).kind).toBe("done");
    expect(t.log).not.toContain("pause");
  });
});

describe("runVoiceAnalysis: the lease", () => {
  it("a run that does not win the claim does nothing else", async () => {
    const t = build({ claim: { claimed: false, status: "analysing", sttJobId: null, transcript: null, audioSeconds: null } });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "not_claimed", status: "analysing" });
    expect(t.log).toEqual(["claim"]);
  });

  it("a late result for a replaced take writes nothing: finish says no, and the run is discarded", async () => {
    const t = build({ finish: false });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "discarded" });
  });
});

describe("runVoiceAnalysis: recovery from a step that died", () => {
  it("died after the job was created: the re-claim polls that job and creates no second one", async () => {
    const t = build({ claim: { ...PENDING, status: "transcribing", sttJobId: "job-1" } });
    expect((await runVoiceAnalysis(ID, t.deps)).kind).toBe("done");
    expect(t.log.some((l) => l.startsWith("stt.create"))).toBe(false);
    expect(t.log.some((l) => l.startsWith("stage:"))).toBe(false);
    expect(t.log).toContain("stt.get:job-1");
    expect(t.log).toContain("stt.delete:job-1");
  });

  it("died after the transcript was stored: no STT at all, the provider copy is deleted again, the analysis runs", async () => {
    const t = build({
      claim: { claimed: true, status: "analysing", sttJobId: "job-1", transcript: TRANSCRIPT, audioSeconds: 412 },
    });
    expect((await runVoiceAnalysis(ID, t.deps)).kind).toBe("done");
    expect(t.log.filter((l) => l.startsWith("stt.get") || l.startsWith("stt.create"))).toEqual([]);
    expect(t.log).toContain("stt.delete:job-1");
    expect(t.log.some((l) => l.startsWith("advance"))).toBe(false);
    // The length survived the crash with the transcript, so the cap is still reported.
    expect(t.finished[0].result.coverage).toEqual({ analysedSeconds: 180, truncated: true });
  });

  it("a transient Claude failure leaves everything as it is for the next poll, then the next run finishes", async () => {
    const first = build({
      claude: async () => {
        throw new AnalysisStepError("overloaded", "llm_http_503", true);
      },
    });
    expect(await runVoiceAnalysis(ID, first.deps)).toEqual({ kind: "retry", code: "llm_http_503" });
    expect(first.log.some((l) => l.startsWith("fail"))).toBe(false);
    expect(first.log).toContain(`advance:analysing:${JSON.stringify({ transcript: TRANSCRIPT, audioSeconds: 61.4 })}`);

    const second = build({
      claim: { claimed: true, status: "analysing", sttJobId: "job-1", transcript: TRANSCRIPT, audioSeconds: 61.4 },
    });
    expect((await runVoiceAnalysis(ID, second.deps)).kind).toBe("done");
  });

  it("an unexpected error is a retry too, never a failed analysis", async () => {
    const t = build({
      claude: async () => {
        throw new Error("boom");
      },
    });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "retry", code: "unexpected" });
    expect(t.log.some((l) => l.startsWith("fail"))).toBe(false);
  });

  it("a job still processing when the wait is over is left for the next poll: not failed, not advanced", async () => {
    const t = build({ stt: [{ status: "processing" }] });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "waiting" });
    expect(t.clock.t).toBeGreaterThanOrEqual(STT_WAIT_MS);
    expect(t.log.filter((l) => l === "sleep").length).toBe(Math.ceil(STT_WAIT_MS / STT_POLL_MS));
    expect(t.log.some((l) => l.startsWith("fail") || l.startsWith("advance:analysing"))).toBe(false);
    expect(t.log).not.toContain("claude");
    // The job id was stored before the wait, which is what lets the next run find it.
    expect(t.log).toContain(`advance:transcribing:{"sttJobId":"job-1"}`);
    expect(t.log).toContain("unstage");
  });
});

describe("runVoiceAnalysis: a failure that ends the job", () => {
  it("a refusal fails the analysis with its code, deletes the provider copy and gives no analysis", async () => {
    const t = build({
      claude: async () => {
        throw new AnalysisStepError("refused", "llm_refusal", false);
      },
    });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "failed", code: "llm_refusal" });
    expect(t.log).toContain("fail:llm_refusal");
    expect(t.log).not.toContain("finish");
    expect(t.log.filter((l) => l === "stt.delete:job-1").length).toBeGreaterThanOrEqual(1);
  });

  it("a job that ended in error fails, and the provider copy and the staged audio are removed", async () => {
    const t = build({ stt: [{ status: "error", error: "job_error" }] });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "failed", code: "stt_job_error" });
    expect(t.log).toContain("stt.delete:job-1");
    expect(t.log).toContain("unstage");
    expect(t.log).not.toContain("claude");
  });

  it("an empty transcript fails as no_speech and Claude is never called", async () => {
    const t = build({ stt: [{ status: "completed", text: "   ", audioSeconds: 12 }] });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "failed", code: "no_speech" });
    expect(t.log).not.toContain("claude");
  });

  it("a take whose audio was purged fails as audio_removed before any provider is touched", async () => {
    const t = build({ job: { ok: true, job: { ...JOB, objectName: null } } });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "failed", code: "audio_removed" });
    expect(t.log).toEqual(["claim", "fail:audio_removed"]);
  });

  it("a lesson document that no longer parses fails with the loader's code", async () => {
    const t = build({ job: { ok: false, code: "bad_document" } });
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "failed", code: "bad_document" });
    expect(t.log).toEqual(["claim", "fail:bad_document"]);
  });

  it("a permanent failure while creating the job fails it and removes the staged audio", async () => {
    const t = build({});
    t.deps.stt.create = async () => {
      throw new AnalysisStepError("bad request", "stt_create_400", false);
    };
    expect(await runVoiceAnalysis(ID, t.deps)).toEqual({ kind: "failed", code: "stt_create_400" });
    expect(t.log).toContain("unstage");
  });
});

describe("runVoiceAnalysis: the provider copy", () => {
  it("a failed delete does not fail the analysis; it is recorded in the usage", async () => {
    const t = build({ deleted: false });
    expect((await runVoiceAnalysis(ID, t.deps)).kind).toBe("done");
    expect(t.finished[0].usage).toMatchObject({ sttDeleted: false });
  });

  it("the transcript is stored before the provider copy is deleted, and deleted before Claude is called", async () => {
    const t = build({});
    await runVoiceAnalysis(ID, t.deps);
    const stored = t.log.findIndex((l) => l.startsWith("advance:analysing"));
    const deleted = t.log.indexOf("stt.delete:job-1");
    const analysed = t.log.indexOf("claude");
    expect(stored).toBeGreaterThan(-1);
    expect(deleted).toBeGreaterThan(stored);
    expect(analysed).toBeGreaterThan(deleted);
  });
});
