import { describe, expect, it } from "vitest";
import type { UsageEvent } from "../costs/usageEvent";
import { lessonAnswer, PLAN, planAnswer } from "./__fixtures__/lesson";
import type { ImportAnswer, ImportClaude, ImportDocument, ImportTurn } from "./claudeTypes";
import { ImportStepError } from "./errors";
import type { CourseImportFormat } from "./formats";
import {
  runCourseImport,
  type AdvancePatch,
  type ClaimResult,
  type CommitArgs,
  type CommitResult,
  type ImportRow,
  type ImportStore,
  type PipelineDeps,
} from "./pipeline";

/** The pipeline against fakes: the row is a plain object, the model is a script of answers. */

const SOURCE = new TextEncoder().encode("# Past simple vs present perfect\n\nSection A. Section B.");

function newRow(format: CourseImportFormat = "markdown"): ImportRow {
  return {
    id: "imp1",
    user_id: "u1",
    status: "pending",
    format,
    object_name: "u1/source",
    title: "Two tenses",
    slug: "two-tenses",
    level: "B1",
    plan: null,
    lessons: [],
    lessons_done: 0,
    qa: null,
    usage: [],
    anthropic_file_id: null,
  };
}

class FakeStore implements ImportStore {
  row: ImportRow;
  committed: CommitArgs[] = [];
  failed: string[] = [];
  released = 0;
  cleanedCalls = 0;
  /** advance() answers false (the row was discarded) when set. */
  discarded = false;
  claimable = true;
  commitResult: CommitResult = { ok: true, courseId: "course-1" };

  constructor(row: ImportRow) {
    this.row = row;
  }

  async claim(): Promise<ClaimResult> {
    if (!this.claimable) return { claimed: false, status: "done" };
    // A claim hands out a copy, as the database does: the run mutates its own row.
    return { claimed: true, row: JSON.parse(JSON.stringify(this.row)) as ImportRow };
  }

  async advance(_id: string, status: "planning" | "drafting" | "committing", patch: AdvancePatch): Promise<boolean> {
    if (this.discarded) return false;
    this.row.status = status;
    if (patch.plan !== undefined) this.row.plan = patch.plan;
    if (patch.lessons !== undefined) {
      this.row.lessons = patch.lessons;
      this.row.lessons_done = patch.lessons.length;
    }
    if (patch.usage !== undefined) this.row.usage = patch.usage;
    if (patch.anthropic_file_id !== undefined) this.row.anthropic_file_id = patch.anthropic_file_id;
    return true;
  }

  async release(): Promise<void> {
    this.released += 1;
  }

  async fail(_id: string, code: string): Promise<boolean> {
    this.failed.push(code);
    this.row.status = "failed";
    return true;
  }

  async commit(_id: string, course: CommitArgs): Promise<CommitResult> {
    this.committed.push(course);
    if (this.commitResult.ok) this.row.status = "done";
    return this.commitResult;
  }

  async cleaned(): Promise<void> {
    this.cleanedCalls += 1;
  }
}

type Call = { document: ImportDocument; turns: ImportTurn[]; maxTokens: number };

function answer(text: string): ImportAnswer {
  return {
    text,
    model: "fake-model",
    usage: {
      model: "fake-model",
      inputTokens: 10,
      outputTokens: 5,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      effort: "high",
      stopReason: "end_turn",
      fallbackRan: false,
      ms: 0,
    },
  };
}

/** Each entry answers one call, in order: text, or an error to throw. */
class FakeClaude implements ImportClaude {
  calls: Call[] = [];
  uploads: string[] = [];
  deleted: string[] = [];
  deleteResult = true;
  constructor(private script: (string | Error)[]) {}

  async uploadFile(): Promise<string> {
    this.uploads.push("source.pdf");
    return "file_123";
  }

  async deleteFile(fileId: string): Promise<boolean> {
    this.deleted.push(fileId);
    return this.deleteResult;
  }

  async converse(input: { document: ImportDocument; turns: ImportTurn[]; maxTokens: number }): Promise<ImportAnswer> {
    this.calls.push({ document: input.document, turns: input.turns, maxTokens: input.maxTokens });
    const next = this.script.shift();
    if (next === undefined) throw new Error("the fake model was asked for more answers than the test scripted");
    if (next instanceof Error) throw next;
    return answer(next);
  }
}

class FakeFiles {
  removed: string[] = [];
  removeResult = true;
  bytes: Uint8Array | null = SOURCE;
  async read(): Promise<Uint8Array | null> {
    return this.bytes;
  }
  async remove(name: string): Promise<boolean> {
    this.removed.push(name);
    return this.removeResult;
  }
}

function setup(opts: {
  format?: CourseImportFormat;
  script: (string | Error)[];
  mode?: "on" | "off";
  budgetMs?: number;
  /** Makes every ledger write throw. */
  ledgerDown?: boolean;
}) {
  const store = new FakeStore(newRow(opts.format));
  const claude = new FakeClaude(opts.script);
  const files = new FakeFiles();
  const usage: UsageEvent[] = [];
  let clock = 0;
  const deps: PipelineDeps = {
    mode: opts.mode ?? "on",
    store,
    files,
    claude,
    prompt: async (name) => `${name} prompt`,
    // Every read of the clock is 10 ms later, so a budget of 0 is exceeded after the first step.
    now: () => (clock += 10),
    budgetMs: opts.budgetMs,
    recordUsage: async (event) => {
      if (opts.ledgerDown) throw new Error("ledger down");
      usage.push(event);
    },
  };
  return { store, claude, files, deps, usage };
}

const HAPPY = () => [planAnswer(), lessonAnswer("why-two-tenses"), lessonAnswer("signal-words")];
const FIRST = PLAN.lessons[0].slug;

describe("runCourseImport", () => {
  it("markdown: plans, drafts each lesson once, commits once, and cleans up", async () => {
    const { store, claude, files, deps } = setup({ script: HAPPY() });
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "done", courseId: "course-1" });
    expect(claude.calls).toHaveLength(3);
    expect(claude.uploads).toEqual([]);
    expect(claude.calls.every((c) => c.document.kind === "text")).toBe(true);
    expect(store.committed).toHaveLength(1);
    expect(store.committed[0].lessons.map((l) => l.slug)).toEqual(["why-two-tenses", "signal-words"]);
    // The usage is stored per call.
    expect((store.row.usage as { step: string }[]).map((u) => u.step)).toEqual(["plan", "lesson-1", "lesson-2"]);
    expect(files.removed).toEqual(["u1/source"]);
    expect(store.cleanedCalls).toBe(1);
    expect(store.failed).toEqual([]);
  });

  it("pdf: uploads once, records the id, hands the id to every call, deletes it at the end", async () => {
    const { store, claude, files, deps } = setup({ format: "pdf", script: HAPPY() });
    const out = await runCourseImport("imp1", deps);

    expect(out.kind).toBe("done");
    expect(claude.uploads).toHaveLength(1);
    expect(store.row.anthropic_file_id).toBe("file_123");
    expect(claude.calls.map((c) => c.document)).toEqual([
      { kind: "file", fileId: "file_123" },
      { kind: "file", fileId: "file_123" },
      { kind: "file", fileId: "file_123" },
    ]);
    expect(claude.deleted).toEqual(["file_123"]);
    expect(files.removed).toEqual(["u1/source"]);
    expect(store.cleanedCalls).toBe(1);
  });

  it("resumes after a transient failure without redoing a stored lesson or uploading again", async () => {
    const { store, claude, files, deps } = setup({
      format: "pdf",
      script: [planAnswer(), lessonAnswer("why-two-tenses"), new ImportStepError("timeout", "llm_network", true)],
    });
    const first = await runCourseImport("imp1", deps);

    expect(first).toEqual({ kind: "retry", code: "llm_network" });
    expect(store.row.lessons_done).toBe(1);
    expect(store.failed).toEqual([]);
    // The author's file is still needed: nothing is deleted on a retry.
    expect(files.removed).toEqual([]);
    expect(claude.deleted).toEqual([]);

    claude["script"].push(lessonAnswer("signal-words"));
    const callsBefore = claude.calls.length;
    const second = await runCourseImport("imp1", deps);

    expect(second.kind).toBe("done");
    expect(claude.calls.length - callsBefore).toBe(1);
    const resumed = claude.calls[callsBefore].turns[0].text;
    expect(resumed).toContain('"number": 2');
    expect(claude.uploads).toHaveLength(1);
    expect(store.committed[0].lessons).toHaveLength(2);
    expect(claude.deleted).toEqual(["file_123"]);
  });

  it("a lesson that fails validation gets one repair turn, and the repaired lesson is flagged", async () => {
    const { store, claude, deps } = setup({
      script: [planAnswer(), "not json at all", lessonAnswer("why-two-tenses"), lessonAnswer("signal-words")],
    });
    const out = await runCourseImport("imp1", deps);

    expect(out.kind).toBe("done");
    expect(claude.calls).toHaveLength(4);
    // The repair turn carries the first answer and the errors, after the original request.
    expect(claude.calls[2].turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(claude.calls[2].turns[1].text).toBe("not json at all");
    expect(claude.calls[2].turns[2].text).toContain("validation_errors");
    const qa = store.committed[0].qa as { lessons: { slug: string; flags: string[] }[] };
    expect(qa.lessons[0].flags.join(" ")).toMatch(/corrected once/);
    expect(qa.lessons[1].flags.join(" ")).not.toMatch(/corrected once/);
  });

  it("fails with lesson_invalid after the one repair, and never commits", async () => {
    const { store, claude, files, deps } = setup({
      script: [planAnswer(), "bad", "still bad"],
    });
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "failed", code: `lesson_invalid:${FIRST}` });
    expect(claude.calls).toHaveLength(3);
    expect(store.failed).toEqual([`lesson_invalid:${FIRST}`]);
    expect(store.committed).toEqual([]);
    expect(files.removed).toEqual(["u1/source"]);
  });

  it("a refusal fails the job at once, without a second call", async () => {
    const { store, claude, deps } = setup({
      script: [planAnswer(), new ImportStepError("refused", "llm_refusal", false)],
    });
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "failed", code: "llm_refusal" });
    expect(claude.calls).toHaveLength(2);
    expect(store.failed).toEqual(["llm_refusal"]);
  });

  it("a plan that fails twice fails the job with plan_invalid", async () => {
    const { store, claude, deps } = setup({ script: ["no plan", "no plan either"] });
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "failed", code: "plan_invalid" });
    expect(claude.calls).toHaveLength(2);
    expect(store.failed).toEqual(["plan_invalid"]);
  });

  it("mode off: no model call, the row is failed with mode_off, the file is removed", async () => {
    const { store, claude, files, deps } = setup({ mode: "off", script: HAPPY() });
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "off" });
    expect(claude.calls).toHaveLength(0);
    expect(claude.uploads).toHaveLength(0);
    expect(store.failed).toEqual(["mode_off"]);
    expect(files.removed).toEqual(["u1/source"]);
  });

  it("a row it cannot claim is left alone", async () => {
    const { store, claude, files, deps } = setup({ script: HAPPY() });
    store.claimable = false;
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "not_claimed", status: "done" });
    expect(claude.calls).toHaveLength(0);
    expect(files.removed).toEqual([]);
    expect(store.cleanedCalls).toBe(0);
  });

  it("past its step budget it releases the lease, keeps the file, and the next run finishes", async () => {
    const { store, claude, files, deps } = setup({ budgetMs: 0, script: HAPPY() });
    const first = await runCourseImport("imp1", deps);

    expect(first).toEqual({ kind: "yielded" });
    expect(store.released).toBe(1);
    expect(files.removed).toEqual([]);
    expect(store.cleanedCalls).toBe(0);

    // Each run does at least one step; with a budget of 0 that is exactly one.
    let outcome = first;
    for (let i = 0; i < 10 && outcome.kind === "yielded"; i++) outcome = await runCourseImport("imp1", deps);
    expect(outcome.kind).toBe("done");
    expect(claude.calls).toHaveLength(3);
    expect(files.removed).toEqual(["u1/source"]);
  });

  it("a slug that was taken at commit fails the job with that code and cleans up", async () => {
    const { store, files, deps } = setup({ script: HAPPY() });
    store.commitResult = { ok: false, error: "slug_taken" };
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "failed", code: "slug_taken" });
    expect(store.failed).toEqual(["slug_taken"]);
    expect(files.removed).toEqual(["u1/source"]);
  });

  it("a discarded row is cleaned from outside: the file and the upload go, the row is not touched", async () => {
    const { store, claude, files, deps } = setup({ format: "pdf", script: HAPPY() });
    store.discarded = true;
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "discarded" });
    // The upload happened before the first advance, so it must not be left behind.
    expect(claude.deleted).toEqual(["file_123"]);
    expect(files.removed).toEqual(["u1/source"]);
    expect(store.cleanedCalls).toBe(0);
    expect(store.committed).toEqual([]);
  });

  it("keeps the names when a deletion fails, so the sweep can try again", async () => {
    const { store, files, deps } = setup({ script: HAPPY() });
    files.removeResult = false;
    const out = await runCourseImport("imp1", deps);

    expect(out.kind).toBe("done");
    expect(files.removed).toEqual(["u1/source"]);
    expect(store.cleanedCalls).toBe(0);
  });

  it("keeps the names when only the Anthropic file's deletion fails", async () => {
    const { store, claude, files, deps } = setup({ format: "pdf", script: HAPPY() });
    claude.deleteResult = false;
    await runCourseImport("imp1", deps);

    // Both deletions are attempted; one failing must not skip the other.
    expect(claude.deleted).toEqual(["file_123"]);
    expect(files.removed).toEqual(["u1/source"]);
    expect(store.cleanedCalls).toBe(0);
  });

  it("an unreadable source object fails with object_missing before any model call", async () => {
    const { store, claude, files, deps } = setup({ script: HAPPY() });
    files.bytes = null;
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "failed", code: "object_missing" });
    expect(claude.calls).toHaveLength(0);
    expect(store.failed).toEqual(["object_missing"]);
  });

  it("an unexpected error is a retry, not a failure", async () => {
    const { store, deps } = setup({ script: [new Error("boom")] });
    const out = await runCourseImport("imp1", deps);

    expect(out).toEqual({ kind: "retry", code: "unexpected" });
    expect(store.failed).toEqual([]);
  });
});

describe("runCourseImport: the usage ledger (OPS-031, 0207)", () => {
  const TOKENS = { inputTokens: 10, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 };

  it("records every model call of a finished import, with its step", async () => {
    const t = setup({ script: HAPPY() });
    expect((await runCourseImport("imp1", t.deps)).kind).toBe("done");
    expect(t.usage).toEqual(
      ["plan", "lesson-1", "lesson-2"].map((step) => ({
        provider: "anthropic",
        feature: "course_import",
        model: "fake-model",
        step,
        tokens: TOKENS,
        audioSeconds: null,
        outcome: "ok",
      })),
    );
    // The ledger and the row's own list agree on the number of calls.
    expect((t.store.row.usage as unknown[]).length).toBe(t.usage.length);
  });

  it("a refused lesson is recorded as failed with the tokens it reported, and the job fails", async () => {
    const spent = { model: "fake-model", tokens: { ...TOKENS, outputTokens: 99 } };
    const t = setup({ script: [planAnswer(), new ImportStepError("refused", "llm_refusal", false, spent)] });
    expect(await runCourseImport("imp1", t.deps)).toEqual({ kind: "failed", code: "llm_refusal" });
    expect(t.usage.map((e) => `${e.step}:${e.outcome}`)).toEqual(["plan:ok", "lesson-1:failed"]);
    expect(t.usage[1].tokens).toEqual(spent.tokens);
  });

  it("a transient failure, which carries nothing spent, records nothing for that call", async () => {
    const t = setup({ script: [planAnswer(), new ImportStepError("overloaded", "llm_http_529", true)] });
    expect((await runCourseImport("imp1", t.deps)).kind).toBe("retry");
    expect(t.usage.map((e) => e.step)).toEqual(["plan"]);
  });

  it("a repair turn is its own call, recorded under its own step", async () => {
    const t = setup({ script: [planAnswer(), "not json at all", lessonAnswer("why-two-tenses"), lessonAnswer("signal-words")] });
    expect((await runCourseImport("imp1", t.deps)).kind).toBe("done");
    expect(t.usage.map((e) => e.step)).toEqual(["plan", "lesson-1", "lesson-1-repair", "lesson-2"]);
  });

  it("a ledger that throws does not change the outcome", async () => {
    const t = setup({ script: HAPPY(), ledgerDown: true });
    expect((await runCourseImport("imp1", t.deps)).kind).toBe("done");
  });
});
