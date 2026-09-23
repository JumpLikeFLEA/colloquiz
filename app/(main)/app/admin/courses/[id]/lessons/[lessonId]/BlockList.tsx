"use client";

import { useState } from "react";
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
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { THEORY_BLOCK_TYPES, type TheoryBlock, type TheoryBlockType } from "@/lib/lessons";
import type { LessonBlock } from "@/lib/lessons";
import type { LessonFieldErrorMap } from "@/lib/lessonEditorErrors";
import { BlockForm } from "./BlockForm";
import { PracticeItemForm } from "./PracticeItemForm";

// The block-list half of AUTH-002: add, edit (theory only — practice-block
// forms are AUTH-003), delete and reorder every block in the lesson
// document, theory and practice together, in one array. Drag uses the same
// dnd-kit sensor/id shape as the lesson player's OrderingRenderer (0032) —
// with the up/down buttons kept as the accessible fallback, same precedent.

const TYPE_LABEL: Record<TheoryBlockType, string> = {
  heading: "Heading",
  prose: "Prose",
  example: "Example",
  callout: "Callout",
  list: "List",
  image: "Image",
  video: "Video",
  self_check: "Self-check",
  table: "Table",
};

function defaultBlockFor(type: TheoryBlockType): TheoryBlock {
  const id = crypto.randomUUID();
  const emptyText = [{ text: "" }];
  switch (type) {
    case "heading":
      return { id, kind: "theory", type, level: 1, text: emptyText };
    case "prose":
      return { id, kind: "theory", type, text: emptyText };
    case "example":
      return { id, kind: "theory", type, text: emptyText };
    case "callout":
      return { id, kind: "theory", type, variant: "tip", text: emptyText };
    case "list":
      return { id, kind: "theory", type, ordered: false, items: [emptyText] };
    case "image":
      return { id, kind: "theory", type, url: "", alt: "" };
    case "video":
      return { id, kind: "theory", type, youtubeId: "" };
    case "self_check":
      return { id, kind: "theory", type, prompt: emptyText, response: "short", modelAnswer: emptyText };
    case "table":
      return { id, kind: "theory", type, header: [emptyText], rows: [[emptyText]] };
  }
}

function blockPreview(block: LessonBlock): string {
  if (block.kind === "practice") return `${block.item.type} item`;
  switch (block.type) {
    case "heading":
    case "prose":
    case "example":
    case "callout":
      return block.text.map((r) => r.text).join("") || "(empty)";
    case "list":
      return block.items[0]?.map((r) => r.text).join("") || "(empty list)";
    case "image":
      return block.alt || "(no alt text)";
    case "video":
      return block.youtubeId || "(no video id)";
    case "self_check":
      return block.prompt.map((r) => r.text).join("") || "(empty)";
    case "table":
      return block.caption?.map((r) => r.text).join("") || `${block.rows.length} row(s)`;
  }
}

export function BlockList({
  blocks,
  onChange,
  fieldErrors,
}: {
  blocks: LessonBlock[];
  onChange: (next: LessonBlock[]) => void;
  fieldErrors: LessonFieldErrorMap;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = blocks.findIndex((b) => b.id === active.id);
    const toIndex = blocks.findIndex((b) => b.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  }

  function addBlock(type: TheoryBlockType) {
    const block = defaultBlockFor(type);
    onChange([...blocks, block]);
    setExpandedId(block.id);
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  const activeBlock = blocks.find((b) => b.id === activeId) ?? null;

  return (
    <div className="space-y-3">
      <DndContext
        id="lesson-blocks"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext id="lesson-blocks" items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {blocks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
                No blocks yet.
              </div>
            )}
            {blocks.map((block, index) => (
              <BlockRow
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                expanded={expandedId === block.id}
                onToggleExpand={() => setExpandedId(expandedId === block.id ? null : block.id)}
                onMove={(direction) => move(index, direction)}
                onRemove={() => removeBlock(block.id)}
                onChange={(next) => onChange(blocks.map((b, i) => (i === index ? next : b)))}
                blockErrors={fieldErrors.get(block.id)}
                hasErrors={fieldErrors.has(block.id)}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeBlock && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg text-sm">
              {TYPE_LABEL[(activeBlock as TheoryBlock).type as TheoryBlockType] ?? "Practice item"}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            <Plus className="size-3.5" />
            Add block
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {THEORY_BLOCK_TYPES.map((type) => (
            <DropdownMenuItem key={type} onSelect={() => addBlock(type)}>
              {TYPE_LABEL[type]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BlockRow({
  block,
  index,
  total,
  expanded,
  onToggleExpand,
  onMove,
  onRemove,
  onChange,
  blockErrors,
  hasErrors,
}: {
  block: LessonBlock;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onChange: (next: LessonBlock) => void;
  blockErrors: ReturnType<LessonFieldErrorMap["get"]>;
  hasErrors: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const typeLabel = block.kind === "practice" ? `Practice · ${block.item.type}` : TYPE_LABEL[block.type];

  return (
    <div ref={setNodeRef} style={style} className={hasErrors ? "bg-destructive-subtle" : ""}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab active:cursor-grabbing shrink-0 p-1 text-muted-foreground hover:text-foreground"
        >
          <GripVertical size={14} />
        </button>
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move down"
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <button type="button" onClick={onToggleExpand} className="cursor-pointer flex-1 min-w-0 text-left">
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground mr-2">{typeLabel}</span>
          <span className="text-sm text-foreground truncate">{blockPreview(block)}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete block"
          className="cursor-pointer shrink-0 p-1.5 text-muted-foreground hover:text-destructive-text transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          {block.kind === "practice" ? (
            <PracticeItemForm
              item={block.item}
              onChange={(item) => onChange({ ...block, item })}
              errors={blockErrors}
            />
          ) : (
            <BlockForm block={block} onChange={onChange} errors={blockErrors} />
          )}
          {blockErrors?.get("")?.map((m, i) => (
            <p key={i} className="text-xs text-destructive-text mt-2">
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
