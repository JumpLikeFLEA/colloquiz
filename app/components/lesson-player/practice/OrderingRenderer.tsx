"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { scoreItem } from "@/lib/items";
import type { ItemScoreResult, OrderingItem } from "@/lib/items";
import { shuffleOrderingIndices } from "@/lib/items/shuffle";
import { buildOrderingResponse, initialOrder, moveOrderElement } from "@/lib/lessonPlayer/orderingResponse";

/**
 * PLAY-003 — `ordering` renderer (permutation of N elements;
 * lib/items/ordering.ts). Reordering is up/down MOVE buttons on each row,
 * not drag — see docs/decisions/0030-play003-ordering-matching-renderers.md
 * Decision 1 for why: a hand-rolled native-pointer-event drag reorder has
 * real touch-scroll conflicts on a 360px screen (this card's own acceptance
 * line flags "what happens mid-drag on scroll" as something a drag choice
 * has to answer), and the item type's own `rendererNeeds.inputs` already
 * declares a non-drag "typed" input as an accepted alternative. Each row is
 * a real `<button>`-based control, min-h-11 (44px) throughout, same "the
 * row IS the control" precedent as SelectionGridRenderer (docs/decisions/
 * 0029 Decision 4).
 *
 * State (`order`) only ever holds ids read off `item.payload.elements` —
 * `moveOrderElement` swaps two ids already present, so a duplicate/missing
 * id can never reach `scoreItem`; the `ItemResponseError` channel is
 * unreachable by construction, same discipline as PLAY-002's renderers.
 */
export function OrderingRenderer({
  item,
  attemptId,
  onScore,
}: {
  item: OrderingItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
}) {
  const elementIds = useMemo(() => item.payload.elements.map((element) => element.id), [item]);
  const elementsById = useMemo(
    () => new Map(item.payload.elements.map((element) => [element.id, element])),
    [item],
  );
  const startOrder = useMemo(() => {
    const displayIndices = shuffleOrderingIndices(elementIds.length, attemptId, item.id);
    return initialOrder(elementIds, displayIndices);
  }, [elementIds, attemptId, item.id]);

  const [order, setOrder] = useState<string[]>(startOrder);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;

  function submit() {
    const scored = scoreItem(item, buildOrderingResponse(order));
    setResult(scored);
    onScore(scored);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      <div className="flex flex-col gap-2">
        {order.map((id, position) => {
          const element = elementsById.get(id)!;
          const subResult = result?.subResults[position];
          return (
            <div key={id} className={rowClassName({ submitted, correct: subResult?.correct })}>
              <span className="min-h-6 flex-1 text-sm text-foreground">{element.text}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={submitted || position === 0}
                  aria-label={`Move "${element.text}" up`}
                  onClick={() => setOrder((prev) => moveOrderElement(prev, id, "up"))}
                  className={moveButtonClassName()}
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={submitted || position === order.length - 1}
                  aria-label={`Move "${element.text}" down`}
                  onClick={() => setOrder((prev) => moveOrderElement(prev, id, "down"))}
                  className={moveButtonClassName()}
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
                {submitted &&
                  (subResult?.correct ? (
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

function rowClassName({ submitted, correct }: { submitted: boolean; correct: boolean | undefined }): string {
  const base = "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 transition-colors";
  if (!submitted) return `${base} border-border bg-background`;
  return correct
    ? `${base} border-success-border bg-success-subtle`
    : `${base} border-destructive-border bg-destructive-subtle`;
}

function moveButtonClassName(): string {
  return "flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors cursor-pointer hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40";
}
