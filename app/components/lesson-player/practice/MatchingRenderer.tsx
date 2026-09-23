"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { scoreItem } from "@/lib/items";
import type { ItemScoreResult, MatchingItem } from "@/lib/items";
import { shuffleForItem } from "@/lib/items/shuffle";
import { buildMatchingResponse, clearMatchingPair, setMatchingPair } from "@/lib/lessonPlayer/matchingResponse";
import { MatchingContentView } from "./MatchingContentView";

/**
 * PLAY-003 — `matching` renderer (pairs between a left and right side;
 * lib/items/matching.ts). Tap-to-pair, not drag: tapping a left row expands
 * it to show the right-side options inline below it; tapping one of those
 * sets the pair and collapses the row. See docs/decisions/0030-play003-
 * ordering-matching-renderers.md Decision 2 for why — same touch/scroll
 * reasoning as `ordering`'s Decision 1, applied to pairing instead of
 * reordering.
 *
 * The right side is a REUSABLE pool — chips are never disabled after being
 * paired to a left element — because matching.ts (docs/decisions/0013
 * Decision 2) makes many-to-one legal both authored and answered; a
 * consumable pool would make that case unrepresentable in this renderer even
 * though scoring still accepts it, exactly what 0013's "what would make us
 * revisit" section warns against.
 *
 * State (`pairs`) only ever maps a left id to a right id read off
 * `item.payload.right` — never an id typed or guessed — so `unknown_id` is
 * unreachable, and `pairs` is a Map keyed by left id so `duplicate_id` (two
 * answers for the same left) is unreachable too. Same "unreachable by
 * construction" discipline as PLAY-002's renderers.
 */
export function MatchingRenderer({
  item,
  attemptId,
  onScore,
}: {
  item: MatchingItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
}) {
  const rightOptions = useMemo(() => shuffleForItem(item.payload.right, attemptId, item.id), [item, attemptId]);
  const rightById = useMemo(() => new Map(item.payload.right.map((element) => [element.id, element])), [item]);
  const pairByLeftId = useMemo(() => new Map(item.payload.pairs.map((pair) => [pair.left, pair])), [item]);

  const [pairs, setPairs] = useState<Map<string, string>>(new Map());
  const [expandedLeft, setExpandedLeft] = useState<string | null>(null);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;

  const subResultByPairId = new Map(result?.subResults.map((r) => [r.id, r]));

  function submit() {
    const scored = scoreItem(item, buildMatchingResponse(pairs));
    setResult(scored);
    onScore(scored);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      <div className="flex flex-col gap-2">
        {item.payload.left.map((leftElement) => {
          const pairedRightId = pairs.get(leftElement.id);
          const pairedRight = pairedRightId ? rightById.get(pairedRightId) : undefined;
          const scoredPair = pairByLeftId.get(leftElement.id);
          const subResult = scoredPair ? subResultByPairId.get(scoredPair.id) : undefined;
          const isExpanded = expandedLeft === leftElement.id;

          return (
            <div key={leftElement.id} className={rowClassName({ submitted, correct: subResult?.correct })}>
              <button
                type="button"
                disabled={submitted}
                onClick={() => setExpandedLeft((prev) => (prev === leftElement.id ? null : leftElement.id))}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left cursor-pointer disabled:cursor-not-allowed"
              >
                <MatchingContentView content={leftElement.content} className="flex-1 text-sm text-foreground" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {pairedRight ? <MatchingContentView content={pairedRight.content} inline /> : "Tap to match"}
                </span>
                {submitted &&
                  subResult &&
                  (subResult.correct ? (
                    <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
                  ))}
              </button>
              {!submitted && isExpanded && (
                <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
                  {rightOptions.map((rightElement) => (
                    <button
                      key={rightElement.id}
                      type="button"
                      onClick={() => {
                        setPairs((prev) => setMatchingPair(prev, leftElement.id, rightElement.id));
                        setExpandedLeft(null);
                      }}
                      className={rightChipClassName(pairs.get(leftElement.id) === rightElement.id)}
                    >
                      <MatchingContentView content={rightElement.content} inline />
                    </button>
                  ))}
                  {pairedRight && (
                    <button
                      type="button"
                      onClick={() => {
                        setPairs((prev) => clearMatchingPair(prev, leftElement.id));
                        setExpandedLeft(null);
                      }}
                      className="min-h-11 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors cursor-pointer hover:border-destructive-border"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
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
  const base = "overflow-hidden rounded-lg border transition-colors";
  if (!submitted) return `${base} border-border bg-background`;
  if (correct === undefined) return `${base} border-border bg-background opacity-70`;
  return correct
    ? `${base} border-success-border bg-success-subtle`
    : `${base} border-destructive-border bg-destructive-subtle`;
}

function rightChipClassName(active: boolean): string {
  return `min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
    active
      ? "border-brand bg-brand-subtle text-brand-text"
      : "border-border bg-background text-foreground hover:border-brand/40"
  }`;
}
