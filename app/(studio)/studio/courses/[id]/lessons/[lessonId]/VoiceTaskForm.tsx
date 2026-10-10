"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  VOICE_MAX_SECONDS,
  VOICE_MIN_SECONDS,
  formatVoiceDuration,
  type VoiceCompareSlot,
  type VoiceTaskBlock,
} from "@/lib/lessons";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { InlineField, errorsFor, inputClass, labelClass } from "./BlockForm";

// VOICE-003: the voice task's fields — prompt, time limit, and whether it is
// the course's "before" or "after" recording (docs/decisions/0100). Same
// field helpers and classes as the theory-block forms in BlockForm.tsx.

const NO_COMPARE = "none";

export function VoiceTaskForm({
  block,
  onChange,
  errors,
}: {
  block: VoiceTaskBlock;
  onChange: (next: VoiceTaskBlock) => void;
  errors?: BlockFieldErrors;
}) {
  const secondsErrors = errorsFor(errors, "maxSeconds");
  return (
    <div className="space-y-3">
      <InlineField
        label="Prompt"
        value={block.prompt}
        onChange={(prompt) => onChange({ ...block, prompt })}
        errors={errors}
        path="prompt"
      />
      <div className="space-y-1">
        <label className={labelClass}>
          Time limit, seconds ({VOICE_MIN_SECONDS}–{VOICE_MAX_SECONDS})
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={VOICE_MIN_SECONDS}
            max={VOICE_MAX_SECONDS}
            step={15}
            value={Number.isFinite(block.maxSeconds) ? block.maxSeconds : ""}
            onChange={(e) => onChange({ ...block, maxSeconds: Number.parseInt(e.target.value, 10) })}
            className={`${inputClass} w-28`}
          />
          {Number.isFinite(block.maxSeconds) && block.maxSeconds > 0 && (
            <span className="text-xs text-muted-foreground">= {formatVoiceDuration(block.maxSeconds)}</span>
          )}
        </div>
        {secondsErrors?.map((m, i) => (
          <p key={i} className="text-xs text-destructive-text">
            {m}
          </p>
        ))}
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Before / after comparison</label>
        <Select
          value={block.compare ?? NO_COMPARE}
          onValueChange={(v) =>
            onChange({ ...block, compare: v === NO_COMPARE ? undefined : (v as VoiceCompareSlot) })
          }
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPARE}>None (a weekly task)</SelectItem>
            <SelectItem value="before">Before — the start-of-course recording</SelectItem>
            <SelectItem value="after">After — the end-of-course recording</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A course has at most one &ldquo;before&rdquo; and one &ldquo;after&rdquo;. Publishing checks the
          course&rsquo;s other published lessons.
        </p>
      </div>
    </div>
  );
}
