/**
 * 0156 Decision 6's global switch, read from VOICE_ANALYSIS_MODE. Anything but
 * `on` or `paused` is `off`, so a missing or misspelt value fails closed:
 * production stays off until OPS-026's legal revision is published.
 *
 * Moved here from lib/voice/taskContext.ts (VOICE-012), which still re-exports
 * both names for the lesson page.
 */
export type VoiceAnalysisMode = "off" | "paused" | "on";

export function parseVoiceAnalysisMode(raw: string | null | undefined): VoiceAnalysisMode {
  const v = raw?.trim().toLowerCase();
  return v === "on" || v === "paused" ? v : "off";
}

/**
 * What the pipeline does with a send it is handed. Only `on` calls a provider.
 * `paused` and `off` both give the send back (voice_analysis_pause, 097): the SQL
 * that creates the analysis row cannot see this variable (0183 Decision 10), so the
 * row exists at send time and the pipeline is what removes it. A cohort learner can
 * send in every mode, which is why `off` is handled here too and not left pending.
 */
export type VoiceAnalysisAction = "run" | "pause";

export function voiceAnalysisAction(mode: VoiceAnalysisMode): VoiceAnalysisAction {
  return mode === "on" ? "run" : "pause";
}
