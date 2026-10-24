import { CourseFileSchema } from "../lessons/courseFile";
import { parseLessonDocument } from "../lessons";
import { claudeEvent, recordSafely, tokensOf, type RecordUsage } from "../costs/usageEvent";
import type { CallUsage, ImportAnswer, ImportClaude, ImportDocument, ImportTurn } from "./claudeTypes";
import { ImportStepError } from "./errors";
import { COURSE_IMPORT_FORMAT_INFO, type CourseImportFormat } from "./formats";
import { readStoredLessons, validateLessonResponse, type DraftedLesson } from "./lessonResponse";
import type { CourseImportMode } from "./mode";
import { parsePlanResponse, readStoredPlan, type ImportPlan } from "./plan";
import { buildQa, type ConversionNotes } from "./qa";
import {
  buildLessonMessage,
  buildPlanMessage,
  buildRepairMessage,
  IMPORT_PROMPT_VERSION,
  type CourseRequest,
  type ImportPromptName,
} from "./request";
import { textSourceFromBytes } from "./source";
import { LEASE_SECONDS, nextStep, shouldRepair, STEP_BUDGET_MS } from "./steps";

/**
 * One import, from "started" to "a draft course" (CNT-018, docs/decisions/0203 Decision 5).
 * Everything it touches is a dependency, so the order of steps and every way of dying between
 * them are tested without a network or a database (pipeline.test.ts); the real dependencies
 * are wired in server.ts.
 *
 * The row in course_imports is the state machine, not memory and not logs:
 *
 *   pending -> planning (the file is read, a PDF is uploaded) -> drafting (the plan is stored,
 *   lessons are added one at a time) -> committing (all lessons are stored) -> done | failed
 *
 * Whoever holds the lease runs the next step; the lease is claimed atomically in SQL
 * (course_import_claim), and an expired one is claimed again by the next status poll. A run
 * that dies anywhere therefore costs a delay, never a second upload once the first exists,
 * and never a second call for a lesson that is stored.
 *
 * One run does as many steps as fit in STEP_BUDGET_MS and then lets go of the lease, so a
 * seven-lesson import is a few runs, each started by the previous run's poll rather than by a
 * queue.
 */

/** The row as course_import_claim returns it (the table's own column names). */
export type ImportRow = {
  id: string;
  user_id: string;
  status: string;
  format: CourseImportFormat;
  object_name: string | null;
  title: string;
  slug: string;
  level: string;
  plan: unknown;
  lessons: unknown;
  lessons_done: number;
  qa: unknown;
  usage: unknown;
  anthropic_file_id: string | null;
};

export type ClaimResult = { claimed: true; row: ImportRow } | { claimed: false; status: string };

export type AdvancePatch = {
  plan?: unknown;
  lessons?: unknown[];
  qa?: unknown;
  usage?: unknown[];
  prompt_version?: string;
  model?: string;
  anthropic_file_id?: string | null;
};

export type CommitArgs = {
  subtitle?: string;
  description?: string;
  qa: unknown;
  lessons: { slug: string; title: string; description?: string; estimatedMinutes?: number; document: unknown[] }[];
};

export type CommitResult = { ok: true; courseId: string } | { ok: false; error: string };

export type ImportStore = {
  claim(id: string, leaseSeconds: number): Promise<ClaimResult>;
  advance(id: string, status: "planning" | "drafting" | "committing", patch: AdvancePatch, leaseSeconds: number): Promise<boolean>;
  release(id: string): Promise<void>;
  fail(id: string, code: string): Promise<boolean>;
  commit(id: string, course: CommitArgs): Promise<CommitResult>;
  /** The object and the Anthropic file are gone: forget their names. */
  cleaned(id: string): Promise<void>;
};

export type ImportFiles = {
  /** Null when the object is not there. */
  read(objectName: string): Promise<Uint8Array | null>;
  /** Never throws. */
  remove(objectName: string): Promise<boolean>;
};

export type PipelineDeps = {
  mode: CourseImportMode;
  store: ImportStore;
  files: ImportFiles;
  claude: ImportClaude;
  /** The prompt file's text, comment stripped. */
  prompt(name: ImportPromptName): Promise<string>;
  now(): number;
  /** The usage ledger (OPS-031, 0207): every paid call, success or not. Never throws through recordSafely. */
  recordUsage: RecordUsage;
  /** Test hook; defaults to STEP_BUDGET_MS. */
  budgetMs?: number;
};

export type PipelineOutcome =
  | { kind: "not_claimed"; status: string }
  | { kind: "off" }
  | { kind: "yielded" }
  | { kind: "done"; courseId: string }
  | { kind: "discarded" }
  | { kind: "failed"; code: string }
  | { kind: "retry"; code: string };

const PLAN_MAX_TOKENS = 16_000;
const LESSON_MAX_TOKENS = 64_000;

/**
 * One model call, recorded in the usage ledger whatever its outcome. The row's own usage list
 * (course_imports.usage) is still kept by the caller; this is the copy that outlives the row.
 */
async function converse(
  deps: PipelineDeps,
  step: string,
  input: { system: string; document: ImportDocument; turns: ImportTurn[]; maxTokens: number },
): Promise<ImportAnswer> {
  let answer: ImportAnswer;
  try {
    answer = await deps.claude.converse(input);
  } catch (e) {
    // A refused or cut-off answer was still paid for (0207 Decision 4).
    if (e instanceof ImportStepError && e.spent) {
      await recordSafely(deps.recordUsage, claudeEvent("course_import", step, e.spent, "failed"));
    }
    throw e;
  }
  await recordSafely(
    deps.recordUsage,
    claudeEvent("course_import", step, { model: answer.model, tokens: tokensOf(answer.usage) }, "ok"),
  );
  return answer;
}

function usageList(value: unknown): CallUsage[] {
  return Array.isArray(value) ? (value as CallUsage[]) : [];
}

export async function runCourseImport(importId: string, deps: PipelineDeps): Promise<PipelineOutcome> {
  const { store } = deps;

  const claim = await store.claim(importId, LEASE_SECONDS);
  if (!claim.claimed) return { kind: "not_claimed", status: claim.status };
  const row = { ...claim.row };

  // Only `on` calls a provider. The row is failed rather than left to the sweep, so the author
  // is told at once.
  let outcome: PipelineOutcome;
  if (deps.mode !== "on") {
    await store.fail(importId, "mode_off");
    outcome = { kind: "off" };
  } else {
    outcome = await runSteps(importId, row, deps);
  }

  // A finished job holds no copy of the author's file, on either side. A job that yielded or
  // will be retried still needs it.
  if (outcome.kind === "done" || outcome.kind === "failed" || outcome.kind === "off") await cleanup(deps, row);
  else if (outcome.kind === "discarded") await cleanup(deps, row, true);
  return outcome;
}

async function runSteps(importId: string, row: ImportRow, deps: PipelineDeps): Promise<PipelineOutcome> {
  const { store } = deps;
  const started = deps.now();
  const budget = deps.budgetMs ?? STEP_BUDGET_MS;
  const course: CourseRequest = { title: row.title, slug: row.slug, level: row.level };

  // What this run learned about the file that is not in the row: DOCX conversion notes.
  let conversion: ConversionNotes | null = null;

  const fail = async (code: string): Promise<PipelineOutcome> => {
    await store.fail(importId, code);
    return { kind: "failed", code };
  };

  try {
    for (;;) {
      const plan = readStoredPlan(row.plan);
      const step = nextStep({ status: row.status, plan, lessonsDone: row.lessons_done });

      if (step.kind === "none") return await fail("plan_invalid");

      if (step.kind === "prepare") {
        if (row.object_name === null) return (await fail("object_missing"));
        const bytes = await deps.files.read(row.object_name);
        if (bytes === null || bytes.byteLength === 0) return (await fail("object_missing"));

        let fileId: string | null = null;
        if (row.format === "pdf") {
          fileId = await deps.claude.uploadFile({
            bytes,
            filename: "source.pdf",
            mediaType: COURSE_IMPORT_FORMAT_INFO.pdf.contentType,
          });
          // The id is stored before anything else uses it: a run that dies from here on is
          // picked up with this file, and the sweep can delete it.
          row.anthropic_file_id = fileId;
        } else {
          // Reading the text now fails an unreadable file before any money is spent; the
          // text itself is read again whenever a step needs it.
          await textSourceFromBytes(row.format, bytes);
        }
        let ok: boolean;
        try {
          ok = await store.advance(importId, "planning", fileId ? { anthropic_file_id: fileId } : {}, LEASE_SECONDS);
        } catch (e) {
          // The id could not be recorded, so nothing else would ever delete this upload.
          if (fileId) await deps.claude.deleteFile(fileId);
          throw e;
        }
        if (!ok) return { kind: "discarded" };
        row.status = "planning";
      } else if (step.kind === "plan") {
        const { document, notes } = await resolveDocument(deps, row);
        conversion = notes;
        const system = await deps.prompt("system");
        const instruction = await deps.prompt("plan");
        const started1 = deps.now();
        const answer = await converse(deps, "plan", {
          system,
          document,
          turns: [{ role: "user", text: buildPlanMessage(instruction, course) }],
          maxTokens: PLAN_MAX_TOKENS,
        });
        const usage = [...usageList(row.usage), { step: "plan", ...answer.usage, ms: deps.now() - started1 }];
        row.usage = usage;

        let parsed = parsePlanResponse(answer.text);
        if (!parsed.ok) {
          // The plan gets the same single repair as a lesson.
          const repairInstruction = await deps.prompt("repair");
          const again = await converse(deps, "plan-repair", {
            system,
            document,
            turns: [
              { role: "user", text: buildPlanMessage(instruction, course) },
              { role: "assistant", text: answer.text },
              { role: "user", text: buildRepairMessage(repairInstruction, parsed.errors) },
            ],
            maxTokens: PLAN_MAX_TOKENS,
          });
          usage.push({ step: "plan-repair", ...again.usage, ms: deps.now() - started1 });
          parsed = parsePlanResponse(again.text);
          if (!parsed.ok) {
            await store.advance(importId, "planning", { usage }, LEASE_SECONDS);
            return (await fail("plan_invalid"));
          }
        }
        const ok = await store.advance(
          importId,
          "drafting",
          { plan: parsed.plan, usage, prompt_version: IMPORT_PROMPT_VERSION, model: answer.model },
          LEASE_SECONDS,
        );
        if (!ok) return { kind: "discarded" };
        row.status = "drafting";
        row.plan = parsed.plan;
      } else if (step.kind === "draft") {
        if (!plan) return (await fail("plan_invalid"));
        const stored = readStoredLessons(row.lessons);
        if (stored === null) return (await fail("invalid_course"));
        const { document, notes } = await resolveDocument(deps, row);
        conversion = notes;

        const drafted = await draftLesson({ deps, row, course, plan, index: step.index, document, stored });
        if (!drafted.ok) {
          await store.advance(importId, "drafting", { usage: drafted.usage }, LEASE_SECONDS);
          return (await fail(drafted.code));
        }
        const lessons = [...stored, drafted.lesson];
        const ok = await store.advance(importId, "drafting", { lessons, usage: drafted.usage, model: drafted.model }, LEASE_SECONDS);
        if (!ok) return { kind: "discarded" };
        row.lessons = lessons;
        row.lessons_done = lessons.length;
        row.usage = drafted.usage;
      } else {
        // commit
        if (!plan) return (await fail("plan_invalid"));
        const stored = readStoredLessons(row.lessons);
        if (stored === null || stored.length !== plan.lessons.length) return (await fail("invalid_course"));
        if (row.status !== "committing") {
          const ok = await store.advance(importId, "committing", {}, LEASE_SECONDS);
          if (!ok) return { kind: "discarded" };
          row.status = "committing";
        }
        if (conversion === null && row.format === "docx" && row.object_name) {
          // The conversion notes are not stored; a run that only commits reads them again.
          conversion = (await resolveDocument(deps, row)).notes;
        }

        const check = CourseFileSchema.safeParse({
          slug: row.slug,
          title: row.title,
          subtitle: plan.subtitle,
          description: plan.description,
          level: row.level,
          status: "draft",
          lessons: stored.map((d) => d.lesson),
        });
        const documentsOk = stored.every((d) => parseLessonDocument(d.lesson.document).ok);
        if (!check.success || !documentsOk) return (await fail("invalid_course"));

        const qa = buildQa({ plan, lessons: stored, conversion });
        const result = await store.commit(importId, {
          subtitle: plan.subtitle,
          description: plan.description,
          qa,
          lessons: stored.map((d) => ({
            slug: d.lesson.slug,
            title: d.lesson.title,
            description: d.lesson.description,
            estimatedMinutes: d.lesson.estimatedMinutes,
            document: d.lesson.document,
          })),
        });
        if (!result.ok) return (await fail(result.error));
        return ({ kind: "done", courseId: result.courseId });
      }

      // Another step is due. Past the budget, let go of the lease so the next poll takes it.
      if (deps.now() - started > budget) {
        await store.release(importId);
        return { kind: "yielded" };
      }
    }
  } catch (e) {
    if (e instanceof ImportStepError && !e.transient) return (await fail(e.code));
    // Transient, or unexpected: record nothing. The lease expires and the next status poll
    // claims the row again; the sweep fails it after 24 hours if that never works.
    return { kind: "retry", code: e instanceof ImportStepError ? e.code : "unexpected" };
  }
}

/**
 * Deletes the Anthropic file and the bucket object, then forgets their names. If either
 * fails the names stay and the daily sweep tries again. `rowGone` skips the database call for
 * a row that no longer exists.
 */
async function cleanup(deps: PipelineDeps, row: ImportRow, rowGone = false): Promise<void> {
  let clean = true;
  if (row.anthropic_file_id) clean = (await deps.claude.deleteFile(row.anthropic_file_id)) && clean;
  if (row.object_name) clean = (await deps.files.remove(row.object_name)) && clean;
  if (clean && !rowGone) await deps.store.cleaned(row.id);
}

async function resolveDocument(
  deps: PipelineDeps,
  row: ImportRow,
): Promise<{ document: ImportDocument; notes: ConversionNotes | null }> {
  if (row.format === "pdf") {
    if (!row.anthropic_file_id) throw new ImportStepError("the uploaded PDF is not recorded", "file_expired", false);
    return { document: { kind: "file", fileId: row.anthropic_file_id }, notes: null };
  }
  if (row.object_name === null) throw new ImportStepError("the file is gone", "object_missing", false);
  const bytes = await deps.files.read(row.object_name);
  if (bytes === null) throw new ImportStepError("the file is gone", "object_missing", false);
  const source = await textSourceFromBytes(row.format, bytes);
  return { document: { kind: "text", text: source.text }, notes: { imagesDropped: source.imagesDropped, warnings: source.warnings } };
}

type DraftOutcome =
  | { ok: true; lesson: DraftedLesson; usage: CallUsage[]; model: string }
  | { ok: false; code: string; usage: CallUsage[] };

async function draftLesson(input: {
  deps: PipelineDeps;
  row: ImportRow;
  course: CourseRequest;
  plan: ImportPlan;
  index: number;
  document: ImportDocument;
  stored: DraftedLesson[];
}): Promise<DraftOutcome> {
  const { deps, row, course, plan, index, document, stored } = input;
  const slug = plan.lessons[index].slug;
  const system = await deps.prompt("system");
  const instruction = await deps.prompt("lesson");
  const first = buildLessonMessage({
    instruction,
    course,
    plan,
    index,
    drafted: stored.map((d) => ({ slug: d.lesson.slug, title: d.lesson.title })),
  });

  const usage = usageList(row.usage).slice();
  const t0 = deps.now();
  let answer = await converse(deps, `lesson-${index + 1}`, {
    system,
    document,
    turns: [{ role: "user", text: first }],
    maxTokens: LESSON_MAX_TOKENS,
  });
  usage.push({ step: `lesson-${index + 1}`, ...answer.usage, ms: deps.now() - t0 });

  let result = validateLessonResponse(answer.text, { slug });
  let repaired = false;
  let repairs = 0;
  while (!result.ok && shouldRepair(repairs)) {
    repairs += 1;
    repaired = true;
    const repairInstruction = await deps.prompt("repair");
    const t1 = deps.now();
    answer = await converse(deps, `lesson-${index + 1}-repair`, {
      system,
      document,
      turns: [
        { role: "user", text: first },
        { role: "assistant", text: answer.text },
        { role: "user", text: buildRepairMessage(repairInstruction, result.errors) },
      ],
      maxTokens: LESSON_MAX_TOKENS,
    });
    usage.push({ step: `lesson-${index + 1}-repair`, ...answer.usage, ms: deps.now() - t1 });
    result = validateLessonResponse(answer.text, { slug });
  }
  if (!result.ok) return { ok: false, code: `lesson_invalid:${slug}`.slice(0, 120), usage };

  const qa = result.warnings.length > 0 ? [...result.qa, ...result.warnings.map((w) => `Matching: ${w}`)] : result.qa;
  return { ok: true, lesson: { lesson: result.lesson, qa, repaired }, usage, model: answer.model };
}
