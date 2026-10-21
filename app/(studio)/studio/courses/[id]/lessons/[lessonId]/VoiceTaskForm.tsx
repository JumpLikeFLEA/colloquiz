"use client";

import { createContext, useContext, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  VOICE_LISTEN_FOR_MAX_ITEMS,
  VOICE_LISTEN_FOR_MAX_LENGTH,
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
const LINE_BREAK = "\n";

// AUTH-020: the "before" task's expressions, offered to a task that is set to
// "after" while its own list is empty (docs/decisions/0156 Decision 8). Held in
// context because BlockList renders the form three layers down.
const BeforeListenForContext = createContext<string[] | undefined>(undefined);
export const BeforeListenForProvider = BeforeListenForContext.Provider;

/** The textarea's lines as the list the block stores: trimmed, blanks dropped,
 * and no list at all when nothing is left. Duplicates and over-length lines
 * are kept so the schema's message names them on save. */
function linesToList(text: string): string[] | undefined {
  const items = text.split(LINE_BREAK).map((line) => line.trim()).filter((line) => line !== "");
  return items.length > 0 ? items : undefined;
}

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
  const beforeList = useContext(BeforeListenForContext);

  // The textarea keeps its own text so a trailing newline survives typing; the
  // block holds the cleaned list. When the block's list changes from outside
  // (the copy below, a restored version) the text follows it.
  const stored = (block.listenFor ?? []).join(LINE_BREAK);
  const [text, setText] = useState(stored);
  const [syncedFrom, setSyncedFrom] = useState(stored);
  if (stored !== syncedFrom) {
    setSyncedFrom(stored);
    if ((linesToList(text) ?? []).join(LINE_BREAK) !== stored) setText(stored);
  }
  const listenErrors = [...(errors?.entries() ?? [])]
    .filter(([path]) => path === "listenFor" || path.startsWith("listenFor["))
    .flatMap(([, messages]) => messages);
  const lineCount = linesToList(text)?.length ?? 0;

  function setListenFor(nextText: string) {
    setText(nextText);
    onChange({ ...block, listenFor: linesToList(nextText) });
  }

  function setCompare(v: string) {
    const compare = v === NO_COMPARE ? undefined : (v as VoiceCompareSlot);
    // A new "after" task starts from the "before" task's list, once: only an
    // empty list is filled, never one the author has written.
    if (compare === "after" && !block.listenFor?.length && beforeList?.length) {
      setText(beforeList.join(LINE_BREAK));
      onChange({ ...block, compare, listenFor: beforeList });
      return;
    }
    onChange({ ...block, compare });
  }

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
          onValueChange={setCompare}
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
      <div className="space-y-1">
        <label htmlFor={`${block.id}-listen-for`} className={labelClass}>
          Expressions to listen for (optional)
        </label>
        <textarea
          id={`${block.id}-listen-for`}
          value={text}
          onChange={(e) => setListenFor(e.target.value)}
          rows={4}
          spellCheck={false}
          className={`${inputClass} resize-y`}
        />
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            One per line, up to {VOICE_LISTEN_FOR_MAX_LENGTH} characters each. The voice feedback looks for these in
            the recording.
            {block.compare === "after" && " A new After task starts with the Before task’s list."}
          </p>
          <span
            className={`shrink-0 text-xs tabular-nums ${
              lineCount > VOICE_LISTEN_FOR_MAX_ITEMS ? "text-destructive-text" : "text-muted-foreground"
            }`}
          >
            {lineCount} / {VOICE_LISTEN_FOR_MAX_ITEMS}
          </span>
        </div>
        {listenErrors.map((m, i) => (
          <p key={i} className="text-xs text-destructive-text">
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}
