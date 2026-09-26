"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, X } from "lucide-react";
import { resolveExplanations, scoreItem } from "@/lib/items";
import type { ItemScoreResult, OrderingItem } from "@/lib/items";
import { shuffleOrderingIndices } from "@/lib/items/shuffle";
import {
  buildOrderingResponse,
  initialOrder,
  moveOrderElementToIndex,
} from "@/lib/lessonPlayer/orderingResponse";
import { ExplanationDisclosure } from "./ExplanationDisclosure";
import { useLessonPlayerSensors } from "./useLessonPlayerSensors";

/**
 * PLAY-003/0032/0054 — `ordering` renderer (permutation of N elements;
 * lib/items/ordering.ts). The grip handle is the ONLY pointer/touch control
 * (docs/decisions/0054, PLAY-009) — the ▲/▼ move buttons 0030 designed and
 * 0032 kept as a fallback are gone, superseded now that drag is verified via
 * the same `useLessonPlayerSensors` KeyboardSensor path every other
 * drag-capable renderer already relies on for its own accessible fallback.
 * Each row shows its live position number (1, 2, 3 …) instead, so a learner
 * without a pointer/touch drag still sees the effect of a keyboard reorder.
 *
 * State (`order`) only ever holds ids read off `item.payload.elements` —
 * `moveOrderElementToIndex` only ever moves an id already present in `order`,
 * so a duplicate/missing id can never reach `scoreItem`; the
 * `ItemResponseError` channel is unreachable by construction, same
 * discipline as PLAY-002's renderers.
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const submitted = result !== null;
  const explanationByElementId = new Map(
    result ? resolveExplanations(item, result).map((e) => [e.subResultId, e.explanation]) : [],
  );

  // Shared sensor config (docs/decisions/0032, extracted to a hook by 0040)
  // — see useLessonPlayerSensors for what each constraint does and why.
  // `sortableKeyboardCoordinates` is passed because this renderer operates
  // over a `SortableContext`; the other drag-capable renderers don't.
  const sensors = useLessonPlayerSensors(sortableKeyboardCoordinates);

  function submit() {
    const scored = scoreItem(item, buildOrderingResponse(order));
    setResult(scored);
    onScore(scored);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const targetIndex = order.indexOf(over.id as string);
    if (targetIndex === -1) return;
    setOrder((prev) => moveOrderElementToIndex(prev, active.id as string, targetIndex));
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-1 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      {!submitted && (
        <p className="mb-3 text-xs text-muted-foreground">Hold and drag the handle to reorder.</p>
      )}
      <DndContext
        id={`ordering-${attemptId}:${item.id}`}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          id={`ordering-${attemptId}:${item.id}`}
          items={order}
          strategy={verticalListSortingStrategy}
          disabled={submitted}
        >
          <div className="flex flex-col gap-2">
            {order.map((id, position) => {
              const element = elementsById.get(id)!;
              const subResult = result?.subResults[position];
              const explanation =
                subResult && !subResult.correct ? explanationByElementId.get(subResult.id) : undefined;
              return (
                <OrderingRow
                  key={id}
                  id={id}
                  text={element.text}
                  position={position}
                  submitted={submitted}
                  correct={subResult?.correct}
                  explanation={explanation}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId ? <OrderingRowPreview text={elementsById.get(activeId)!.text} /> : null}
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

function OrderingRow({
  id,
  text,
  position,
  submitted,
  correct,
  explanation,
}: {
  id: string;
  text: string;
  position: number;
  submitted: boolean;
  correct: boolean | undefined;
  explanation: string | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: submitted,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={rowClassName({ submitted, correct, isDragging })}>
      <div className="flex min-h-11 items-center gap-2">
        <span className="shrink-0 text-sm text-muted-foreground">{position + 1}.</span>
        <button
          type="button"
          disabled={submitted}
          aria-label={`Drag to reorder "${text}"`}
          className={dragHandleClassName()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <span className="min-h-6 flex-1 text-sm text-foreground">{text}</span>
        {submitted &&
          (correct ? (
            <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
          ))}
      </div>
      {explanation && <ExplanationDisclosure explanation={explanation} />}
    </div>
  );
}

/** The floating clone `DragOverlay` renders at the pointer while a row is
 * lifted — the "visible lifted state" this card's acceptance line asks for.
 * The row still in the list gets its own (dimmed) placeholder treatment via
 * `rowClassName`'s `isDragging` branch. */
function OrderingRowPreview({ text }: { text: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-brand bg-card px-3 py-2 shadow-lg">
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-sm text-foreground">{text}</span>
    </div>
  );
}

function rowClassName({
  submitted,
  correct,
  isDragging,
}: {
  submitted: boolean;
  correct: boolean | undefined;
  isDragging: boolean;
}): string {
  const base = "flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors";
  if (isDragging) return `${base} border-brand/40 bg-brand-subtle/40 opacity-50`;
  if (!submitted) return `${base} border-border bg-background`;
  return correct
    ? `${base} border-success-border bg-success-subtle`
    : `${base} border-destructive-border bg-destructive-subtle`;
}

function dragHandleClassName(): string {
  return "flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground transition-colors cursor-grab outline-none active:cursor-grabbing hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40";
}
