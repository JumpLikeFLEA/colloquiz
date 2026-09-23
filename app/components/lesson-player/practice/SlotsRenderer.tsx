"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, X } from "lucide-react";
import { scoreItem } from "@/lib/items";
import type { ItemScoreResult, SlotsItem } from "@/lib/items";
import { shuffleForItem } from "@/lib/items/shuffle";
import {
  buildSlotsResponse,
  buildSlotsResponseFromChips,
  clearGapAnswer,
  firstEmptyGapId,
  gapInputWidthCh,
  moveChipToBank,
  moveChipToGap,
  setGapAnswer,
  splitPromptOnGaps,
} from "@/lib/lessonPlayer/slotsResponse";

type SubResultById = Map<string, ItemScoreResult["subResults"][number]>;

/**
 * PLAY-004/0032 — `slots` renderer (cloze / word insertion; lib/items/slots.ts).
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
 * `drag` is now an ACTUAL pointer/touch drag (`@dnd-kit/core`), reversing
 * 0031's "tap-to-place only" call the same way docs/decisions/0032 reverses
 * 0030 Decision 1 for `ordering` — see 0032 for why that reversal is safe.
 * The full tap flow (tap a gap, then a chip; tap a chip with no gap selected
 * to fill the first empty one) is KEPT, not replaced — it is still the
 * keyboard/no-pointer-gesture path, and both flows go through the identical
 * `moveChipToGap`/`moveChipToBank` pair in lib/lessonPlayer/slotsResponse.ts,
 * so no placement logic is duplicated between them. Unlike matching's
 * REUSABLE right-side pool (0013 many-to-one), a slots chip is CONSUMED once
 * placed: each gap is authored with its own primary word
 * (`acceptedAnswers[0]`) and there are exactly as many chips as gaps, a 1:1
 * assignment, not a many-to-one one — unchanged by this card.
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
 * prompt text followed by a labeled list of gaps when the split failed.
 * `lineClassName` lets a caller widen the line-height around taller/shorter
 * gap controls (docs/decisions/0032 — `TypedSlots` needs more room than
 * `DragSlots`' default so wrapped lines don't collide) without every caller
 * re-declaring the shared text styling. */
function GapLayout({
  prompt,
  segments,
  gapCount,
  renderGap,
  lineClassName = "mb-3 text-sm leading-8 text-foreground",
}: {
  prompt: string;
  segments: string[] | null;
  gapCount: number;
  renderGap: (index: number) => ReactNode;
  lineClassName?: string;
}) {
  if (segments) {
    return (
      <p className={lineClassName}>
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

/** Compact inline underline style — docs/decisions/0032's typed-gap sizing
 * rule. `py-2.5 -my-2.5` extends the actual (padding-box) touch/click target
 * a few pixels beyond the input's visible underline without the padding
 * enlarging the surrounding line's rendered height: the matching negative
 * margin pulls the box's layout footprint back to where it would sit
 * unpadded, while the padding itself still counts for hit-testing. This is
 * "the touch target can extend via padding/negative margin rather than
 * visual height" — the input LOOKS compact; it is not smaller to tap. */
function typedGapInputClassName({ submitted, correct }: { submitted: boolean; correct: boolean | undefined }): string {
  const base =
    "inline-block max-w-full rounded-sm border-0 border-b-2 bg-transparent px-1 py-2.5 -my-2.5 text-center text-sm leading-none align-baseline transition-colors focus:outline-none disabled:cursor-not-allowed";
  if (!submitted) {
    return `${base} border-border text-foreground focus:border-brand`;
  }
  return correct
    ? `${base} border-success-border bg-success-subtle/60 text-success`
    : `${base} border-destructive-border bg-destructive-subtle/60 text-destructive-text`;
}

/**
 * `input: 'typed'` — a real `<input>` inline at each gap, sized to its own
 * longest accepted answer (`gapInputWidthCh`) so the sentence reads as one
 * flowing line instead of N identical wide boxes forcing ragged wraps. State
 * only ever holds gap ids read off `item.payload.gaps` (via `setGapAnswer`),
 * so `readResponse`'s `unknown_id` is unreachable from here by construction.
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
        lineClassName="mb-3 text-sm leading-[44px] text-foreground"
        renderGap={(index) => {
          const gap = gaps[index];
          const subResult = subResultById.get(gap.id);
          return (
            <span className="mx-0.5 inline-flex items-baseline align-baseline">
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
                style={{ width: `${gapInputWidthCh(gap.acceptedAnswers)}ch`, maxWidth: "100%" }}
                className={typedGapInputClassName({ submitted, correct: subResult?.correct })}
              />
              {submitted &&
                (subResult?.correct ? (
                  <Check className="ml-0.5 size-3.5 shrink-0 self-center text-success" aria-hidden="true" />
                ) : (
                  <X className="ml-0.5 size-3.5 shrink-0 self-center text-destructive-text" aria-hidden="true" />
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

/** A droppable target that isn't any authored gap — where a dragged chip
 * returns to the bank. Authored gap ids come from `SlotGapSchema` (min-1
 * strings an author chooses), so this sentinel only needs to not collide
 * with one in practice; it is never compared against authored content. */
const BANK_DROPPABLE_ID = "__slots_bank__";

/**
 * `input: 'drag'` — the option bank is ALWAYS visible below the prompt (not
 * gated behind selecting a gap), and every chip and every gap is a
 * `@dnd-kit/core` draggable/droppable. Tap flow is kept alongside it: tap a
 * gap to select it (highlighted), then tap a bank chip to fill it; or tap a
 * bank chip with no gap selected to fill the first empty gap
 * (`firstEmptyGapId`). Both flows, and every drag drop (chip-to-gap,
 * chip-to-bank, gap-to-gap), resolve through `moveChipToGap`/
 * `moveChipToBank` — this component only ever decides WHICH chip/gap ids to
 * pass in, never how the placement map changes.
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
  const gapIds = useMemo(() => gaps.map((gap) => gap.id), [gaps]);
  const chips = useMemo(() => gaps.map((gap) => ({ id: gap.id, text: gap.acceptedAnswers[0] })), [gaps]);
  const chipTextById = useMemo(() => new Map(chips.map((chip) => [chip.id, chip.text])), [chips]);
  const shuffledChips = useMemo(() => shuffleForItem(chips, attemptId, item.id), [chips, attemptId, item.id]);

  const [placedChip, setPlacedChip] = useState<Map<string, string>>(new Map());
  const [activeGap, setActiveGap] = useState<string | null>(null);
  const [draggingChipId, setDraggingChipId] = useState<string | null>(null);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;
  const subResultById: SubResultById = new Map(result?.subResults.map((r) => [r.id, r]));
  const usedChipIds = new Set(placedChip.values());

  // Same sensor set as OrderingRenderer (docs/decisions/0032): a small
  // pointer-distance constraint and a ~200ms/~5px touch activation constraint
  // so a plain tap or a vertical page swipe never gets mistaken for a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function submit() {
    const scored = scoreItem(item, buildSlotsResponseFromChips(placedChip, chipTextById));
    setResult(scored);
    onScore(scored);
  }

  function fillFromChip(chipId: string) {
    const targetGap = activeGap ?? firstEmptyGapId(gapIds, placedChip);
    if (!targetGap) return; // every gap already holds a chip -- nothing to do
    setPlacedChip((prev) => moveChipToGap(prev, chipId, targetGap));
    setActiveGap(null);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingChipId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingChipId(null);
    const { active, over } = event;
    if (!over) return;
    const chipId = active.id as string;
    if (over.id === BANK_DROPPABLE_ID) {
      setPlacedChip((prev) => moveChipToBank(prev, chipId));
    } else {
      setPlacedChip((prev) => moveChipToGap(prev, chipId, over.id as string));
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <DndContext
        id={`slots-${item.id}`}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingChipId(null)}
      >
        <GapLayout
          prompt={prompt}
          segments={segments}
          gapCount={gaps.length}
          renderGap={(index) => {
            const gap = gaps[index];
            const chipId = placedChip.get(gap.id);
            const subResult = subResultById.get(gap.id);
            return (
              <GapDropTarget
                gapId={gap.id}
                index={index}
                chipId={chipId}
                chipText={chipId ? chipTextById.get(chipId) : undefined}
                submitted={submitted}
                correct={subResult?.correct}
                active={activeGap === gap.id}
                onTapToggle={() => setActiveGap((prev) => (prev === gap.id ? null : gap.id))}
              />
            );
          }}
        />
        <ChipBank
          chips={shuffledChips}
          usedChipIds={usedChipIds}
          submitted={submitted}
          onTapChip={fillFromChip}
        />
        {!submitted && activeGap && placedChip.has(activeGap) && (
          <button
            type="button"
            onClick={() => {
              setPlacedChip((prev) => moveChipToBank(prev, placedChip.get(activeGap)!));
              setActiveGap(null);
            }}
            className="mb-3 min-h-11 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors cursor-pointer hover:border-destructive-border"
          >
            Clear
          </button>
        )}
        <DragOverlay>
          {draggingChipId ? <ChipPreview text={chipTextById.get(draggingChipId) ?? ""} /> : null}
        </DragOverlay>
      </DndContext>
      {!submitted && (
        <button type="button" onClick={submit} className={submitButtonClassName()}>
          Submit
        </button>
      )}
    </div>
  );
}

/** A gap in the sentence: a droppable zone always, and (when filled) also
 * the draggable chip sitting in it — dragging that chip back out reads as
 * "move", handled by the same `onDragEnd` as every other drop. */
function GapDropTarget({
  gapId,
  index,
  chipId,
  chipText,
  submitted,
  correct,
  active,
  onTapToggle,
}: {
  gapId: string;
  index: number;
  chipId: string | undefined;
  chipText: string | undefined;
  submitted: boolean;
  correct: boolean | undefined;
  active: boolean;
  onTapToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: gapId, disabled: submitted });

  return (
    <span
      ref={setNodeRef}
      className={`${gapControlClassName({ submitted, correct })} ${
        !submitted && isOver ? "ring-2 ring-brand" : ""
      } ${!submitted && active ? "border-brand bg-brand-subtle" : ""}`}
    >
      {chipId && chipText ? (
        <DraggableChip id={chipId} text={chipText} submitted={submitted} onTap={onTapToggle} />
      ) : (
        <button
          type="button"
          disabled={submitted}
          aria-label={`Gap ${index + 1}, empty`}
          onClick={onTapToggle}
          className="flex h-full w-full cursor-pointer items-center justify-center disabled:cursor-not-allowed"
        >
          ___
        </button>
      )}
      {submitted &&
        (correct ? (
          <Check className="ml-1 size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <X className="ml-1 size-4 shrink-0 text-destructive-text" aria-hidden="true" />
        ))}
    </span>
  );
}

/** A chip already placed at a gap — draggable (to move it), and tappable
 * (to select its gap, same as tapping an empty gap does). */
function DraggableChip({
  id,
  text,
  submitted,
  onTap,
}: {
  id: string;
  text: string;
  submitted: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: submitted });
  const style = { transform: CSS.Translate.toString(transform), touchAction: "none" };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      disabled={submitted}
      aria-label={`"${text}" in this gap — tap to select, or drag to move`}
      onClick={onTap}
      className={`flex h-full w-full cursor-grab items-center justify-center disabled:cursor-not-allowed ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {text}
    </button>
  );
}

/** The always-visible word bank. Only unplaced chips render here — a placed
 * chip renders once, inline at its gap (`DraggableChip`), never duplicated. */
function ChipBank({
  chips,
  usedChipIds,
  submitted,
  onTapChip,
}: {
  chips: Array<{ id: string; text: string }>;
  usedChipIds: Set<string>;
  submitted: boolean;
  onTapChip: (chipId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_DROPPABLE_ID, disabled: submitted });
  const available = chips.filter((chip) => !usedChipIds.has(chip.id));

  return (
    <div
      ref={setNodeRef}
      className={`mb-3 flex min-h-14 flex-wrap items-center gap-2 rounded-lg border p-2 transition-colors ${
        !submitted && isOver ? "border-brand bg-brand-subtle/30" : "border-border bg-background"
      }`}
    >
      {available.length === 0 && submitted === false && (
        <span className="px-1 text-xs text-muted-foreground">All words placed</span>
      )}
      {available.map((chip) => (
        <BankChip key={chip.id} id={chip.id} text={chip.text} submitted={submitted} onTap={() => onTapChip(chip.id)} />
      ))}
    </div>
  );
}

function BankChip({
  id,
  text,
  submitted,
  onTap,
}: {
  id: string;
  text: string;
  submitted: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: submitted });
  const style = { transform: CSS.Translate.toString(transform), touchAction: "none" };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      disabled={submitted}
      onClick={onTap}
      className={`min-h-11 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors cursor-grab hover:border-brand/40 disabled:cursor-not-allowed ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {text}
    </button>
  );
}

/** The floating clone `DragOverlay` renders at the pointer while a chip is
 * lifted, from either the bank or a gap. */
function ChipPreview({ text }: { text: string }) {
  return (
    <div className="min-h-11 rounded-md border border-brand bg-card px-3 py-1.5 text-sm text-foreground shadow-lg">
      {text}
    </div>
  );
}
