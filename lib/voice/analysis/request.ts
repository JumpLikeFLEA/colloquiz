import type { VoiceCompareSlot } from "../../lessons/taskBlocks";
import { promptVersionLabel } from "./instructions";
import type { FirstAnalysisContext, OutlineLesson, VoiceAnalysisInstruction } from "./schema";

export { promptVersionLabel };

/**
 * What goes to Claude (VOICE-012, docs/decisions/0156 "Claude output", 0182). Pure: the
 * instruction text is read by the caller (the pipeline reads prompts/voice-analysis), the
 * transcript and the task come from the database. The instruction is the cached system
 * block and everything the learner or the author wrote is data in the user message.
 *
 * Nothing here takes a user id, a name or an email, so none can reach the provider; the
 * test asserts it on the built request.
 */

/**
 * Text that goes into a tag. The transcript is what the learner SAID, so it could say
 * "</transcript>"; angle brackets are replaced by a space and the model's quotes are
 * checked against this text, not against the provider's original.
 */
export function promptSafeText(text: string): string {
  return text.replace(/[<>]/g, " ");
}

/** The instruction files start with an HTML comment for maintainers; the model never sees it. */
export function instructionBody(fileText: string): string {
  return fileText.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

export type InstructionChoice = { kind: VoiceAnalysisInstruction; includeGoal: boolean };

/**
 * 0156 Decision 10: an `after` task gets `final` when the learner's `before` take has a
 * transcript to compare with, and every other task gets `first`. An `interim` task (the end of
 * the free first lesson, 0229) always gets `interim`, with or without a baseline: the
 * instruction handles a missing first take itself (0229 Decision 8). The goal card is the
 * `before` task's alone: a final answers that goal instead of setting a new one, and a
 * task with no role, or an `after` task with nothing to compare against, has no goal
 * card (VOICE-013, 0188).
 */
export function chooseInstruction(role: VoiceCompareSlot | undefined, hasBaseline: boolean): InstructionChoice {
  if (role === "before") return { kind: "first", includeGoal: true };
  if (role === "interim") return { kind: "interim", includeGoal: false };
  if (role === "after" && hasBaseline) return { kind: "final", includeGoal: false };
  return { kind: "first", includeGoal: false };
}

export type AnalysisRequestInput = {
  kind: VoiceAnalysisInstruction;
  taskPrompt: string;
  expressions: readonly string[];
  transcript: string;
  firstTranscript: string | null;
  /** The stored first analysis (its goal and main error), for a final. Null when it has neither. */
  firstAnalysis?: FirstAnalysisContext | null;
  /** Interim only: the later lessons (outline.ts). Left out of the message when empty. */
  courseOutline?: readonly OutlineLesson[];
};

/** The user message, in the shape scripts/voice-bench-claude.ts measured. */
export function buildUserMessage(input: AnalysisRequestInput): string {
  const head =
    `<task_prompt>${promptSafeText(input.taskPrompt)}</task_prompt>\n` +
    `<expressions>\n${input.expressions.map(promptSafeText).join("\n")}\n</expressions>\n`;
  if (input.kind === "final") {
    if (input.firstTranscript === null) throw new Error("a final analysis needs the first transcript");
    return (
      head +
      `<first_transcript>${promptSafeText(input.firstTranscript)}</first_transcript>\n` +
      firstAnalysisBlock(input.firstAnalysis ?? null) +
      `<final_transcript>${promptSafeText(input.transcript)}</final_transcript>`
    );
  }
  if (input.kind === "interim") {
    return (
      head +
      (input.firstTranscript === null ? "" : `<first_transcript>${promptSafeText(input.firstTranscript)}</first_transcript>\n`) +
      (input.firstTranscript === null ? "" : firstAnalysisBlock(input.firstAnalysis ?? null)) +
      `<interim_transcript>${promptSafeText(input.transcript)}</interim_transcript>` +
      courseOutlineBlock(input.courseOutline ?? [])
    );
  }
  return `${head}<transcript>${promptSafeText(input.transcript)}</transcript>`;
}

/**
 * The first analysis's goal and main error, as data. Both are model output from an earlier
 * run, so they pass through the same angle-bracket filter as speech. An empty block is left
 * out entirely, which is how the instruction knows there is no goal to judge.
 */
function firstAnalysisBlock(first: FirstAnalysisContext | null): string {
  if (!first) return "";
  let out = "";
  if (first.goal) out += `<first_goal>${promptSafeText(first.goal)}</first_goal>\n`;
  if (first.mainError) {
    const e = first.mainError;
    out +=
      `<first_main_error>\n` +
      `said: ${promptSafeText(e.quote)}\n` +
      `correction: ${promptSafeText(e.correction)}\n` +
      `why: ${promptSafeText(e.explanation)}\n` +
      `</first_main_error>\n`;
  }
  return out;
}

/**
 * The outline as data: one block of "key: value" lines per lesson, a blank line between
 * blocks. Author text, so every value passes the angle-bracket filter and loses its line
 * breaks (a description holding "lesson: 9" on a line of its own must not read as a block).
 * The lesson id is never sent: the model names a lesson by its number, and validate.ts maps
 * the number back (0229 Decision 18). Empty: no tag, which is how the instruction knows the
 * course has no later lessons.
 */
function courseOutlineBlock(outline: readonly OutlineLesson[]): string {
  if (outline.length === 0) return "";
  const line = (v: string) => promptSafeText(v).replace(/\s+/g, " ").trim();
  const blocks = outline.map((l) =>
    [
      `lesson: ${l.number}`,
      `title: ${line(l.title)}`,
      l.about ? `about: ${line(l.about)}` : null,
      l.expressions.length > 0 ? `expressions: ${l.expressions.map(line).join("; ")}` : null,
    ]
      .filter((x): x is string => x !== null)
      .join("\n"),
  );
  return `\n<course_outline>\n${blocks.join("\n\n")}\n</course_outline>`;
}
