/**
 * Import an externally-authored COURSE into Supabase — the structural half of the
 * course authoring pipeline (mirrors scripts/import-authored-questions.ts).
 *
 * A course directory contains one course.json plus one file per stage:
 *
 *   authored/courses/calculus-i/
 *     course.json          slug, title, subject, ordered stage file names, config
 *     01-limits.json       stage: key, title, subtopic, theory[], groups[]
 *     02-continuity.json
 *     ...
 *
 * Each stage's `groups` holds variant groups; each group has 2–4 sibling MCQ
 * variants of the same problem with different numbers, sharing a variant_group.
 * At most ONE sibling per group carries `promote: true` — that one is written
 * visibility='shared' into the public Mathematics bank; the rest stay
 * visibility='course', invisible to quick play by construction.
 *
 * WHAT THIS SCRIPT ENFORCES (the mechanical guards — §4 of the plan):
 *   1. Pre-parse raw-byte backslash lint (lib/courseLint) BEFORE JSON.parse, so a
 *      single-backslash "\frac" is caught with a line:col message instead of
 *      silently decoding to <FF>rac or throwing V8's position-only SyntaxError.
 *   2. zod validation (course/stage shape + TheoryBlock schema + the C0-control
 *      refinement) — the belt-and-braces second layer behind the lint.
 *   3. KaTeX compile check: every \(…\) / \[…\] segment is rendered with
 *      throwOnError:true, strict:true (shared KATEX_BASE), so unbalanced braces
 *      and typo'd commands fail the batch rather than degrading at render time.
 *   4. Content-quality floors: every stage has ≥ new_count variant groups, every
 *      group has ≥ 2 siblings, and options are 4 distinct strings with the
 *      correct_answer among them.
 *
 * ANSWER VERIFICATION (§4, wired in): every item is machine-verified before it can
 * import as 'approved'. Layer 1 (SymPy) checks an authored `verify` block; items
 * without one go through Layer 2 (a blind-solver LLM pass, k independent samples);
 * Layer 3 (SymPy option-equivalence) runs on all items. Verified → 'approved' (and
 * promotable). Disproven or merely unverifiable → 'pending', with the reason written
 * to `critic_notes` so it lands in the existing admin review queue, and its promote
 * flag is ignored (visibility stays 'course' — unverified content cannot leak into
 * the public bank). Verification runs whenever the effective status is 'approved';
 * `--status pending` and `--skip-verify` bypass it (see the flags below).
 *
 * NEVER DELETES. A stage absent from the file is ARCHIVED; a variant absent from
 * the file is soft-REJECTED (status='rejected') unless it was promoted, in which
 * case it is public-bank property now and left entirely alone. Both reconcile
 * only under --sync. Question rows use a deterministic id derived from
 * authored_key, so re-import upserts in place and never orphans progress or the
 * course_variant_seen / quizzes.question_ids references.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-course.ts <course-dir> \
 *     [--sync] [--dry-run] [--skip-verify] \
 *     [--source manual|ai_generated] [--status approved|pending]
 *
 * --dry-run runs every validation AND verification and prints the routing plan
 *   (including which items would land in 'pending' and why) without touching the DB.
 * --skip-verify skips answer verification for fast structural iteration; every item
 *   then imports at --status verbatim (Layer 2 also needs ANTHROPIC_API_KEY, and
 *   Layers 1/3 need Python + scripts/requirements.txt — this flag avoids both).
 * --env-file=.env.local is required (tsx does not load .env automatically);
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set, and
 * ANTHROPIC_API_KEY when verification runs (default --status approved, no --skip-verify).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import katex from "katex";
import { z } from "zod";
import { slugifyForTag } from "../lib/utils";
import { hashQuestion } from "../lib/generator/dedup";
import { DifficultySchema } from "../lib/generator/schema";
import { TheoryBlocksSchema, authoredString } from "../lib/courseContent";
import { lintLatexBackslashes } from "../lib/courseLint";
import { segmentMath, KATEX_BASE } from "../lib/richText";
import { validateTheoryBlocks } from "../lib/theoryValidate";
import { runVerifyChecks, type VerifyCheck, type VerifyResult } from "../lib/verifyMath";
// Types only — importing the value graph of ../lib/courseVerify pulls in
// ../lib/generator/llm, which throws at module load without ANTHROPIC_API_KEY.
// blindVerify is loaded dynamically inside verifyAndRoute, only when a blind pass
// actually runs, so --dry-run / --skip-verify / --status pending need no key.
import type { BlindItem, VerifyOutcome } from "../lib/courseVerifyCore";
import type { Subject, QuestionCriticNotes } from "../types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── CLI ─────────────────────────────────────────────────────
function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const courseDir = process.argv.slice(2).find((a) => !a.startsWith("--"));
const sync = process.argv.includes("--sync");
const dryRun = process.argv.includes("--dry-run");
const skipVerify = process.argv.includes("--skip-verify");
// --adopt: overwrite theory rows that were edited in-app (updated_by IS NOT NULL).
// Without it, such rows are SKIPPED with a warning — the JSON in the repo should
// not silently clobber a fix made by an author in the browser. Adopt is the
// deliberate "the file is right, reclaim it" toggle.
const adopt = process.argv.includes("--adopt");
const source = (getArg("source") ?? "ai_generated") as "manual" | "ai_generated";
const status = (getArg("status") ?? "approved") as "approved" | "pending";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!courseDir) {
  die(
    "Usage: import-course.ts <course-dir> [--sync] [--dry-run] [--skip-verify] [--adopt] " +
      "[--source manual|ai_generated] [--status approved|pending]",
  );
}
if (source !== "manual" && source !== "ai_generated") {
  die(`Invalid --source "${source}". Must be "manual" or "ai_generated".`);
}
if (status !== "approved" && status !== "pending") {
  die(`Invalid --status "${status}". Must be "approved" or "pending".`);
}
if (!dryRun && (!url || !key)) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}

// ── Authored file schemas ───────────────────────────────────
const VerifySchema = z.strictObject({
  sympy: z.string().min(1),
  answer: z.string().min(1),
});

const VariantSiblingSchema = z
  .strictObject({
    ordinal: z.number().int().min(1),
    promote: z.boolean().default(false),
    difficulty: DifficultySchema,
    question: authoredString(10),
    // MCQ only in v1: exactly 4 options (numeric/expression entry is v2).
    options: z.array(authoredString()).length(4),
    correct_answer: authoredString(),
    explanation: authoredString(10),
    verify: VerifySchema.optional(),
  })
  .refine((s) => s.options.includes(s.correct_answer), {
    message: "correct_answer must be one of the 4 options verbatim",
  })
  .refine((s) => new Set(s.options).size === s.options.length, {
    message: "the 4 options must be textually distinct (identical strings make scoring nondeterministic)",
  });

const VariantGroupSchema = z
  .strictObject({
    group: z.string().min(1),
    siblings: z.array(VariantSiblingSchema).min(2),
  })
  .superRefine((g, ctx) => {
    const promoted = g.siblings.filter((s) => s.promote).length;
    if (promoted > 1) {
      ctx.addIssue({
        code: "custom",
        message: `group "${g.group}" flags ${promoted} siblings for promotion; at most one is allowed`,
      });
    }
    const ordinals = g.siblings.map((s) => s.ordinal);
    if (new Set(ordinals).size !== ordinals.length) {
      ctx.addIssue({ code: "custom", message: `group "${g.group}" has duplicate variant ordinals` });
    }
  });

const StageFileSchema = z.strictObject({
  key: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  subtopic: z.string().min(1),
  theory: TheoryBlocksSchema,
  groups: z.array(VariantGroupSchema).min(1),
});

const CourseFileSchema = z.strictObject({
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  subject: z.string().min(1).default("mathematics"),
  icon: z.string().optional(),
  color: z.string().optional(),
  access: z.enum(["free", "paid"]).default("free"),
  status: z.enum(["draft", "published"]).default("published"),
  pass_threshold: z.number().default(80),
  new_count: z.number().int().min(1).default(7),
  review_slots: z.number().int().min(0).default(3),
  // Ordered stage file names (with or without the .json extension).
  stages: z.array(z.string().min(1)).min(1),
});

type StageFile = z.infer<typeof StageFileSchema>;

// ── Load helpers: lint raw bytes, then parse, then validate ──
function loadJson<S extends z.ZodTypeAny>(path: string, schema: S): z.infer<S> {
  const raw = readFileSync(path, "utf-8");

  const lintIssues = lintLatexBackslashes(raw);
  if (lintIssues.length > 0) {
    console.error(`Backslash lint failed in ${path}:`);
    for (const issue of lintIssues) console.error(`  ${issue.message}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    die(`${path}: invalid JSON — ${(e as Error).message}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.error(`Validation failed in ${path}:`);
    for (const issue of result.error.issues) {
      console.error(`  [${issue.path.join(".")}] ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

// ── KaTeX compile check ─────────────────────────────────────
function compileErrors(text: string, where: string): string[] {
  const errs: string[] = [];
  for (const seg of segmentMath(text)) {
    if (seg.type === "text") continue;
    try {
      katex.renderToString(seg.value, {
        ...KATEX_BASE,
        throwOnError: true,
        strict: true,
        displayMode: seg.type === "block",
      });
    } catch (e) {
      errs.push(`${where}: KaTeX rejected ${seg.type} math "${seg.value}" — ${(e as Error).message}`);
    }
  }
  return errs;
}

// Theory validation is shared with the in-app authoring route via
// lib/theoryValidate.ts, so a block that imports must save and vice versa.
// Questions/options/explanations stay on the local compileErrors path (they
// have their own zod schema in this file; they are not theory blocks).

// ── Deterministic question id from the stable authored key ──
// authored_key = "<slug>/<stageKey>/<group>/v<ordinal>". Hashing it means the id
// is identical across re-imports, so a typo fix upserts in place (never orphaning
// course_variant_seen or a quizzes.question_ids reference to a promoted sibling).
function questionId(authoredKey: string): string {
  return "crs-" + crypto.createHash("sha256").update(authoredKey).digest("hex").slice(0, 16);
}

// ── Load and cross-validate the whole course ────────────────
const course = loadJson(join(courseDir, "course.json"), CourseFileSchema);

const stageDefs: { file: string; stage: StageFile }[] = course.stages.map((name) => {
  const file = name.endsWith(".json") ? name : `${name}.json`;
  return { file, stage: loadJson(join(courseDir, file), StageFileSchema) };
});

const errors: string[] = [];

// Taxonomy: subject must exist and every stage.subtopic must be listed under it.
const subjects = JSON.parse(
  readFileSync(join(process.cwd(), "data", "subjects.json"), "utf-8"),
) as Subject[];
const subject = subjects.find((s) => s.id === course.subject);
if (!subject) {
  errors.push(`unknown subject id "${course.subject}"`);
} else {
  for (const { file, stage } of stageDefs) {
    if (!subject.subtopics?.includes(stage.subtopic)) {
      errors.push(
        `${file}: subtopic "${stage.subtopic}" is not listed under "${course.subject}". ` +
          `Add it to data/subjects.json. Available: ${(subject.subtopics ?? []).join(", ")}`,
      );
    }
  }
}

// Stage keys unique across the course.
const stageKeys = stageDefs.map((s) => s.stage.key);
if (new Set(stageKeys).size !== stageKeys.length) {
  errors.push(`duplicate stage keys across the course: ${stageKeys.join(", ")}`);
}

// Per-stage floors + per-group floor + KaTeX compile, and authored_key uniqueness.
const seenAuthoredKeys = new Set<string>();
for (const { file, stage } of stageDefs) {
  if (stage.groups.length < course.new_count) {
    errors.push(
      `${file}: stage "${stage.key}" has ${stage.groups.length} variant groups but new_count is ` +
        `${course.new_count}; a knowledge check cannot be filled (need ≥ ${course.new_count})`,
    );
  }

  // Shared validation: zod (already ran via StageFileSchema, harmless to re-run)
  // + KaTeX compile of every authored string. Same routine the in-app editor
  // save uses, so imported and app-saved content cannot diverge.
  const theoryResult = validateTheoryBlocks(stage.theory);
  if (!theoryResult.ok) {
    for (const err of theoryResult.errors) {
      errors.push(`${file}: theory block[${err.blockIndex}].${err.field}: ${err.message}`);
    }
  }

  for (const group of stage.groups) {
    for (const sib of group.siblings) {
      const authoredKey = `${course.slug}/${stage.key}/${group.group}/v${sib.ordinal}`;
      if (seenAuthoredKeys.has(authoredKey)) {
        errors.push(`duplicate authored_key "${authoredKey}"`);
      }
      seenAuthoredKeys.add(authoredKey);

      const where = `${file}: ${group.group}/v${sib.ordinal}`;
      errors.push(...compileErrors(sib.question, `${where} question`));
      sib.options.forEach((o, i) => errors.push(...compileErrors(o, `${where} option[${i}]`)));
      errors.push(...compileErrors(sib.explanation, `${where} explanation`));
    }
  }
}

if (errors.length > 0) {
  console.error(`Course validation failed (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// ── Assemble DB-ready rows ──────────────────────────────────
const stageRows = stageDefs.map(({ stage }, i) => ({
  key: stage.key,
  position: i + 1,
  title: stage.title,
  summary: stage.summary ?? null,
  subtopic: stage.subtopic,
  archived_at: null as string | null, // present in the file → (re)activate
}));

interface QuestionRow {
  id: string;
  type: "multiple_choice";
  subject: string;
  tags: string[];
  difficulty: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  source: "manual" | "ai_generated";
  content_hash: string;
  variant_group: string;
  variant_ordinal: number;
  authored_key: string;
  stageKey: string; // internal: resolved to course_stage_id after stage upsert
  promote: boolean; // internal: honoured only if the item is finally 'approved'
  verify?: { sympy: string; answer: string }; // internal: Layer 1 machine check, if authored
  // Assigned by verifyAndRoute() / routePlain() before any DB write:
  status: "approved" | "pending";
  visibility: "shared" | "course";
  critic_notes: QuestionCriticNotes | null;
}

const questionRows: QuestionRow[] = [];
let flaggedForPromotion = 0;
for (const { stage } of stageDefs) {
  for (const group of stage.groups) {
    for (const sib of group.siblings) {
      const authoredKey = `${course.slug}/${stage.key}/${group.group}/v${sib.ordinal}`;
      if (sib.promote) flaggedForPromotion++;
      questionRows.push({
        id: questionId(authoredKey),
        type: "multiple_choice",
        subject: course.subject,
        tags: [slugifyForTag(stage.subtopic)],
        difficulty: sib.difficulty,
        question: sib.question,
        options: sib.options,
        correct_answer: sib.correct_answer,
        explanation: sib.explanation,
        source,
        content_hash: hashQuestion(sib.question, sib.options),
        variant_group: group.group,
        variant_ordinal: sib.ordinal,
        authored_key: authoredKey,
        stageKey: stage.key,
        promote: sib.promote,
        verify: sib.verify,
        // Provisional — overwritten by routing below before anything is written.
        status: "pending",
        visibility: "course",
        critic_notes: null,
      });
    }
  }
}

// ── Answer verification + routing (plan §4) ─────────────────
// Layer 1 (SymPy) verifies an authored `verify` block; Layer 2 (blind solver)
// handles items without one; Layer 3 (SymPy option-equivalence) runs on all items.
// An item is 'approved' only when its answer is confirmed AND no two options collapse
// to the same value; anything else routes to 'pending' with the reason preserved.

// Extract the LaTeX/expression operand from an authored option or answer for the
// SymPy backend: a math-only value like "\\(\\frac{2}{3}\\)" yields "\\frac{2}{3}";
// a bare "5" passes through; mixed prose+math is handed over verbatim and left to
// fail parsing — which routes the item safely to review rather than approving it.
function mathOperand(s: string): string {
  const segs = segmentMath(s);
  const math = segs.filter((seg) => seg.type !== "text");
  const meaningfulText = segs.some((seg) => seg.type === "text" && seg.value.trim() !== "");
  if (math.length === 1 && !meaningfulText) return math[0].value.trim();
  return s.trim();
}

function toOutcome(r: VerifyResult | undefined): VerifyOutcome {
  if (!r) return { ok: null, reason: "verification produced no result" };
  return { ok: r.ok, reason: r.reason };
}

async function verifyAndRoute(rows: QuestionRow[]): Promise<void> {
  // Layer 1 (answer, where a verify block exists) + Layer 3 (options, always) run
  // in one SymPy subprocess batch; ids are namespaced so results demux cleanly.
  const symChecks: VerifyCheck[] = [];
  for (const r of rows) {
    if (r.verify) {
      symChecks.push({
        id: `ans:${r.authored_key}`,
        kind: "answer",
        sympy: r.verify.sympy,
        answer: r.verify.answer,
      });
    }
    symChecks.push({ id: `opt:${r.authored_key}`, kind: "options", options: r.options.map(mathOperand) });
  }
  const symById = new Map((await runVerifyChecks(symChecks)).map((x) => [x.id, x] as const));

  // Layer 2 (blind solver) for items with no machine-checkable verify block. The
  // client graph (and its ANTHROPIC_API_KEY requirement) is loaded only if needed.
  const blindItems: BlindItem[] = rows
    .filter((r) => !r.verify)
    .map((r) => ({ key: r.authored_key, stem: r.question, correctAnswer: mathOperand(r.correct_answer) }));
  let blindByKey = new Map<string, VerifyOutcome>();
  if (blindItems.length > 0) {
    const { blindVerify } = await import("../lib/courseVerify");
    blindByKey = await blindVerify(blindItems);
  }

  for (const r of rows) {
    const answer = r.verify
      ? toOutcome(symById.get(`ans:${r.authored_key}`))
      : blindByKey.get(r.authored_key) ?? { ok: null, reason: "blind solver produced no outcome" };
    const options = toOutcome(symById.get(`opt:${r.authored_key}`)); // options never returns null

    const reasons: string[] = [];
    if (answer.ok !== true) {
      reasons.push(
        answer.ok === false
          ? `Answer key is provably wrong — ${answer.reason ?? "no detail"}.`
          : `Answer key could not be verified — ${answer.reason ?? "no detail"}.`,
      );
    }
    if (options.ok === false) {
      reasons.push(`Two options are mathematically equivalent — ${options.reason ?? "no detail"}.`);
    }

    const approved = answer.ok === true && options.ok !== false;
    r.status = approved ? "approved" : "pending";
    r.visibility = r.promote && approved ? "shared" : "course";
    r.critic_notes = approved
      ? null
      : {
          correctness_check: answer.ok === true ? "pass" : answer.ok === false ? "fail" : "unsure",
          ambiguity_check: options.ok === false ? "fail" : "pass",
          distractor_quality: 3, // the course verifier does not rate distractors — neutral placeholder
          notes:
            `Auto-routed to review by the course importer ` +
            `(${r.verify ? "SymPy answer check" : "blind-solver pass"} + option-equivalence). ` +
            reasons.join(" "),
        };
  }
}

// Bypass path — --skip-verify, or --status pending (the author is forcing review):
// honour --status verbatim, and still deny promotion to anything not 'approved'.
function routePlain(rows: QuestionRow[]): void {
  for (const r of rows) {
    r.status = status;
    r.visibility = r.promote && status === "approved" ? "shared" : "course";
    r.critic_notes = null;
  }
}

async function run() {
  // Route every question: verify (default) or honour --status verbatim.
  const doVerify = !skipVerify && status === "approved";
  if (doVerify) await verifyAndRoute(questionRows);
  else routePlain(questionRows);

  const promoted = questionRows.filter((r) => r.visibility === "shared").length;
  const pending = questionRows.filter((r) => r.status === "pending").length;
  const summary = {
    course: course.slug,
    stages: stageRows.length,
    groups: stageDefs.reduce((n, { stage }) => n + stage.groups.length, 0),
    questions: questionRows.length,
    flaggedForPromotion,
    promoted,
    pending,
  };

  if (dryRun) {
    console.log(
      doVerify
        ? "Dry run — validation and verification passed. Nothing written."
        : "Dry run — validation passed (verification skipped). Nothing written.",
    );
    console.log(JSON.stringify(summary, null, 2));
    if (pending > 0) {
      console.log(`\n${pending} item(s) would import as 'pending':`);
      for (const r of questionRows.filter((x) => x.status === "pending")) {
        console.log(`  ${r.authored_key}: ${r.critic_notes?.notes ?? "(no note)"}`);
      }
    }
    return;
  }

  // ── Write ─────────────────────────────────────────────────
  const supabase = createClient(url!, key!);

  console.log(
    `Importing course "${course.slug}": ${summary.stages} stages, ${summary.groups} groups, ` +
      `${summary.questions} questions (${promoted} promoted, ${pending} pending)` +
      `${sync ? ", sync=on" : ""}.`,
  );

  // 1. Course.
  const { data: courseRow, error: courseErr } = await supabase
    .from("courses")
    .upsert(
      {
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle ?? null,
        description: course.description ?? null,
        subject: course.subject,
        icon: course.icon ?? null,
        color: course.color ?? null,
        access: course.access,
        status: course.status,
        pass_threshold: course.pass_threshold,
        new_count: course.new_count,
        review_slots: course.review_slots,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (courseErr || !courseRow) die(`course upsert failed: ${courseErr?.message}`);
  const courseId = courseRow.id as string;

  // 2. Stages (position from file order; present stages are re-activated).
  const { data: upsertedStages, error: stageErr } = await supabase
    .from("course_stages")
    .upsert(
      stageRows.map((s) => ({ ...s, course_id: courseId })),
      { onConflict: "course_id,key" },
    )
    .select("id,key");
  if (stageErr || !upsertedStages) die(`stage upsert failed: ${stageErr?.message}`);
  const stageIdByKey = new Map<string, string>(
    upsertedStages.map((s) => [s.key as string, s.id as string]),
  );

  // 3. Theory (blocks replaced wholesale, keyed on stage_id).
  //
  // Protect app-edited stages: course_stage_theory.updated_by is NULL for rows
  // this script wrote and non-null once an in-app save touched them (029). Skip
  // those unless --adopt was passed, and print a warning naming each skipped
  // stage so the operator knows the JSON drifted from the DB and can act on it.
  const stageIds = stageDefs.map(({ stage }) => stageIdByKey.get(stage.key)!);
  const { data: existingTheory, error: existingErr } = await supabase
    .from("course_stage_theory")
    .select("stage_id, updated_by")
    .in("stage_id", stageIds);
  if (existingErr) die(`theory pre-read failed: ${existingErr.message}`);

  const editedStageIds = new Set(
    (existingTheory ?? [])
      .filter((r) => r.updated_by != null)
      .map((r) => r.stage_id as string),
  );

  const theoryRows: { stage_id: string; blocks: unknown; updated_at: string; updated_by: null }[] = [];
  const skippedStageKeys: string[] = [];
  for (const { stage } of stageDefs) {
    const stageId = stageIdByKey.get(stage.key)!;
    if (editedStageIds.has(stageId) && !adopt) {
      skippedStageKeys.push(stage.key);
      continue;
    }
    theoryRows.push({
      stage_id: stageId,
      blocks: stage.theory,
      updated_at: new Date().toISOString(),
      // Clear the marker on adopt too: the JSON is authoritative again.
      updated_by: null,
    });
  }

  if (skippedStageKeys.length > 0) {
    console.warn(
      `Skipped theory for ${skippedStageKeys.length} stage(s) edited in-app ` +
        `(use --adopt to overwrite):`,
    );
    for (const k of skippedStageKeys) {
      console.warn(`  ${k}: theory was edited in-app; skipping (use --adopt to overwrite)`);
    }
  }

  if (theoryRows.length > 0) {
    const { error: theoryErr } = await supabase
      .from("course_stage_theory")
      .upsert(theoryRows, { onConflict: "stage_id" });
    if (theoryErr) die(`theory upsert failed: ${theoryErr.message}`);
  }

  // 4. Questions (keyed on the deterministic id → stable across re-import).
  //
  // Protect app-edited questions: questions.updated_by is NULL for rows this
  // script wrote and non-null once an in-app save touched them (032). Skip
  // those unless --adopt was passed, and warn per row so the operator knows
  // the JSON drifted from the DB. Same protect-marker shape as theory above.
  const authoredIdsAll = questionRows.map((r) => r.id);
  const { data: existingQuestions, error: existingQErr } = await supabase
    .from("questions")
    .select("id, updated_by")
    .in("id", authoredIdsAll);
  if (existingQErr) die(`question pre-read failed: ${existingQErr.message}`);

  const editedQuestionIds = new Set(
    (existingQuestions ?? [])
      .filter((r) => r.updated_by != null)
      .map((r) => r.id as string),
  );

  // Columns are listed explicitly so the internal `stageKey` never reaches the DB.
  const dbQuestionRows = questionRows
    .filter((r) => !(editedQuestionIds.has(r.id) && !adopt))
    .map((r) => ({
      id: r.id,
      type: r.type,
      subject: r.subject,
      tags: r.tags,
      difficulty: r.difficulty,
      question: r.question,
      options: r.options,
      correct_answer: r.correct_answer,
      explanation: r.explanation,
      source: r.source,
      status: r.status,
      visibility: r.visibility,
      // Written on every upsert (null when approved) so a fixed item clears its stale note.
      critic_notes: r.critic_notes,
      content_hash: r.content_hash,
      variant_group: r.variant_group,
      variant_ordinal: r.variant_ordinal,
      authored_key: r.authored_key,
      course_stage_id: stageIdByKey.get(r.stageKey)!,
      // Clear the marker on adopt too: the JSON is authoritative again.
      updated_by: null,
    }));

  const skippedQuestionKeys = questionRows
    .filter((r) => editedQuestionIds.has(r.id) && !adopt)
    .map((r) => r.authored_key);
  if (skippedQuestionKeys.length > 0) {
    console.warn(
      `Skipped ${skippedQuestionKeys.length} question(s) edited in-app ` +
        `(use --adopt to overwrite):`,
    );
    for (const k of skippedQuestionKeys) {
      console.warn(`  ${k}: question was edited in-app; skipping (use --adopt to overwrite)`);
    }
  }

  if (dbQuestionRows.length > 0) {
    const { error: qErr } = await supabase
      .from("questions")
      .upsert(dbQuestionRows, { onConflict: "id" });
    if (qErr) die(`question upsert failed: ${qErr.message}`);
  }

  // 5. Reconcile removals (only under --sync; never a DELETE).
  let archivedStages = 0;
  let retiredVariants = 0;
  if (sync) {
    // Archive stages that dropped out of the file.
    const { data: existingStages } = await supabase
      .from("course_stages")
      .select("id,key,archived_at")
      .eq("course_id", courseId);
    const authoredStageKeys = new Set(stageRows.map((s) => s.key));
    for (const s of existingStages ?? []) {
      if (!authoredStageKeys.has(s.key as string) && !s.archived_at) {
        const { error } = await supabase
          .from("course_stages")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", s.id);
        if (error) console.error(`  archive error (${s.key}): ${error.message}`);
        else archivedStages++;
      }
    }

    // Soft-reject variants that dropped out — unless promoted (public-bank
    // property now: the course has no standing to retire it).
    const { data: existingQs } = await supabase
      .from("questions")
      .select("id,visibility,status")
      .like("authored_key", `${course.slug}/%`);
    // Retire-set derives from the FULL authored roster (questionRows), not
    // dbQuestionRows — a skipped-because-edited row is still authored, so it
    // must not be soft-rejected by --sync.
    const authoredIds = new Set(questionRows.map((r) => r.id));
    for (const q of existingQs ?? []) {
      if (
        !authoredIds.has(q.id as string) &&
        q.visibility !== "shared" &&
        q.status !== "rejected"
      ) {
        const { error } = await supabase
          .from("questions")
          .update({ status: "rejected" })
          .eq("id", q.id);
        if (error) console.error(`  retire error (${q.id}): ${error.message}`);
        else retiredVariants++;
      }
    }
  }

  console.log(
    `Done. Course, ${summary.stages} stages, theory, and ${summary.questions} questions upserted` +
      (sync ? `; archived ${archivedStages} stage(s), retired ${retiredVariants} variant(s).` : "."),
  );
  if (pending > 0) {
    console.log(
      `${pending} question(s) imported as 'pending' — approve them in the admin review queue.`,
    );
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
