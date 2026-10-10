import { Mic } from "lucide-react";
import { formatVoiceDuration, type VoiceTaskBlock } from "@/lib/lessons";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { PRACTICE_CARD_CLASS } from "../columnLayout";
import { InlineContentView } from "../InlineContent";
import { PROMPT_TEXT_CLASS, SUBMIT_BUTTON_CLASS } from "../practice/practiceClasses";

/**
 * A voice task (VOICE-003, docs/decisions/0100) with a PLACEHOLDER recorder:
 * the prompt, the time limit and a disabled Record button. VOICE-005
 * replaces the button with the real recorder. The admin preview renders this
 * same view, so the partner sees where the recorder will sit.
 *
 * Drawn as an exercise card (same card, same prompt and button classes) so
 * it reads as something the learner does, but with no "Exercise N of M"
 * pill: a voice task is not scored and is not counted as an exercise.
 */
export function VoiceTaskBlockView({ block }: { block: VoiceTaskBlock }) {
  const copy = alliengllCopy.player;
  return (
    <div className={PRACTICE_CARD_CLASS}>
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
        <Mic className="size-3.5" aria-hidden="true" />
        {copy.voiceTaskLabel}
      </p>
      <p className={PROMPT_TEXT_CLASS}>
        <InlineContentView content={block.prompt} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {copy.voiceUpTo} {formatVoiceDuration(block.maxSeconds)}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled className={`${SUBMIT_BUTTON_CLASS} gap-1.5`}>
          <Mic className="size-4" aria-hidden="true" />
          {copy.voiceRecord}
        </button>
        <span className="text-xs text-muted-foreground">{copy.voiceNotYet}</span>
      </div>
    </div>
  );
}
