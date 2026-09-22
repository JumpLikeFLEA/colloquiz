"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { scoreItem } from "@/lib/items";
import type { ItemScoreResult, SelectionGridItem } from "@/lib/items";
import {
  buildSelectionGridResponse,
  setGridRowAnswer,
} from "@/lib/lessonPlayer/selectionResponse";

/**
 * PLAY-002 — `selection_grid` renderer (inline True/False over N
 * independent statements; lib/items/selectionGrid.ts). Rows never reorder —
 * there is no `shuffleForItem` call here on purpose: the acceptance line
 * only requires shuffled PRESENTATION for `selection`'s options, and a
 * grid's rows are read top-to-bottom as one statement list, not a set of
 * interchangeable choices.
 *
 * A row left untouched submits as "unanswered", which `selectionGridModule.
 * score` scores incorrect rather than excluding — see that module's header.
 * This renderer does not block Submit on every row being answered, matching
 * that "does not throw and does not score as unattempted" contract.
 */
export function SelectionGridRenderer({
  item,
  onScore,
}: {
  item: SelectionGridItem;
  onScore: (result: ItemScoreResult) => void;
}) {
  const [answers, setAnswers] = useState<Map<string, boolean>>(new Map());
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;

  const correctByRow = new Map(result?.subResults.map((r) => [r.id, r.correct]));

  function submit() {
    const scored = scoreItem(item, buildSelectionGridResponse(answers));
    setResult(scored);
    onScore(scored);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      <div className="flex flex-col gap-2">
        {item.payload.rows.map((row) => {
          const answer = answers.get(row.id);
          const rowCorrect = correctByRow.get(row.id);
          return (
            <div
              key={row.id}
              className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                submitted
                  ? rowCorrect
                    ? "border-success-border bg-success-subtle"
                    : "border-destructive-border bg-destructive-subtle"
                  : "border-border bg-background"
              }`}
            >
              <span className="flex-1 text-sm text-foreground">{row.statement}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={submitted}
                  aria-pressed={answer === true}
                  onClick={() => setAnswers((prev) => setGridRowAnswer(prev, row.id, true))}
                  className={choiceClassName(answer === true)}
                >
                  True
                </button>
                <button
                  type="button"
                  disabled={submitted}
                  aria-pressed={answer === false}
                  onClick={() => setAnswers((prev) => setGridRowAnswer(prev, row.id, false))}
                  className={choiceClassName(answer === false)}
                >
                  False
                </button>
                {submitted &&
                  (rowCorrect ? (
                    <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      {!submitted && (
        <button
          type="button"
          onClick={submit}
          className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover cursor-pointer transition-colors"
        >
          Submit
        </button>
      )}
    </div>
  );
}

function choiceClassName(active: boolean): string {
  return `min-h-11 min-w-16 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
    active
      ? "border-brand bg-brand-subtle text-brand-text"
      : "border-border bg-background text-muted-foreground hover:border-brand/40"
  }`;
}
