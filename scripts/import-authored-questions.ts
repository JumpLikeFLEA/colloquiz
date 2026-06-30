/**
 * Import externally-authored questions into the Supabase questions table.
 *
 * Authored JSON is produced by an external LLM following the question-authoring
 * instruction. Each element carries exactly the seven authored keys:
 *   { subject, subtopic, difficulty, question, options[4], correct_answer, explanation }
 *
 * This script assigns the system fields authors must NOT provide
 * (id, type, tags, source, status, content_hash) and inserts each row as
 * status='pending', landing it in the admin review queue. tags is derived from
 * subtopic via slugifyForTag; content_hash via hashQuestion — identical to the
 * AI generation path, so dedup against existing rows works the same way.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-authored-questions.ts <path-to.json> [--source manual|ai_generated]
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

if (!filePath) {
  console.error("Usage: import-authored-questions.ts <path-to.json> [--source manual|ai_generated] [--status pending|approved]");
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
    options: z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
    ]),
    correct_answer: z.string().min(1),
    explanation: z.string().min(10),
  })
  .refine((q) => q.options.includes(q.correct_answer), {
    message: "correct_answer must match one of the four options verbatim",
  });

const AuthoredArraySchema = z.array(AuthoredQuestionSchema).min(1);

// ── Load + structurally validate the authored file ──────────
const raw = JSON.parse(readFileSync(filePath, "utf-8"));
const parsed = AuthoredArraySchema.safeParse(raw);
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

// ── Assemble DB-ready rows (system fields assigned here) ────
const rows = authored.map((q) => ({
  id: `gen-${uuidv4().slice(0, 8)}`,
  type: "multiple_choice" as const,
  subject: q.subject,
  tags: [slugifyForTag(q.subtopic)],
  difficulty: q.difficulty,
  question: q.question,
  options: q.options,
  correct_answer: q.correct_answer,
  explanation: q.explanation,
  source,
  status,
  content_hash: hashQuestion(q.question, q.options),
}));

// ── Insert ──────────────────────────────────────────────────
const supabase = createClient(url, key);

async function main() {
  console.log(`Importing ${rows.length} authored questions (source='${source}', status='${status}')...`);

  let inserted = 0;
  let duplicates = 0;
  for (const row of rows) {
    const { error } = await supabase.from("questions").insert(row);
    if (error) {
      if (error.code === "23505") {
        console.log(`  duplicate: ${row.question.slice(0, 60)}...`);
        duplicates++;
      } else {
        console.error(`  insert error: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  console.log(`Done. Inserted: ${inserted}. Duplicates skipped: ${duplicates}.`);
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
