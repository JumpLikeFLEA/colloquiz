"use client";

import { Plus, X } from "lucide-react";
import { INLINE_MARKS, type InlineContent, type InlineMark } from "@/lib/lessons";

// The "no typed markup" control the AUTH-002 issue calls for: an
// InlineContent value (lib/lessons/inline.ts) is an array of runs, each
// plain text plus an optional set of marks, never a Markdown/HTML string.
// This renders it as one row per run — a text box plus mark-toggle buttons —
// with add/remove-run controls. A mixed-mark sentence is built by splitting
// it across runs by hand, not by selecting a text range: a real range-select
// rich-text control would need a new npm dependency, which the issue asks us
// to stop and ask about rather than add by default.

const MARK_LABEL: Record<InlineMark, string> = {
  emphasis: "Em",
  english: "EN",
  mark_a: "A",
  mark_b: "B",
};

const MARK_TITLE: Record<InlineMark, string> = {
  emphasis: "Emphasis",
  english: "English span",
  mark_a: "Highlight A",
  mark_b: "Highlight B",
};

function emptyRun() {
  return { text: "" };
}

export function InlineEditor({
  value,
  onChange,
  fieldErrors,
  placeholder,
}: {
  value: InlineContent;
  onChange: (next: InlineContent) => void;
  fieldErrors?: string[];
  placeholder?: string;
}) {
  const runs: InlineContent = value.length > 0 ? value : [emptyRun()];

  function updateText(index: number, text: string) {
    onChange(runs.map((run, i) => (i === index ? { ...run, text } : run)));
  }

  function toggleMark(index: number, mark: InlineMark) {
    onChange(
      runs.map((run, i) => {
        if (i !== index) return run;
        const marks = new Set<InlineMark>(run.marks ?? []);
        if (marks.has(mark)) {
          marks.delete(mark);
        } else {
          if (mark === "mark_a") marks.delete("mark_b");
          if (mark === "mark_b") marks.delete("mark_a");
          marks.add(mark);
        }
        const next = Array.from(marks);
        return next.length > 0 ? { ...run, marks: next } : { text: run.text };
      }),
    );
  }

  function addRun() {
    onChange([...runs, emptyRun()]);
  }

  function removeRun(index: number) {
    if (runs.length <= 1) return;
    onChange(runs.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-1.5">
      {runs.map((run, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            value={run.text}
            onChange={(e) => updateText(index, e.target.value)}
            placeholder={index === 0 ? placeholder : "…"}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <div className="flex items-center gap-0.5 shrink-0">
            {INLINE_MARKS.map((mark) => {
              const active = (run.marks ?? []).includes(mark);
              return (
                <button
                  key={mark}
                  type="button"
                  onClick={() => toggleMark(index, mark)}
                  title={MARK_TITLE[mark]}
                  aria-pressed={active}
                  className={`cursor-pointer px-1.5 py-1 rounded text-xs font-medium transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "border border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {MARK_LABEL[mark]}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => removeRun(index)}
            disabled={runs.length <= 1}
            aria-label="Remove run"
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 shrink-0 p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRun}
        className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus size={12} />
        Add run
      </button>
      {fieldErrors?.map((message, i) => (
        <p key={i} className="text-xs text-destructive-text">
          {message}
        </p>
      ))}
    </div>
  );
}
