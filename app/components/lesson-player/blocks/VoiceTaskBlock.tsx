import { Mic } from "lucide-react";
import { formatVoiceDuration, type VoiceTaskBlock } from "@/lib/lessons";
import { voiceCopy } from "@/lib/alliengll/voiceCopy";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";
import { PRACTICE_CARD_CLASS } from "../columnLayout";
import { InlineContentView } from "../InlineContent";
import { PROMPT_TEXT_CLASS, SUBMIT_BUTTON_CLASS } from "../practice/practiceClasses";
import { VoiceRecorder } from "./VoiceRecorder";

/**
 * A voice task (VOICE-003, docs/decisions/0100; recorder VOICE-005, 0111).
 * LessonPlayer loads this module with `next/dynamic`, so it and the
 * recorder are one chunk that only a lesson with a voice task downloads.
 *
 * Drawn as an exercise card (same card, same prompt and button classes) so
 * it reads as something the learner does, but with no "Exercise N of M"
 * pill: a voice task is not scored and is not counted as an exercise.
 *
 * With no `context` (the admin preview, the demo, tests) it keeps the
 * placeholder: a disabled Record button. The microphone is allowed only on
 * the lesson route (next.config.ts), so a working recorder there would fail.
 *
 * TCH-006: a linked student's lesson client puts "Ask the teacher" at the
 * foot of the card through `context.renderAsk`; nobody else has one.
 */
export function VoiceTaskBlockView({ block, context }: { block: VoiceTaskBlock; context?: VoiceTasksContext }) {
  return (
    <div className={PRACTICE_CARD_CLASS}>
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
        <Mic className="size-3.5" aria-hidden="true" />
        {voiceCopy.label}
      </p>
      <p className={PROMPT_TEXT_CLASS}>
        <InlineContentView content={block.prompt} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {voiceCopy.upTo} {formatVoiceDuration(block.maxSeconds)}
      </p>
      {context ? (
        <VoiceRecorder block={block} context={context} />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled className={`${SUBMIT_BUTTON_CLASS} gap-1.5`}>
            <Mic className="size-4" aria-hidden="true" />
            {voiceCopy.record}
          </button>
          <span className="text-xs text-muted-foreground">{voiceCopy.previewNote}</span>
        </div>
      )}
      {context?.renderAsk?.(block.id)}
    </div>
  );
}
