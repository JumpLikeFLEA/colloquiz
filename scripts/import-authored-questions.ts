/**
 * Import externally-authored questions into the Supabase questions table.
 *
 * Authored JSON is produced by an external LLM following the question-authoring
 * instruction. Each element carries exactly the seven authored keys:
 *   { subject, subtopic, difficulty, question, options, correct_answer, explanation }
 * options is either 4 strings (multiple choice) or exactly ["True","False"]
 * (true/false).
 *
 * This script assigns the system fields authors must NOT provide
 * (id, type, tags, source, status, content_hash) and inserts each row as
 * status='pending', landing it in the admin review queue. type is derived from
 * option count ("true_false" for 2, "multiple_choice" for 4); a true/false row is
 * padded to the stored 4-tuple ["True","False","",""] to match buildQuestionRows
 * (lib/authorQuiz.ts), and answerOptions() drops the empty slots at serve time.
 * tags is derived from subtopic via slugifyForTag; content_hash via hashQuestion
 * over the FILLED options — identical to the AI generation path, so dedup against
 * existing rows works the same way.
 *
 * Before validation, each row is passed through stripAuthoringArtifacts to remove
 * any authoring scaffolding the generator leaked into visible text — stem ids
 * "(ID/Ref/Code #..)" and answer-key labels "(Landmark/Distractor/… #..)". This is
 * idempotent and no-ops on clean batches.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-authored-questions.ts <path-to.json> [--source manual|ai_generated] [--status pending|approved] [--sync]
 *
 * --sync re-imports an updated file idempotently: existing rows (matched by
 * content_hash) are updated in place rather than skipped as duplicates.
 *
 * --env-file=.env.local is required: tsx does not load .env files automatically.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env
 * (service role key bypasses RLS for the import).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { slugifyForTag } from "../lib/utils";
import { hashQuestion } from "../lib/generator/dedup";
import { DifficultySchema } from "../lib/generator/schema";
import type { Subject } from "../types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

// ── Parse CLI args ──────────────────────────────────────────
function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const filePath = process.argv.slice(2).find((a) => !a.startsWith("--"));
const source = (getArg("source") ?? "ai_generated") as "manual" | "ai_generated";
const status = (getArg("status") ?? "pending") as "pending" | "approved";
// --sync re-imports an updated authored file idempotently: rows whose content_hash
// already exists are UPDATED in place (difficulty, correct_answer, explanation, tags,
// source, status) instead of being skipped as duplicates. Use it to "renew" a
// previously imported file — e.g. after the author re-labels difficulties or fixes
// an answer without changing the question/options text (which would change the hash).
const sync = process.argv.includes("--sync");

if (!filePath) {
  console.error("Usage: import-authored-questions.ts <path-to.json> [--source manual|ai_generated] [--status pending|approved] [--sync]");
  process.exit(1);
}
if (source !== "manual" && source !== "ai_generated") {
  console.error(`Invalid --source "${source}". Must be "manual" or "ai_generated".`);
  process.exit(1);
}
if (status !== "pending" && status !== "approved") {
  console.error(`Invalid --status "${status}". Must be "pending" or "approved".`);
  process.exit(1);
}

// ── Authored-question shape (the seven keys the LLM emits) ───
const AuthoredQuestionSchema = z
  .object({
    subject: z.string().min(1),
    subtopic: z.string().min(1),
    difficulty: DifficultySchema,
    question: z.string().min(10),
    // Either 4 options (multiple choice) or exactly 2 (true/false). True/false is
    // stored padded to a 4-tuple on assembly; here we validate the authored shape.
    options: z
      .array(z.string().min(1))
      .refine((a) => a.length === 2 || a.length === 4, {
        message: "options must have exactly 2 (True/False) or 4 items",
      }),
    correct_answer: z.string().min(1),
    explanation: z.string().min(10),
  })
  .refine((q) => q.options.includes(q.correct_answer), {
    message: "correct_answer must match one of the options verbatim",
  });

const AuthoredArraySchema = z.array(AuthoredQuestionSchema).min(1);

// ── Strip authoring scaffolding leaked into visible text ────
// The generator appends internal markers — stem ids like "(ID #101_ab)" / "(Ref #..)"
// / "(Code #..)" and answer-key labels like "(Landmark #101)", "(Distractor A #..)",
// "(Technical Principle #..)" and domain-varying ones such as "(Workflow Impact #..)"
// / "(Analytical Impact #..)" — which must never reach users (they also reveal the
// answer). Rather than enumerate the open-ended label vocabulary, match the STRUCTURE
// they all share: a parenthetical of "<Capitalized label words> #<digits>[_<hex>]".
// The " #<digits>" signature is what legitimate parentheticals lack — "(Forward
// Kinematics)", "(Python 3)", "(RFC 2616)", "(C# 11)" are all preserved (no " #digit").
// The one residual false-positive shape is a bare trailing citation like "(RFC #2616)";
// accepted as far rarer than leaking an answer-key label. Applied to question, options
// and correct_answer identically so the "correct_answer ∈ options" invariant holds.
// No-ops on already-clean batches once the generator is fixed upstream.
const ARTIFACT_RE = /\s*\(\s*[A-Z][A-Za-z ]*\s#\d+(?:_[0-9a-fA-F]+)?\s*\)/g;
function stripAuthoringArtifacts(s: string): string {
  return s.replace(ARTIFACT_RE, "").replace(/\s{2,}/g, " ").trim();
}
function normalizeRow(row: unknown): unknown {
  if (!row || typeof row !== "object") return row;
  const r = row as Record<string, unknown>;
  return {
    ...r,
    ...(typeof r.question === "string" && { question: stripAuthoringArtifacts(r.question) }),
    ...(typeof r.correct_answer === "string" && {
      correct_answer: stripAuthoringArtifacts(r.correct_answer),
    }),
    ...(Array.isArray(r.options) && {
      options: r.options.map((o) => (typeof o === "string" ? stripAuthoringArtifacts(o) : o)),
    }),
  };
}

// ── Load, strip scaffolding, then structurally validate ─────
const raw = JSON.parse(readFileSync(filePath, "utf-8"));
const normalized = Array.isArray(raw) ? raw.map(normalizeRow) : raw;
const parsed = AuthoredArraySchema.safeParse(normalized);
if (!parsed.success) {
  console.error("Authored JSON failed validation:");
  for (const issue of parsed.error.issues) {
    console.error(`  [${issue.path.join(".")}] ${issue.message}`);
  }
  process.exit(1);
}
const authored = parsed.data;

// ── Cross-validate subject/subtopic against the taxonomy ────
const subjects = JSON.parse(
  readFileSync(join(process.cwd(), "data", "subjects.json"), "utf-8"),
) as Subject[];
const subjectById = new Map(subjects.map((s) => [s.id, s]));

const taxonomyErrors: string[] = [];
authored.forEach((q, i) => {
  const subject = subjectById.get(q.subject);
  if (!subject) {
    taxonomyErrors.push(`[${i}] unknown subject id "${q.subject}"`);
    return;
  }
  if (!subject.subtopics?.includes(q.subtopic)) {
    taxonomyErrors.push(
      `[${i}] subtopic "${q.subtopic}" is not listed under "${q.subject}". ` +
        `Available: ${(subject.subtopics ?? []).join(", ")}`,
    );
  }
});

if (taxonomyErrors.length > 0) {
  console.error("Taxonomy validation failed:");
  taxonomyErrors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

// ── Validate the true/false shape ───────────────────────────
// A 2-option row is a true/false question; its options must be exactly
// {"True","False"} so it matches the canonical served form and buildQuestionRows
// (lib/authorQuiz.ts). 4-option rows are ordinary multiple choice.
const shapeErrors: string[] = [];
authored.forEach((q, i) => {
  if (q.options.length === 2) {
    const set = new Set(q.options);
    if (!(set.size === 2 && set.has("True") && set.has("False"))) {
      shapeErrors.push(
        `[${i}] a 2-option (true/false) question's options must be exactly ` +
          `["True","False"]; got ${JSON.stringify(q.options)}`,
      );
    }
  }
});

if (shapeErrors.length > 0) {
  console.error("Option-shape validation failed:");
  shapeErrors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

// ── Assemble DB-ready rows (system fields assigned here) ────
// content_hash is computed over the FILLED (authored) options — before padding —
// so a true/false question's identity does not depend on storage padding.
const rows = authored.map((q) => {
  const isTrueFalse = q.options.length === 2;
  const options: [string, string, string, string] = isTrueFalse
    ? ["True", "False", "", ""]
    : (q.options as [string, string, string, string]);
  return {
    id: `gen-${uuidv4().slice(0, 8)}`,
    type: isTrueFalse ? ("true_false" as const) : ("multiple_choice" as const),
    subject: q.subject,
    tags: [slugifyForTag(q.subtopic)],
    difficulty: q.difficulty,
    question: q.question,
    options,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
    source,
    status,
    content_hash: hashQuestion(q.question, q.options),
  };
});

// ── Insert ──────────────────────────────────────────────────
const supabase = createClient(url, key);

async function main() {
  console.log(
    `Importing ${rows.length} authored questions (source='${source}', status='${status}'${sync ? ", sync=on" : ""})...`,
  );

  let inserted = 0;
  let duplicates = 0;
  let updated = 0;
  for (const row of rows) {
    const { error } = await supabase.from("questions").insert(row);
    if (error) {
      if (error.code === "23505") {
        if (sync) {
          // Row already exists (same content_hash). Sync the mutable fields so the DB
          // reflects the latest authored file. Question/options are unchanged by
          // definition (they define the hash we matched on), so we leave them alone.
          const { error: updateError } = await supabase
            .from("questions")
            .update({
              difficulty: row.difficulty,
              correct_answer: row.correct_answer,
              explanation: row.explanation,
              tags: row.tags,
              source: row.source,
              status: row.status,
            })
            .eq("content_hash", row.content_hash);
          if (updateError) {
            console.error(`  update error: ${updateError.message}`);
          } else {
            updated++;
          }
        } else {
          console.log(`  duplicate: ${row.question.slice(0, 60)}...`);
          duplicates++;
        }
      } else {
        console.error(`  insert error: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  console.log(
    `Done. Inserted: ${inserted}.` +
      (sync ? ` Updated: ${updated}.` : ` Duplicates skipped: ${duplicates}.`),
  );
  if (status === "pending") {
    console.log("Review and approve them in the admin review queue (status stays 'pending' until then).");
  } else {
    console.log("Inserted as 'approved' — live in the quiz pool immediately.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
