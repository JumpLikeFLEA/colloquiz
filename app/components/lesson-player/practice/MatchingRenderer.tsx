"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, X } from "lucide-react";
import { resolveExplanations, scoreItem } from "@/lib/items";
import type { ItemScoreResult, MatchingItem } from "@/lib/items";
import type { MatchingContent, MatchingElement } from "@/lib/items/matching";
import { shuffleForItem } from "@/lib/items/shuffle";
import {
  buildMatchingResponse,
  clearMatchingPair,
  firstEmptyLeftId,
  moveMatchingPair,
  setMatchingPair,
} from "@/lib/lessonPlayer/matchingResponse";
import { ExplanationDisclosure } from "./ExplanationDisclosure";
import { MatchingContentView } from "./MatchingContentView";
import { useLessonPlayerSensors } from "./useLessonPlayerSensors";

/**
 * PLAY-003/0039 — `matching` renderer (pairs between a left and right side;
 * lib/items/matching.ts). Reworked from the original expand-and-choose
 * layout (docs/decisions/0030 Decision 2) to row slots + an always-visible
 * shared bank, the same "no expand/collapse, bank is a permanent droppable
 * region" shape 0032 gave `DragSlots`. See docs/decisions/0039 for why
 * (layout shift, hidden options) and for what stayed duplicated vs. shared
 * with `DragSlots` rather than extracted into one component.
 *
 * The right side is a REUSABLE pool — a bank chip is never removed or
 * disabled after being placed — because matching.ts (docs/decisions/0013
 * Decision 2) makes many-to-one legal both authored and answered. This is
 * the one structural difference from `DragSlots`' chip pool (consumed 1:1):
 * here a chip can be the drag SOURCE from the bank *and* simultaneously sit,
 * dragged from, in one or more filled rows — two different dnd-kit draggable
 * ids per right element (`bank:<rightId>` in the bank, `slot:<leftId>` for
 * the copy placed at a row), never one node reused in two places.
 *
 * State (`pairs`) only ever maps a left id to a right id read off
 * `item.payload.right` — never an id typed or guessed — so `unknown_id` is
 * unreachable, and `pairs` is a Map keyed by left id so `duplicate_id` (two
 * answers for the same left) is unreachable too. Same "unreachable by
 * construction" discipline as PLAY-002's renderers.
 *
 * PLAY-008 — left rows are visibly numbered 1, 2, 3 … in display order. Safe
 * because, like `selection_grid`, the left side is never shuffled: only
 * `rightOptions` goes through `shuffleForItem` above — `item.payload.left`
 * renders directly in authored order. Each wrong pair also gets a
 * collapsed-by-default "Why?" (`ExplanationDisclosure`) beneath its row.
 */

const BANK_DROPPABLE_ID = "__matching_bank__";

export function MatchingRenderer({
  item,
  attemptId,
  onScore,
}: {
  item: MatchingItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
}) {
  const leftIds = useMemo(() => item.payload.left.map((element) => element.id), [item]);
  const rightOptions = useMemo(() => shuffleForItem(item.payload.right, attemptId, item.id), [item, attemptId]);
  const rightById = useMemo(() => new Map(item.payload.right.map((element) => [element.id, element])), [item]);
  const pairByLeftId = useMemo(() => new Map(item.payload.pairs.map((pair) => [pair.left, pair])), [item]);

  const [pairs, setPairs] = useState<Map<string, string>>(new Map());
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;

  const subResultByPairId = new Map(result?.subResults.map((r) => [r.id, r]));
  const explanationByPairId = new Map(
    result ? resolveExplanations(item, result).map((e) => [e.subResultId, e.explanation]) : [],
  );
  const usedCountByRightId = new Map<string, number>();
  for (const rightId of pairs.values()) {
    usedCountByRightId.set(rightId, (usedCountByRightId.get(rightId) ?? 0) + 1);
  }

  // Shared sensor config (docs/decisions/0032, extracted to a hook by 0040)
  // — see useLessonPlayerSensors for what each constraint does and why.
  const sensors = useLessonPlayerSensors();

  function submit() {
    const scored = scoreItem(item, buildMatchingResponse(pairs));
    setResult(scored);
    onScore(scored);
  }

  function fillFromChip(rightId: string) {
    const target = activeLeft ?? firstEmptyLeftId(leftIds, pairs);
    if (!target) return; // every slot already holds an answer -- nothing to do
    setPairs((prev) => setMatchingPair(prev, target, rightId));
    setActiveLeft(null);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith("bank:")) {
      const rightId = activeId.slice("bank:".length);
      if (overId === BANK_DROPPABLE_ID) return; // dropped back where it started
      setPairs((prev) => setMatchingPair(prev, overId, rightId));
      return;
    }

    if (activeId.startsWith("slot:")) {
      const fromLeftId = activeId.slice("slot:".length);
      if (overId === BANK_DROPPABLE_ID) {
        setPairs((prev) => clearMatchingPair(prev, fromLeftId));
      } else {
        setPairs((prev) => moveMatchingPair(prev, fromLeftId, overId));
      }
    }
  }

  const draggingContent = draggingId
    ? draggingId.startsWith("bank:")
      ? rightById.get(draggingId.slice("bank:".length))?.content
      : draggingId.startsWith("slot:")
        ? rightById.get(pairs.get(draggingId.slice("slot:".length)) ?? "")?.content
        : undefined
    : undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      <DndContext
        id={`matching-${attemptId}:${item.id}`}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="flex flex-col gap-2">
          {item.payload.left.map((leftElement, index) => {
            const pairedRightId = pairs.get(leftElement.id);
            const pairedRight = pairedRightId ? rightById.get(pairedRightId) : undefined;
            const scoredPair = pairByLeftId.get(leftElement.id);
            const subResult = scoredPair ? subResultByPairId.get(scoredPair.id) : undefined;
            const explanation =
              subResult && !subResult.correct ? explanationByPairId.get(subResult.id) : undefined;

            return (
              <div
                key={leftElement.id}
                className={`flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors ${rowBorderClassName({
                  submitted,
                  correct: subResult?.correct,
                })}`}
              >
                <div className="flex min-h-11 items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">{index + 1}.</span>
                  <MatchingContentView content={leftElement.content} className="min-w-0 flex-1 text-sm text-foreground" />
                  {!pairedRightId && (
                    <SlotTarget
                      leftId={leftElement.id}
                      pairedRightId={pairedRightId}
                      pairedContent={pairedRight?.content}
                      submitted={submitted}
                      active={activeLeft === leftElement.id}
                      onTapToggle={() => setActiveLeft((prev) => (prev === leftElement.id ? null : leftElement.id))}
                      onClear={() => {
                        setPairs((prev) => clearMatchingPair(prev, leftElement.id));
                        setActiveLeft(null);
                      }}
                    />
                  )}
                  {submitted &&
                    subResult &&
                    (subResult.correct ? (
                      <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
                    ))}
                </div>
                {pairedRightId && (
                  <SlotTarget
                    leftId={leftElement.id}
                    pairedRightId={pairedRightId}
                    pairedContent={pairedRight?.content}
                    submitted={submitted}
                    active={activeLeft === leftElement.id}
                    onTapToggle={() => setActiveLeft((prev) => (prev === leftElement.id ? null : leftElement.id))}
                    onClear={() => {
                      setPairs((prev) => clearMatchingPair(prev, leftElement.id));
                      setActiveLeft(null);
                    }}
                  />
                )}
                {explanation && <ExplanationDisclosure explanation={explanation} />}
              </div>
            );
          })}
        </div>
        <Bank
          options={rightOptions}
          usedCountByRightId={usedCountByRightId}
          submitted={submitted}
          onTapChip={fillFromChip}
        />
        <DragOverlay>
          {draggingContent ? <ChipPreview content={draggingContent} /> : null}
        </DragOverlay>
      </DndContext>
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

/** A row's answer slot: a droppable box, either an empty placeholder button
 * (tap to select, or a drag target), rendered inline (`w-28`) next to the
 * left content, or the placed answer (itself draggable as `slot:<leftId>`)
 * plus a ✕ that clears it directly — clearing never requires selecting the
 * slot first — rendered full-width on its own line below the left content.
 * The two states are two different call sites in the row JSX, not one box
 * that resizes: `w-28` was found to still wrap a long placed answer onto
 * multiple lines (docs/decisions/0055, correcting 0039 Decision 1's "row
 * height never moves" claim, which held only for the empty state — the box
 * was always `min-h-11`, not `h-11`). Every placed answer moves to the
 * full-width line, not only long ones — a length threshold would need
 * recalibrating as new courses are authored; this doesn't. */
function SlotTarget({
  leftId,
  pairedRightId,
  pairedContent,
  submitted,
  active,
  onTapToggle,
  onClear,
}: {
  leftId: string;
  pairedRightId: string | undefined;
  pairedContent: MatchingContent | undefined;
  submitted: boolean;
  active: boolean;
  onTapToggle: () => void;
  onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: leftId, disabled: submitted });
  const filled = Boolean(pairedRightId && pairedContent);

  return (
    <span
      ref={setNodeRef}
      className={`flex min-h-11 items-center justify-between gap-1 rounded-md border px-2 py-1 text-sm transition-colors ${
        filled ? "w-full" : "w-28 shrink-0"
      } ${!submitted && isOver ? "ring-2 ring-brand" : ""} ${!submitted && active ? "border-brand bg-brand-subtle" : "border-border bg-background"}`}
    >
      {pairedRightId && pairedContent ? (
        <>
          <DraggableSlotChip leftId={leftId} content={pairedContent} submitted={submitted} onTap={onTapToggle} />
          {!submitted && (
            <button
              type="button"
              aria-label="Clear this answer"
              onClick={onClear}
              className="shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:text-destructive-text"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          disabled={submitted}
          aria-label="Empty answer slot — tap to select"
          onClick={onTapToggle}
          className="flex h-full w-full cursor-pointer items-center justify-center text-xs text-muted-foreground disabled:cursor-not-allowed"
        >
          Tap to match
        </button>
      )}
    </span>
  );
}

/** The placed answer, shown inline in its row — draggable back to the bank
 * or onto another slot, and tappable (selects this slot, same as tapping the
 * empty-slot button does). */
function DraggableSlotChip({
  leftId,
  content,
  submitted,
  onTap,
}: {
  leftId: string;
  content: MatchingContent;
  submitted: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `slot:${leftId}`,
    disabled: submitted,
  });
  const style = { transform: CSS.Translate.toString(transform), touchAction: "none" };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      disabled={submitted}
      onClick={onTap}
      className={`min-w-0 flex-1 cursor-grab overflow-hidden text-left disabled:cursor-not-allowed ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <MatchingContentView content={content} inline className="pointer-events-none" />
    </button>
  );
}

/** The always-visible, NON-consumable option bank: every right-side element
 * renders here always, whether or not it is currently placed at a slot
 * (0013 Decision 2's many-to-one case — a chip stays available after being
 * used). A chip placed at least once shows a small used-count badge; it is
 * never hidden or disabled, unlike `DragSlots`' bank, which filters a placed
 * chip out entirely. */
function Bank({
  options,
  usedCountByRightId,
  submitted,
  onTapChip,
}: {
  options: MatchingElement[];
  usedCountByRightId: Map<string, number>;
  submitted: boolean;
  onTapChip: (rightId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_DROPPABLE_ID, disabled: submitted });

  return (
    <div
      ref={setNodeRef}
      className={`sticky bottom-0 mt-3 flex min-h-14 flex-wrap items-center gap-2 border-t bg-card p-2 transition-colors ${
        !submitted && isOver ? "border-brand bg-brand-subtle/30" : "border-border"
      }`}
    >
      {options.map((option) => (
        <BankChip
          key={option.id}
          rightId={option.id}
          content={option.content}
          usedCount={usedCountByRightId.get(option.id) ?? 0}
          submitted={submitted}
          onTap={() => onTapChip(option.id)}
        />
      ))}
    </div>
  );
}

function BankChip({
  rightId,
  content,
  usedCount,
  submitted,
  onTap,
}: {
  rightId: string;
  content: MatchingContent;
  usedCount: number;
  submitted: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bank:${rightId}`,
    disabled: submitted,
  });
  const style = { transform: CSS.Translate.toString(transform), touchAction: "none" };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      disabled={submitted}
      onClick={onTap}
      className={`flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors cursor-grab hover:border-brand/40 disabled:cursor-not-allowed ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <MatchingContentView content={content} inline />
      {usedCount > 0 && (
        <span
          aria-label={`used ${usedCount} time${usedCount === 1 ? "" : "s"}`}
          className="rounded-full bg-brand-subtle px-1.5 text-xs text-brand-text"
        >
          {usedCount}
        </span>
      )}
    </button>
  );
}

/** The floating clone `DragOverlay` renders at the pointer while a chip
 * (from either the bank or a filled slot) is lifted. */
function ChipPreview({ content }: { content: MatchingContent }) {
  return (
    <div className="min-h-11 rounded-md border border-brand bg-card px-3 py-1.5 text-sm text-foreground shadow-lg">
      <MatchingContentView content={content} inline />
    </div>
  );
}

/** Border/background only — the row's outer container also holds the
 * (optional) explanation disclosure beneath the flex row proper, so the
 * `flex items-center` layout classes live on that inner row instead. */
function rowBorderClassName({ submitted, correct }: { submitted: boolean; correct: boolean | undefined }): string {
  if (!submitted) return "border-border bg-background";
  if (correct === undefined) return "border-border bg-background opacity-70";
  return correct ? "border-success-border bg-success-subtle" : "border-destructive-border bg-destructive-subtle";
}
