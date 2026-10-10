import type { InlineContent } from "./inline";
import { formatVoiceDuration, type VoiceTaskBlock } from "./taskBlocks";

/**
 * Plain-text renderings of lesson blocks, for the content export
 * (docs/handoff.md, "Content ownership": a readable document plus the raw
 * data). Only the voice task is rendered today (VOICE-003); the export
 * itself, and the other block types, are M4.
 *
 * Marks are dropped, not translated into Markdown: this is text a person
 * reads, and the raw data beside it keeps the marks.
 */

export function inlinePlainText(content: InlineContent): string {
  return content.map((run) => run.text).join("");
}

/**
 *   Voice task (before) — up to 3 min
 *   Tell us about your week.
 */
export function voiceTaskPlainText(block: VoiceTaskBlock): string {
  const slot = block.compare ? ` (${block.compare})` : "";
  return `Voice task${slot} — up to ${formatVoiceDuration(block.maxSeconds)}\n${inlinePlainText(block.prompt)}`;
}
