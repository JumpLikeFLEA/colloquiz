"use client";

import { useState } from "react";
import type { z } from "zod";
import type { SelfCheckBlockSchema } from "@/lib/lessons";
import { THEORY_BODY_TEXT_CLASS } from "../layout";
import { InlineContentView } from "../InlineContent";

/**
 * `self_check` — 0022 Decision 2: an unscored theory-side block. Everything
 * here is LOCAL component state, never persisted (attempt storage is M2) and
 * never fed into `aggregateLessonScore` — this block never becomes a
 * practice block, so `LessonPlayer` never even offers it a scoring slot.
 */
export function SelfCheckBlockView({ block }: { block: z.infer<typeof SelfCheckBlockSchema> }) {
  const [response, setResponse] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => (block.checklist ?? []).map(() => false));

  return (
    <div className="rounded-lg border border-brand-border bg-brand-subtle px-3 py-3 space-y-3">
      <p className={`font-medium text-foreground ${THEORY_BODY_TEXT_CLASS}`}>
        <InlineContentView content={block.prompt} />
      </p>

      {block.response === "short" && (
        <input
          type="text"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Your answer"
          className="w-full rounded-md border border-input-background bg-background px-3 py-2 text-sm"
        />
      )}
      {block.response === "long" && (
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Your answer"
          rows={4}
          className="w-full rounded-md border border-input-background bg-background px-3 py-2 text-sm"
        />
      )}

      {block.checklist && block.checklist.length > 0 && (
        <ul className="space-y-1.5">
          {block.checklist.map((item, index) => (
            // Checklist strings are not guaranteed unique; `checklist` is
            // re-derived fresh on every parse, never reordered in place.
            <li key={index} className={`flex items-center gap-2 ${THEORY_BODY_TEXT_CLASS}`}>
              <input
                type="checkbox"
                checked={checked[index] ?? false}
                onChange={() =>
                  setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)))
                }
                className="size-4 accent-brand"
                id={`${block.id}-check-${index}`}
              />
              <label htmlFor={`${block.id}-check-${index}`}>{item}</label>
            </li>
          ))}
        </ul>
      )}

      {revealed ? (
        <div className={`rounded-md border border-border bg-background px-3 py-2 text-foreground ${THEORY_BODY_TEXT_CLASS}`}>
          <p className="text-xs font-medium text-muted-foreground mb-1">Model answer</p>
          <InlineContentView content={block.modelAnswer} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="text-sm font-medium text-brand-text underline cursor-pointer"
        >
          Show model answer
        </button>
      )}
    </div>
  );
}
