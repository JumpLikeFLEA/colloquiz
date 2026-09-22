/**
 * Draft a lesson-document course file from a partner PDF via an LLM pass
 * (CNT-005). Writes `authored/courses/<slug>.json` in exactly the
 * CNT-004-validated shape (docs/decisions/0018 Decision 3). Never writes to
 * the database — that is `scripts/import-lesson.ts`'s job (CNT-004), run
 * separately once the partner has reviewed the draft.
 *
 * DEPENDENCY DECISION (acceptance: "a new npm dependency (a PDF parser) is
 * still stop-and-ask; passing the PDF to the model directly is the
 * alternative to weigh first"): this script adds NO PDF-parsing dependency,
 * npm or otherwise. The raw PDF is base64-encoded and sent to the model as a
 * native `document` content block (`@anthropic-ai/sdk`, already a
 * dependency — see `lib/generator/llm.ts`); Claude's own PDF understanding
 * does the reading. No stop-and-ask was needed because the alternative the
 * card asks to weigh first turned out to be sufficient.
 *
 * COURSE STRUCTURE (docs/decisions/0022 Decision 1): one lettered section is
 * one lesson, except D (a noticing task over C's text) merges into C. The
 * PDF's own "pause here" banner is dropped — lesson boundaries are the
 * pauses. `SECTION_PLAN` below is the one place that mapping is decided; it
 * is PDF-specific and not meant to generalise to a future course with a
 * different section layout.
 *
 * PIPELINE:
 *   1. One call drafts course metadata + a per-lesson title/description
 *      skeleton (cheap, no PDF needed for this shape beyond the title page).
 *   2. One call per lesson drafts that lesson's `document` (theory + practice
 *      blocks), with section-specific instructions (merge, conversions to
 *      apply per 0022 Decision 6, self_check usage per 0022 Decision 2).
 *      Validated immediately with `parseLessonDocument` (CNT-003 + CNT-007);
 *      on failure, ONE repair call is made with the exact errors, then the
 *      result is accepted or recorded as failed — never silently retried
 *      forever.
 *   3. One call drafts the partner QA report (ambiguous items, internal
 *      inconsistencies, missing pages, converted-task notes) by reading the
 *      whole PDF fresh, independent of how the lessons were drafted.
 * Every call resends the same PDF document block (marked
 * `cache_control: ephemeral`) as the first content block, so calls 2..N in
 * quick succession hit Anthropic's prompt cache instead of re-billing the
 * full document each time.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/draft-lesson.ts <pdf-path> [--out-dir authored/courses]
 *
 * Requires ANTHROPIC_API_KEY. Writes the course JSON only after every lesson
 * has been attempted; a lesson that still fails validation after the repair
 * call is written anyway (a draft is not required to be perfect — the
 * partner corrects it in the editor) but is named, with its exact errors, in
 * both the console report and the QA report's "documentValidationErrors"
 * section — never silently.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, join } from "path";
import { CourseFileSchema, type LessonFile } from "../lib/lessons/courseFile";
import { parseLessonDocument } from "../lib/lessons";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
const client = new Anthropic({ apiKey });
const MODEL = process.env.ANTHROPIC_MODEL_DRAFTER ?? "claude-sonnet-4-6";

const pdfPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
const outDirFlagIndex = process.argv.indexOf("--out-dir");
const outDir = outDirFlagIndex >= 0 ? process.argv[outDirFlagIndex + 1] : "authored/courses";

if (!pdfPath) {
  console.error("Usage: draft-lesson.ts <pdf-path> [--out-dir authored/courses]");
  process.exit(1);
}

// ── This PDF's section -> lesson mapping (0022 Decision 1) ──────────────
interface SectionPlan {
  /** Lesson slug to draft. */
  slug: string;
  /** Section letter(s) this lesson covers, and any merge instruction. */
  instructions: string;
}

const SECTION_PLAN: SectionPlan[] = [
  { slug: "section-a", instructions: "Section A ONLY (\"True or false?\", 8 predictions)." },
  { slug: "section-b", instructions: "Section B ONLY (vocabulary table, 12 items)." },
  {
    slug: "section-c",
    instructions:
      "Sections C AND D MERGED INTO ONE LESSON (0022 Decision 1): C is the input text " +
      "(\"Six things the 1960s promised us\"); D is the noticing task over that same text " +
      "(find four sentence pairs). Present C's text first, then D's task.",
  },
  { slug: "section-e", instructions: "Section E ONLY (guided discovery: why two tenses, timelines, CHECK YOUR THINKING reveals, DO NOT DO THIS)." },
  { slug: "section-f", instructions: "Section F ONLY (grammar drilling, all ten tasks). This lesson runs ~25 minutes — longer than the 10-15 minute norm. Per 0022 \"What would make us revisit this\", do NOT split it; the partner splits it later in the editor if she chooses." },
  { slug: "section-g", instructions: "Section G ONLY (applied practice, all six tasks)." },
  { slug: "section-h", instructions: "Section H ONLY (\"Score a prediction\" — the learner's own 120-150 word free-writing task)." },
  { slug: "section-i", instructions: "Section I ONLY (exit check, 8 items)." },
];

// ── Shared schema/prompt text, sent identically on every call so the PDF
// document block's cache prefix matches across calls. ────────────────────
const SCHEMA_PROMPT = `
You are drafting a Colloquiz "Alliengll" English mini-course lesson document from a
partner-authored PDF. Output ONLY valid JSON in a single \`\`\`json fenced code block —
no prose outside the fence. Follow the shapes below EXACTLY; any field not listed is not
allowed (schemas are strict — an extra key is a validation error).

===== LESSON DOCUMENT =====
A lesson "document" is a JSON ARRAY of blocks, in reading order. Each block is either a
THEORY block or a PRACTICE block.

Every block needs a unique "id" (short kebab-case string, unique within the lesson) and
"kind": "theory" | "practice".

----- INLINE CONTENT -----
Any field typed InlineContent below is an ARRAY of "runs":
  [{ "text": "some text", "marks": ["emphasis"] }, { "text": " more text" }]
"marks" is OPTIONAL, an array drawn from: "emphasis", "english", "mark_a", "mark_b".
- "english": marks a run as an English-language span (rendered lang="en"). Use it for any
  English example sentence embedded in Russian-language explanation prose. This course's
  own instructional text is in English already, so "english" is rarely needed here except
  inside a Russian gloss, if you add one.
- "mark_a" / "mark_b": a CONTRASTING pair for this course's own grammar contrast (past
  simple vs. present perfect). Use mark_a for past-simple verb forms/examples and mark_b
  for present-perfect verb forms/examples inside worked examples and timelines, so a
  learner can see the contrast highlighted without reading the words. A run cannot carry
  BOTH mark_a and mark_b. Do not invent a third mark.
Every field typed "string" (not InlineContent) below is PLAIN TEXT, single line, no
markup — do not wrap it in the run-array structure.

----- THEORY BLOCKS (kind: "theory") -----
heading:   { id, kind:"theory", type:"heading", level: 1|2, text: InlineContent }
prose:     { id, kind:"theory", type:"prose", text: InlineContent }   // ONE paragraph per block
example:   { id, kind:"theory", type:"example", label?: string, text: InlineContent }
callout:   { id, kind:"theory", type:"callout", variant: "tip"|"note"|"warning", text: InlineContent }
list:      { id, kind:"theory", type:"list", ordered: boolean, items: InlineContent[] }
image:     NOT AVAILABLE — this PDF's figures are hand-drawn timelines; redraw them as
           "table" or "prose" blocks instead. Do not emit an "image" block.
video:     NOT USED for this course — omit entirely.
self_check: { id, kind:"theory", type:"self_check", prompt: InlineContent,
              response: "none"|"short"|"long", modelAnswer: InlineContent,
              checklist?: string[] (min 1 item if present) }
  - response:"none" is a "check your thinking" reveal with no writing box (use for the
    PDF's own CHECK YOUR THINKING boxes: prompt = the question, modelAnswer = the ANSWER
    text given).
  - response:"short"|"long" is for open-writing tasks (rewrite, reconstruct, build a
    sentence, the 120-150 word task): prompt = the instructions, modelAnswer = the PDF's
    own model answer/worked example for that task (if the PDF gives one) or a faithful
    model answer you write from the PDF's material, checklist = 2-4 short self-assessment
    items (e.g. "Used past simple for the prediction itself", "Used present perfect for
    the outcome").
  - self_check is NEVER scored and never counts as a practice block.
table:     { id, kind:"theory", type:"table", header: InlineContent[] (>=1 col),
             rows: InlineContent[][] (every row same length as header), caption?: InlineContent }

----- PRACTICE BLOCKS (kind: "practice") -----
A practice block is an item envelope: { id, kind:"practice", type: <one of the 5 below>,
payload: {...} }. EVERY payload needs "explanations" (an object mapping ref -> explanation
string) and MAY have "fallbackExplanation" (a string) — every explanationRef used inside
the payload must resolve to a key in "explanations" OR a "fallbackExplanation" must be
set. Prefer a SPECIFIC explanation per sub-part over one shared fallback whenever the
PDF's Part 2 answer key gives a per-item reason — that is real authored content, not a
guess. Only use a shared fallbackExplanation when the PDF gives one shared reason for a
whole task, or when no specific reason exists in the source (and in that case ALSO add a
one-line note in your "qaNotes" for this lesson: "<blockId>: no source explanation in the
PDF — explanation drafted, not sourced").

selection (MCQ single, MCQ multi, or True/False as ONE choice):
  { prompt: string, multi: boolean, options: [{id, text: string}, ...] (>=2),
    correctOptionIds: string[] (>=1), explanationRef: string,
    explanations: {...}, fallbackExplanation?: string }

selection_grid (inline True/False over N independent statements):
  { prompt: string, rows: [{id, statement: string, correct: boolean, explanationRef}, ...] (>=1),
    explanations: {...}, fallbackExplanation?: string }

ordering (a permutation of N elements, authored IN THE CORRECT ORDER):
  { prompt: string, elements: [{id, text: string, explanationRef}, ...] (>=2),
    explanations: {...}, fallbackExplanation?: string }

matching (a set of pairs between a left list and a right list; either side may have
unmatched distractors):
  { prompt: string, left: [{id, content:{kind:"text", text: string}}, ...] (>=1),
    right: [{id, content:{kind:"text", text: string}}, ...] (>=1),
    pairs: [{id, left: <left id>, right: <right id>, explanationRef}, ...] (>=1),
    explanations: {...}, fallbackExplanation?: string }

slots (N gaps in a prompt string, each gap marked "___" IN ORDER; one gaps[] entry per
"___", same order they appear in prompt):
  { prompt: string (contains "___" once per gap), input: "typed"|"drag",
    gaps: [{id, acceptedAnswers: string[] (>=1, every acceptable wording), explanationRef}, ...] (>=1),
    explanations: {...}, fallbackExplanation?: string }

----- CONVERTING PAPER-ONLY TASKS (docs/decisions/0022 Decision 6) -----
Some of this PDF's tasks only work on paper and MUST be converted to a scorable form.
Mark every conversion with a one-line note in "qaNotes": "<blockId>: converted from
<original paper instruction> — <what changed>".
- "Copy/find the sentence from the text" (Section D) -> a "selection" or "matching" item
  choosing/pairing the right sentence(s) from a fixed list of candidate sentences drawn
  from the text (do not require free-text sentence copying).
- "Circle the wrong one and write the correction" (Section F, task 6, "Spot the error")
  -> a "selection" item (which of A/B is wrong) PLUS a "slots" item (type the correction)
  for each pair, OR a single combined approach of your choosing as long as both the
  identification and the correction are scored.
- "Underline the errors [and write the correction]" (Section F, task 10, "Correct the
  paragraph") -> a "selection" item with multi:true over candidate verb-phrase options
  (the errors to identify) PLUS a "slots" item for the four corrections.
- Any other paper-only instruction ("write R or I", "circle", "cover it with your hand",
  "check Part 2") must be REWRITTEN for the screen — do not leave paper-only wording in
  a prompt or instruction string.

----- PART 2 ANSWERS -----
The PDF's "PART TWO — Answers & explanations" section is the source for
explanationRef text: merge each answer's "WHY" into the matching sub-part's explanation
— do not regenerate an explanation the PDF already gives you.

===== YOUR JSON OUTPUT FOR A LESSON DOCUMENT CALL =====
\`\`\`json
{ "document": [ ...blocks as above... ], "qaNotes": ["<blockId>: ...", ...] }
\`\`\`
"qaNotes" is REQUIRED (use an empty array if this lesson has nothing to flag) and holds
ONLY: converted-task notes and unsourced-explanation notes for blocks in THIS lesson.
`.trim();

// ── LLM plumbing ──────────────────────────────────────────────────────
function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1].trim());
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return JSON.parse(obj[0]);
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) return JSON.parse(arr[0]);
  throw new Error("No JSON found in model response");
}

async function callDrafter(
  pdfBase64: string,
  userInstruction: string,
  maxTokens: number,
): Promise<unknown> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: SCHEMA_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: userInstruction },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("model response contained no text block");
  }
  return extractJSON(textBlock.text);
}

// ── Pipeline ──────────────────────────────────────────────────────────
interface LessonDraftResult {
  slug: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  document: unknown[];
  qaNotes: string[];
  valid: boolean;
  errors: string[];
}

async function draftCoursePlan(pdfBase64: string): Promise<{
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  level: string;
  lessons: { slug: string; title: string; description?: string; estimatedMinutes?: number }[];
}> {
  const instruction =
    `Read the PDF's title page and running header/footer. Return course metadata plus a ` +
    `one-line title/description/estimatedMinutes skeleton for each of these ${SECTION_PLAN.length} ` +
    `lessons, IN THIS ORDER, one entry per slug:\n` +
    SECTION_PLAN.map((s) => `  - ${s.slug}: ${s.instructions}`).join("\n") +
    `\n\nEach lesson's estimatedMinutes should come from the PDF's own per-section minute ` +
    `label (sum the two labels for the merged section-c lesson). course.level comes from ` +
    `the PDF's own "LEVEL" label (map to the nearest CEFR code: A1/A2/B1/B2/C1/C2).\n\n` +
    `Output:\n\`\`\`json\n{ "slug": "future-imperfect", "title": "...", "subtitle": "...", ` +
    `"description": "...", "level": "B1", "lessons": [ { "slug": "section-a", "title": "...", ` +
    `"description": "...", "estimatedMinutes": 8 }, ... ] }\n\`\`\``;
  const raw = (await callDrafter(pdfBase64, instruction, 2000)) as {
    slug: string;
    title: string;
    subtitle?: string;
    description?: string;
    level: string;
    lessons: { slug: string; title: string; description?: string; estimatedMinutes?: number }[];
  };
  return raw;
}

async function draftLesson(
  pdfBase64: string,
  plan: SectionPlan,
  skeleton: { title: string; description?: string; estimatedMinutes?: number },
): Promise<LessonDraftResult> {
  const instruction =
    `Draft the "document" array for this ONE lesson: ${plan.instructions}\n\n` +
    `Follow the reading order and content of that section (and, for section-c, D) exactly ` +
    `as the PDF presents it — theory block, then practice block(s), repeated, matching the ` +
    `PDF's own "short theory block, then a couple of exercises" structure. Merge Part 2's ` +
    `answer-key "WHY" text into each practice sub-part's explanation, per this section's ` +
    `items only.`;

  let raw = (await callDrafter(pdfBase64, instruction, 8000)) as { document: unknown[]; qaNotes: string[] };
  let result = parseLessonDocument(raw.document);

  if (!result.ok) {
    const errorText = result.errors.map((e) => `[${e.field}] ${e.message}`).join("\n");
    const repairInstruction =
      `Your previous JSON for this lesson's "document" failed validation with these exact ` +
      `errors:\n${errorText}\n\nHere is the JSON you returned:\n\`\`\`json\n` +
      `${JSON.stringify(raw.document, null, 2)}\n\`\`\`\n\nFix ONLY what these errors name. ` +
      `Keep everything else the same. Return the full corrected { "document": [...], ` +
      `"qaNotes": [...] } again.`;
    raw = (await callDrafter(pdfBase64, repairInstruction, 8000)) as { document: unknown[]; qaNotes: string[] };
    result = parseLessonDocument(raw.document);
  }

  return {
    slug: "", // filled by caller
    title: skeleton.title,
    description: skeleton.description,
    estimatedMinutes: skeleton.estimatedMinutes,
    document: raw.document,
    qaNotes: raw.qaNotes ?? [],
    valid: result.ok,
    errors: result.ok ? [] : result.errors.map((e) => `[${e.field}] ${e.message}`),
  };
}

interface QAReport {
  ambiguousItems: string[];
  internalInconsistencies: string[];
  missingPages: string[];
}

async function draftQAReport(pdfBase64: string): Promise<QAReport> {
  const instruction =
    `Read the ENTIRE PDF, including its printed page-number footers. Produce a partner QA ` +
    `report as JSON:\n\`\`\`json\n{\n  "ambiguousItems": ["<section/task/item> -- <why it's ` +
    `ambiguous/defensible>", ...],\n  "internalInconsistencies": ["<what conflicts> -- ` +
    `<where each version appears>", ...],\n  "missingPages": ["<page number(s) absent from ` +
    `the printed footer sequence>", ...]\n}\n\`\`\`\n` +
    `"ambiguousItems": any exercise item whose single "correct" answer is genuinely ` +
    `defensible another way given the item's own wording (not just "could be worded ` +
    `better" — a real ambiguity a partner needs to see before publishing).\n` +
    `"internalInconsistencies": any factual claim the PDF states differently in two ` +
    `places (e.g. a duration or date given one way in the running text and another way ` +
    `elsewhere).\n` +
    `"missingPages": read every printed page-footer number from first to last and report ` +
    `every gap in that numeric sequence, listing each missing number (or range).`;
  return (await callDrafter(pdfBase64, instruction, 2000)) as QAReport;
}

async function run() {
  const pdfBuffer = readFileSync(pdfPath!);
  const pdfBase64 = pdfBuffer.toString("base64");

  console.log(`Drafting from ${basename(pdfPath!)} (${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);

  console.log("Step 1/3: course + lesson skeleton...");
  const plan = await draftCoursePlan(pdfBase64);

  const lessons: LessonDraftResult[] = [];
  for (let i = 0; i < SECTION_PLAN.length; i++) {
    const sectionPlan = SECTION_PLAN[i];
    const skeleton = plan.lessons[i];
    console.log(`Step 2/3: lesson ${i + 1}/${SECTION_PLAN.length} (${sectionPlan.slug})...`);
    const drafted = await draftLesson(pdfBase64, sectionPlan, skeleton ?? { title: sectionPlan.slug });
    drafted.slug = sectionPlan.slug;
    lessons.push(drafted);
    console.log(`  -> ${drafted.valid ? "valid" : `INVALID (${drafted.errors.length} error(s))`}`);
  }

  console.log("Step 3/3: partner QA report...");
  const qaReport = await draftQAReport(pdfBase64);

  const draftLessons: LessonFile[] = lessons.map((l) => ({
    slug: l.slug,
    title: l.title,
    description: l.description,
    estimatedMinutes: l.estimatedMinutes,
    document: l.document,
  }));
  const courseFile = {
    slug: plan.slug,
    title: plan.title,
    subtitle: plan.subtitle,
    description: plan.description,
    level: plan.level,
    status: "draft" as const,
    lessons: draftLessons,
  };

  const fileCheck = CourseFileSchema.safeParse(courseFile);
  if (!fileCheck.success) {
    console.error("Course file failed shape validation (metadata, not lesson documents):");
    for (const issue of fileCheck.error.issues) {
      console.error(`  [${issue.path.join(".")}] ${issue.message}`);
    }
  }

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${plan.slug}.json`);
  writeFileSync(outPath, JSON.stringify(courseFile, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${outPath}`);

  const allQaNotes = lessons.flatMap((l) => l.qaNotes.map((n) => `${l.slug}: ${n}`));
  const invalidLessons = lessons.filter((l) => !l.valid);
  const qaReportPath = join(outDir, `${plan.slug}.qa.md`);
  const qaMd = [
    `# QA report — ${plan.title}`,
    "",
    "## Ambiguous items",
    ...(qaReport.ambiguousItems.length ? qaReport.ambiguousItems.map((s) => `- ${s}`) : ["None found."]),
    "",
    "## Internal inconsistencies",
    ...(qaReport.internalInconsistencies.length
      ? qaReport.internalInconsistencies.map((s) => `- ${s}`)
      : ["None found."]),
    "",
    "## Pages missing from the file",
    ...(qaReport.missingPages.length ? qaReport.missingPages.map((s) => `- ${s}`) : ["None found."]),
    "",
    "## Converted tasks and unsourced explanations",
    ...(allQaNotes.length ? allQaNotes.map((s) => `- ${s}`) : ["None."]),
    "",
    "## Lesson document validation",
    ...lessons.map((l) =>
      l.valid
        ? `- ${l.slug}: valid`
        : `- ${l.slug}: INVALID\n${l.errors.map((e) => `  - ${e}`).join("\n")}`,
    ),
    "",
  ].join("\n");
  writeFileSync(qaReportPath, qaMd, "utf-8");
  console.log(`Wrote ${qaReportPath}`);

  if (invalidLessons.length > 0) {
    console.error(
      `\n${invalidLessons.length}/${lessons.length} lesson(s) failed validation after the repair ` +
        `attempt: ${invalidLessons.map((l) => l.slug).join(", ")}. See ${qaReportPath}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${lessons.length} lessons passed the lesson validator.`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
