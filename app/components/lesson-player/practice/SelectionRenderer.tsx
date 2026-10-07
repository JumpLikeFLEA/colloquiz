"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { PROMPT_TEXT_CLASS, SUBMIT_BUTTON_CLASS } from "./practiceClasses";
import { resolveExplanations, scoreItem } from "@/lib/items";
import type { ItemScoreResult, SelectionItem } from "@/lib/items";
import { shuffleForItem } from "@/lib/items/shuffle";
import {
  buildSelectionResponse,
  selectionOptionFeedback,
  toggleSelectionOption,
} from "@/lib/lessonPlayer/selectionResponse";
import { ExplanationDisclosure } from "./ExplanationDisclosure";
import { optionClassName } from "./optionClassName";

/**
 * PLAY-002 — `selection` renderer (MCQ single, MCQ multi, True/False; one
 * type, per lib/items/selection.ts). Each option is a full-width, real
 * `<button type="button">` row — not a tiny radio dot — so the tap target
 * clears a comfortable size on a 360px screen; same "the row IS the control"
 * precedent as SubjectGrid's subject cards (docs/ui-decisions.md).
 *
 * State only ever holds ids read off `item.payload.options` (via
 * `toggleSelectionOption`), so the response `scoreItem` receives can never
 * name an unknown/duplicate option — the `ItemResponseError` channel is
 * unreachable from here by construction, not by a try/catch.
 */
export function SelectionRenderer({
  item,
  attemptId,
  onScore,
}: {
  item: SelectionItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
}) {
  const options = useMemo(() => shuffleForItem(item.payload.options, attemptId, item.id), [item, attemptId]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;

  const feedback = submitted ? selectionOptionFeedback(item, selected) : null;
  const feedbackById = new Map(feedback?.map((f) => [f.id, f]));
  // 0009: `selection` scores as exactly one SubResult for the whole item, so
  // there is one explanation to offer — never per-option, unlike the
  // check/cross feedback above (0029 Decision 2, marked per-option on
  // purpose since that's a visual affordance, not a scoring granularity).
  const explanation =
    result && !result.subResults[0].correct
      ? resolveExplanations(item, result)[0]?.explanation
      : undefined;

  function submit() {
    const scored = scoreItem(item, buildSelectionResponse(selected));
    setResult(scored);
    onScore(scored);
  }

  return (
    <div>
      <p className={`mb-3 ${PROMPT_TEXT_CLASS}`}>{item.payload.prompt}</p>
      <div className="flex flex-col gap-2" role={item.payload.multi ? "group" : "radiogroup"}>
        {options.map((option) => {
          const isSelected = selected.includes(option.id);
          const rowFeedback = feedbackById.get(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={submitted}
              role={item.payload.multi ? "checkbox" : "radio"}
              aria-checked={isSelected}
              onClick={() => setSelected((prev) => toggleSelectionOption(prev, option.id, item.payload.multi))}
              className={optionClassName({ isSelected, submitted, feedback: rowFeedback })}
            >
              <span className="min-h-6 flex-1">{option.text}</span>
              {rowFeedback?.wasSelected && rowFeedback.isCorrect && (
                <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              )}
              {rowFeedback?.wasSelected && !rowFeedback.isCorrect && (
                <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
              )}
              {!rowFeedback?.wasSelected && rowFeedback?.isCorrect && (
                <Check className="size-4 shrink-0 text-success/60" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      {explanation && <ExplanationDisclosure explanation={explanation} />}
      {!submitted && (
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={submit}
          className={`mt-4 ${SUBMIT_BUTTON_CLASS}`}
        >
          {alliengllCopy.player.submit}
        </button>
      )}
    </div>
  );
}
