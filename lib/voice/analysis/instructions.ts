import type { VoiceAnalysisInstruction } from "./schema";

/**
 * Which version of each instruction is live (VOICE-013, docs/decisions/0156 Decision 10,
 * 0188). The text lives in prompts/voice-analysis/<instruction>-<version>.md. A changed
 * instruction is a NEW file with the next version here; an old file stays in the repo so
 * a stored `prompt_version` (voice_analyses) still points at the words that produced it.
 * `first` and `final` are versioned apart because a change to one need not touch the other.
 */
export const VOICE_ANALYSIS_INSTRUCTION_VERSIONS: Record<VoiceAnalysisInstruction, string> = {
  first: "v1",
  final: "v1",
};

/** `<instruction>-<version>`, as stored in voice_analyses.prompt_version and used as the file stem. */
export function promptVersionLabel(kind: VoiceAnalysisInstruction): string {
  return `${kind}-${VOICE_ANALYSIS_INSTRUCTION_VERSIONS[kind]}`;
}

export function instructionFileName(kind: VoiceAnalysisInstruction): string {
  return `${promptVersionLabel(kind)}.md`;
}
