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
 * VOICE-014 (docs/decisions/0189): while the AI analysis is switched on (`context.analysis`),
 * a task that is not a `before` task lists its "expressions to listen for" as "Try to use".
 * A `before` task hides the list so the baseline is honest (0156 Decision 8).
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
      {context?.analysis && block.compare !== "before" && block.listenFor && block.listenFor.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">{voiceCopy.tryToUse}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {block.listenFor.map((phrase) => (
              <li key={phrase} className="max-w-full break-words rounded-full bg-highlight px-2.5 py-1 text-xs font-medium text-highlight-foreground">
                {phrase}
              </li>
            ))}
          </ul>
        </div>
      )}
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
