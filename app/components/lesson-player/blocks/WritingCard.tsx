"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { WRITING_ANSWER_MAX_CHARS, type WritingTaskBlock } from "@/lib/lessons";
import { writingCopy } from "@/lib/alliengll/writingCopy";
import { createDraftStore } from "@/lib/writing/draftStore";
import { PRACTICE_CARD_CLASS } from "../columnLayout";
import { InlineContentView } from "../InlineContent";
import { PROMPT_TEXT_CLASS } from "../practice/practiceClasses";

const SAVE_DELAY_MS = 500;

/**
 * The learner's side of a writing task: a prompt, a textarea that grows with
 * its text, and a counter. Not scored, not numbered "Exercise N of M".
 *
 * The draft is read AFTER mount (an effect), so the server HTML is the empty
 * card whatever is stored. It is written debounced and on `pagehide`. With no
 * `draftKey` (the Studio preview) it lives in memory only.
 */
export function WritingCard({ block, draftKey }: { block: WritingTaskBlock; draftKey: string | null }) {
  const store = useMemo(() => createDraftStore(draftKey), [draftKey]);
  const [text, setText] = useState("");
  const latest = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    // Reading storage after mount is the point: it is an external system.
    const saved = store.read();
    latest.current = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(saved);
    function flush() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (dirty.current) {
        dirty.current = false;
        store.write(latest.current);
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [store]);

  function onChange(next: string) {
    latest.current = next;
    dirty.current = true;
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      dirty.current = false;
      store.write(latest.current);
    }, SAVE_DELAY_MS);
  }

  const inputId = `writing-${block.id}`;
  return (
    <div className={PRACTICE_CARD_CLASS}>
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
        <PenLine className="size-3.5" aria-hidden="true" />
        {writingCopy.label}
      </p>
      {/* pre-line: the prompt may hold line breaks (docs/decisions/0224). */}
      <p id={`${inputId}-prompt`} className={`whitespace-pre-line ${PROMPT_TEXT_CLASS}`}>
        <InlineContentView content={block.prompt} />
      </p>
      <textarea
        id={inputId}
        aria-labelledby={`${inputId}-prompt`}
        value={text}
        maxLength={WRITING_ANSWER_MAX_CHARS}
        placeholder={writingCopy.placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-3 block min-h-28 w-full resize-none rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm outline-none [field-sizing:content] focus:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{writingCopy.practiceNote}</span>
        <span className="tabular-nums">{writingCopy.counter(text.length, WRITING_ANSWER_MAX_CHARS)}</span>
      </div>
    </div>
  );
}
