"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Check, GripVertical, X } from "lucide-react";
import { scoreItem } from "@/lib/items";
import type { ItemScoreResult, OrderingItem } from "@/lib/items";
import { shuffleOrderingIndices } from "@/lib/items/shuffle";
import {
  buildOrderingResponse,
  initialOrder,
  moveOrderElement,
  moveOrderElementToIndex,
} from "@/lib/lessonPlayer/orderingResponse";

/**
 * PLAY-003/0032 — `ordering` renderer (permutation of N elements;
 * lib/items/ordering.ts). Drag-to-reorder was added on top of the up/down
 * buttons (docs/decisions/0032), reversing 0030 Decision 1's "no drag" call
 * now that @dnd-kit/sortable is an approved dependency and handles the
 * touch-scroll conflict 0030 could not verify a fix for — see 0032 for why
 * that reversal is safe and what changed. The buttons stay: they are the
 * keyboard/no-JS-gesture fallback 0030 already designed around, and now also
 * the thing `moveOrderElementToIndex` (lib/lessonPlayer/orderingResponse.ts)
 * proves drag and buttons agree on, since BOTH call it — no reorder math
 * lives in this component.
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

  // Same sensor set for both PLAY-004's drag interactions (docs/decisions/
  // 0032): PointerSensor's small distance constraint keeps a plain tap from
  // starting a drag; TouchSensor's activation delay lets a vertical swipe
  // scroll the page normally, only arming the drag after the finger has
  // stayed roughly still for ~200ms; KeyboardSensor is the accessible path.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      <p className="mb-3 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={submitted}>
          <div className="flex flex-col gap-2">
            {order.map((id, position) => {
              const element = elementsById.get(id)!;
              const subResult = result?.subResults[position];
              return (
                <OrderingRow
                  key={id}
                  id={id}
                  text={element.text}
                  isFirst={position === 0}
                  isLast={position === order.length - 1}
                  submitted={submitted}
                  correct={subResult?.correct}
                  onMove={(direction) => setOrder((prev) => moveOrderElement(prev, id, direction))}
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
  isFirst,
  isLast,
  submitted,
  correct,
  onMove,
}: {
  id: string;
  text: string;
  isFirst: boolean;
  isLast: boolean;
  submitted: boolean;
  correct: boolean | undefined;
  onMove: (direction: "up" | "down") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: submitted,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={rowClassName({ submitted, correct, isDragging })}>
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
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={submitted || isFirst}
          aria-label={`Move "${text}" up`}
          onClick={() => onMove("up")}
          className={moveButtonClassName()}
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={submitted || isLast}
          aria-label={`Move "${text}" down`}
          onClick={() => onMove("down")}
          className={moveButtonClassName()}
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </button>
        {submitted &&
          (correct ? (
            <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
          ))}
      </div>
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
  const base = "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 transition-colors";
  if (isDragging) return `${base} border-brand/40 bg-brand-subtle/40 opacity-50`;
  if (!submitted) return `${base} border-border bg-background`;
  return correct
    ? `${base} border-success-border bg-success-subtle`
    : `${base} border-destructive-border bg-destructive-subtle`;
}

function moveButtonClassName(): string {
  return "flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors cursor-pointer hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40";
}

function dragHandleClassName(): string {
  return "flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground transition-colors cursor-grab active:cursor-grabbing hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
}
