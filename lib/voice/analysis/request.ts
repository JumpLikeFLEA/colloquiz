import type { VoiceCompareSlot } from "../../lessons/taskBlocks";
import { VOICE_ANALYSIS_PROMPT_VERSION, type VoiceAnalysisInstruction } from "./schema";

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

/** `<instruction>-<version>`, as stored in voice_analyses.prompt_version. */
export function promptVersionLabel(kind: VoiceAnalysisInstruction): string {
  return `${kind}-${VOICE_ANALYSIS_PROMPT_VERSION}`;
}

export type InstructionChoice = { kind: VoiceAnalysisInstruction; includeGoal: boolean };

/**
 * 0156 Decision 10: a `before` task gets `first` with its goal; a task with no
 * before/after role gets `first` without the goal card; an `after` task gets `final`
 * when the learner's `before` take has a transcript to compare with. An `after` task
 * with nothing to compare against gets `first` without a goal (the "keep practising"
 * goal belongs to a comparison).
 */
export function chooseInstruction(role: VoiceCompareSlot | undefined, hasBaseline: boolean): InstructionChoice {
  if (role === "before") return { kind: "first", includeGoal: true };
  if (role === "after" && hasBaseline) return { kind: "final", includeGoal: true };
  return { kind: "first", includeGoal: false };
}

export type AnalysisRequestInput = {
  kind: VoiceAnalysisInstruction;
  taskPrompt: string;
  expressions: readonly string[];
  transcript: string;
  firstTranscript: string | null;
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
      `<final_transcript>${promptSafeText(input.transcript)}</final_transcript>`
    );
  }
  return `${head}<transcript>${promptSafeText(input.transcript)}</transcript>`;
}
