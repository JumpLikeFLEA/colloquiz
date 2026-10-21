import type { VoiceCompareSlot } from "../../lessons/taskBlocks";
import { promptVersionLabel } from "./instructions";
import type { FirstAnalysisContext, VoiceAnalysisInstruction } from "./schema";

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
 * transcript to compare with, and every other task gets `first`. The goal card is the
 * `before` task's alone: a final answers that goal instead of setting a new one, and a
 * task with no role, or an `after` task with nothing to compare against, has no goal
 * card (VOICE-013, 0188).
 */
export function chooseInstruction(role: VoiceCompareSlot | undefined, hasBaseline: boolean): InstructionChoice {
  if (role === "before") return { kind: "first", includeGoal: true };
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
