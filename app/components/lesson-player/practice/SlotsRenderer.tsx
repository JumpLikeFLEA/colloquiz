"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { scoreItem } from "@/lib/items";
import type { ItemScoreResult, SlotsItem } from "@/lib/items";
import { shuffleForItem } from "@/lib/items/shuffle";
import {
  buildSlotsResponse,
  buildSlotsResponseFromChips,
  clearChip,
  clearGapAnswer,
  placeChip,
  setGapAnswer,
  splitPromptOnGaps,
} from "@/lib/lessonPlayer/slotsResponse";

type SubResultById = Map<string, ItemScoreResult["subResults"][number]>;

/**
 * PLAY-004 — `slots` renderer (cloze / word insertion; lib/items/slots.ts).
 * `payload.input` picks the interaction per item — this component dispatches
 * to `TypedSlots` or `DragSlots`, never re-implements normalisation (that
 * stays in slots.ts's `score`, per this card's own acceptance line).
 *
 * Both sub-renderers interleave `gaps` into `payload.prompt`'s text via
 * `splitPromptOnGaps` (docs/decisions/0031) when the authored prompt carries
 * exactly one literal `"___"` per gap; otherwise they fall back to a
 * non-inline gap list (same "renders something usable even for a malformed
 * item" discipline as PracticeBlockPlaceholder) rather than misplacing a gap
 * against the wrong point in the sentence.
 *
 * `drag` is TAP-TO-PLACE, not a pointer-drag gesture — same touch/scroll
 * reasoning as docs/decisions/0030 Decisions 1-2 (ordering/matching): a
 * hand-rolled native-drag gesture has real touch-scroll conflicts on a 360px
 * screen, and `slotsModule.rendererNeeds.inputs` including `"typed"` shows
 * the type itself treats a non-continuous-gesture input as a first-class
 * alternative. Unlike matching's REUSABLE right-side pool (0013 many-to-one),
 * a slots chip is CONSUMED once placed: each gap is authored with its own
 * primary word (`acceptedAnswers[0]`) and there are exactly as many chips as
 * gaps, a 1:1 assignment, not a many-to-one one.
 */
export function SlotsRenderer({
  item,
  attemptId,
  onScore,
}: {
  item: SlotsItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
}) {
  const segments = useMemo(
    () => splitPromptOnGaps(item.payload.prompt, item.payload.gaps.length),
    [item.payload.prompt, item.payload.gaps.length],
  );

  return item.payload.input === "drag" ? (
    <DragSlots item={item} attemptId={attemptId} onScore={onScore} segments={segments} />
  ) : (
    <TypedSlots item={item} onScore={onScore} segments={segments} />
  );
}

/** Renders `prompt` with each gap's control interleaved at its `"___"`
 * position (`segments` from `splitPromptOnGaps`), or falls back to the full
 * prompt text followed by a labeled list of gaps when the split failed. */
function GapLayout({
  prompt,
  segments,
  gapCount,
  renderGap,
}: {
  prompt: string;
  segments: string[] | null;
  gapCount: number;
  renderGap: (index: number) => ReactNode;
}) {
  if (segments) {
    return (
      <p className="mb-3 text-sm leading-8 text-foreground">
        {segments.map((segment, index) => (
          <span key={index}>
            {segment}
            {index < gapCount && renderGap(index)}
          </span>
        ))}
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm font-medium text-foreground">{prompt}</p>
      <div className="mb-3 flex flex-col gap-2">
        {Array.from({ length: gapCount }, (_, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Gap {index + 1}</span>
            {renderGap(index)}
          </div>
        ))}
      </div>
    </>
  );
}

function submitButtonClassName(): string {
  return "mt-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover cursor-pointer transition-colors";
}

function gapControlClassName({
  submitted,
  correct,
}: {
  submitted: boolean;
  correct: boolean | undefined;
}): string {
  const base =
    "mx-1 inline-flex min-h-11 min-w-20 items-center justify-center rounded-md border px-2 py-1 text-sm transition-colors align-middle";
  if (!submitted) {
    return `${base} border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`;
  }
  return correct
    ? `${base} border-success-border bg-success-subtle text-success`
    : `${base} border-destructive-border bg-destructive-subtle text-destructive-text`;
}

/**
 * `input: 'typed'` — a real `<input>` inline at each gap. State only ever
 * holds gap ids read off `item.payload.gaps` (via `setGapAnswer`), so
 * `readResponse`'s `unknown_id` is unreachable from here by construction.
 */
function TypedSlots({
  item,
  onScore,
  segments,
}: {
  item: SlotsItem;
  onScore: (result: ItemScoreResult) => void;
  segments: string[] | null;
}) {
  const { gaps, prompt } = item.payload;
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;
  const subResultById: SubResultById = new Map(result?.subResults.map((r) => [r.id, r]));

  function submit() {
    const scored = scoreItem(item, buildSlotsResponse(answers));
    setResult(scored);
    onScore(scored);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <GapLayout
        prompt={prompt}
        segments={segments}
        gapCount={gaps.length}
        renderGap={(index) => {
          const gap = gaps[index];
          const subResult = subResultById.get(gap.id);
          return (
            <span className="inline-flex items-center align-middle">
              <input
                type="text"
                aria-label={`Gap ${index + 1}`}
                disabled={submitted}
                value={answers.get(gap.id) ?? ""}
                onChange={(e) =>
                  setAnswers((prev) =>
                    e.target.value === "" ? clearGapAnswer(prev, gap.id) : setGapAnswer(prev, gap.id, e.target.value),
                  )
                }
                className={gapControlClassName({ submitted, correct: subResult?.correct })}
              />
              {submitted &&
                (subResult?.correct ? (
                  <Check className="ml-1 size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <X className="ml-1 size-4 shrink-0 text-destructive-text" aria-hidden="true" />
                ))}
            </span>
          );
        }}
      />
      {!submitted && (
        <button type="button" onClick={submit} className={submitButtonClassName()}>
          Submit
        </button>
      )}
    </div>
  );
}

/**
 * `input: 'drag'` — tap-to-place. Tapping a gap makes it "active" and shows
 * the pool of not-yet-placed chips below the prompt; tapping a chip places
 * it at the active gap and consumes it from the pool. A single shared pool
 * panel (not one per gap, unlike MatchingRenderer's per-row expand) because
 * gaps sit inline in running text here, not as separate full-width rows.
 */
function DragSlots({
  item,
  attemptId,
  onScore,
  segments,
}: {
  item: SlotsItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
  segments: string[] | null;
}) {
  const { gaps, prompt } = item.payload;
  const chips = useMemo(() => gaps.map((gap) => ({ id: gap.id, text: gap.acceptedAnswers[0] })), [gaps]);
  const chipTextById = useMemo(() => new Map(chips.map((chip) => [chip.id, chip.text])), [chips]);
  const shuffledChips = useMemo(() => shuffleForItem(chips, attemptId, item.id), [chips, attemptId, item.id]);

  const [placedChip, setPlacedChip] = useState<Map<string, string>>(new Map());
  const [activeGap, setActiveGap] = useState<string | null>(null);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;
  const subResultById: SubResultById = new Map(result?.subResults.map((r) => [r.id, r]));
  const usedChipIds = new Set(placedChip.values());

  function submit() {
    const scored = scoreItem(item, buildSlotsResponseFromChips(placedChip, chipTextById));
    setResult(scored);
    onScore(scored);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <GapLayout
        prompt={prompt}
        segments={segments}
        gapCount={gaps.length}
        renderGap={(index) => {
          const gap = gaps[index];
          const chipId = placedChip.get(gap.id);
          const subResult = subResultById.get(gap.id);
          return (
            <button
              type="button"
              disabled={submitted}
              aria-label={`Gap ${index + 1}${chipId ? `, filled with "${chipTextById.get(chipId)}"` : ", empty"}`}
              onClick={() => setActiveGap((prev) => (prev === gap.id ? null : gap.id))}
              className={`${gapControlClassName({ submitted, correct: subResult?.correct })} cursor-pointer disabled:cursor-not-allowed ${
                !submitted && activeGap === gap.id ? "border-brand bg-brand-subtle" : ""
              }`}
            >
              {chipId ? chipTextById.get(chipId) : "___"}
              {submitted &&
                (subResult?.correct ? (
                  <Check className="ml-1 size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <X className="ml-1 size-4 shrink-0 text-destructive-text" aria-hidden="true" />
                ))}
            </button>
          );
        }}
      />
      {!submitted && activeGap && (
        <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-border bg-background p-2">
          {shuffledChips
            .filter((chip) => !usedChipIds.has(chip.id))
            .map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setPlacedChip((prev) => placeChip(prev, activeGap, chip.id));
                  setActiveGap(null);
                }}
                className="min-h-11 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors cursor-pointer hover:border-brand/40"
              >
                {chip.text}
              </button>
            ))}
          {placedChip.has(activeGap) && (
            <button
              type="button"
              onClick={() => {
                setPlacedChip((prev) => clearChip(prev, activeGap));
                setActiveGap(null);
              }}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors cursor-pointer hover:border-destructive-border"
            >
              Clear
            </button>
          )}
        </div>
      )}
      {!submitted && (
        <button type="button" onClick={submit} className={submitButtonClassName()}>
          Submit
        </button>
      )}
    </div>
  );
}
