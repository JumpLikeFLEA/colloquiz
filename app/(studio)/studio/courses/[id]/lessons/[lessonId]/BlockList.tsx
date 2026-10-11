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
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  THEORY_BLOCK_TYPES,
  VOICE_DEFAULT_SECONDS,
  type TheoryBlock,
  type TheoryBlockType,
  type VoiceTaskBlock,
} from "@/lib/lessons";
import type { LessonBlock } from "@/lib/lessons";
import type { LessonFieldErrorMap } from "@/lib/lessonEditorErrors";
import { EXERCISE_VARIANT_LABEL, EXERCISE_VARIANTS, exerciseLabel, exerciseTemplate } from "@/lib/studio/exerciseTemplates";
import {
  INTRO_GROUP_ID,
  addChapter,
  chapterBlockCount,
  deleteChapter,
  groupChapters,
  insertIntoChapter,
  moveBlock,
  moveChapter,
  type HeadingBlock,
} from "@/lib/studio/chapters";
import { BlockForm } from "./BlockForm";
import { PracticeItemForm } from "./PracticeItemForm";
import { VoiceTaskForm } from "./VoiceTaskForm";
import type { UploadLessonImage } from "./LessonImageUploadButton";

// The block-list half of AUTH-002: add, edit, delete and reorder every block
// in the lesson document, theory and practice together, in one array.
// Exercises are added from AUTH-016's friendly variants
// (lib/studio/exerciseTemplates.ts, docs/decisions/0125 Decision 5). Drag uses the same
// dnd-kit sensor/id shape as the lesson player's OrderingRenderer (0032) —
// with the up/down buttons kept as the accessible fallback, same precedent.
// AUTH-017 (0125 Decisions 1 and 7, 0128): the rows are shown as an outline
// of chapters (a level-1 heading and the blocks under it), derived from the
// flat array by lib/studio/chapters.ts on every render.

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
      // A subheading: a chapter (level 1) comes from "+ Add chapter" (0128).
      return { id, kind: "theory", type, level: 2, text: emptyText };
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

const VOICE_TASK_LABEL = "Voice task";

/** VOICE-003: a new voice task, appended like every other new block and
 * moved into place with drag or the up/down buttons. */
function defaultVoiceTask(): VoiceTaskBlock {
  return { id: crypto.randomUUID(), kind: "task", type: "voice", prompt: [{ text: "" }], maxSeconds: VOICE_DEFAULT_SECONDS };
}

function blockTypeLabel(block: LessonBlock): string {
  switch (block.kind) {
    case "practice":
      return exerciseLabel(block.item);
    case "task":
      return block.compare ? `${VOICE_TASK_LABEL} · ${block.compare}` : VOICE_TASK_LABEL;
    case "theory":
      return TYPE_LABEL[block.type];
  }
}

function blockPreview(block: LessonBlock): string {
  if (block.kind === "practice") return block.item.payload.prompt || "(empty)";
  if (block.kind === "task") return block.prompt.map((r) => r.text).join("") || "(empty)";
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
  onUploadImage,
}: {
  blocks: LessonBlock[];
  onChange: (next: LessonBlock[]) => void;
  fieldErrors: LessonFieldErrorMap;
  onUploadImage: UploadLessonImage;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Grouping is derived from the flat array on every render; the array is
  // the only state, and the only thing saved (0125 Decision 7).
  const groups = groupChapters(blocks);
  const [intro, ...chapters] = groups;
  const hasChapters = chapters.length > 0;
  const visibleIds = groups.flatMap((g) => {
    const inner = collapsed.has(g.id) ? [] : g.blocks.map((b) => b.id);
    return g.heading ? [g.heading.id, ...inner] : inner;
  });

  function setGroupCollapsed(groupId: string, value: boolean) {
    setCollapsed((prev) => {
      if (prev.has(groupId) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }

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
    if (!over) return;
    const next = moveBlock(blocks, String(active.id), String(over.id));
    if (next.every((b, i) => b === blocks[i])) return;
    onChange(next);
    // Dropped on a collapsed chapter's header from above, the block is now
    // that chapter's first one: open the chapter rather than hide the block.
    const landedIn = groupChapters(next).find((g) => g.blocks.some((b) => b.id === active.id));
    if (landedIn) setGroupCollapsed(landedIn.id, false);
  }

  function addBlock(groupId: string, block: LessonBlock) {
    onChange(insertIntoChapter(blocks, groupId, block));
    setGroupCollapsed(groupId, false);
    setExpandedId(block.id);
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function confirmDelete(chapterId: string) {
    const next = deleteChapter(blocks, chapterId);
    onChange(next);
    if (expandedId && !next.some((b) => b.id === expandedId)) setExpandedId(null);
  }

  function renderRow(block: LessonBlock) {
    const index = blocks.indexOf(block);
    return (
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
        onUploadImage={onUploadImage}
      />
    );
  }

  const activeBlock = blocks.find((b) => b.id === activeId) ?? null;
  const confirmGroup = chapters.find((g) => g.id === confirmDeleteId) ?? null;
  const confirmCount = confirmGroup ? chapterBlockCount(blocks, confirmGroup.id) : 0;

  return (
    <div className="space-y-3">
      <DndContext
        id="lesson-blocks"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext id="lesson-blocks" items={visibleIds} strategy={verticalListSortingStrategy}>
          {(!hasChapters || intro.blocks.length > 0) && (
            <div className="space-y-3">
              {hasChapters && <p className="px-1 text-xs text-muted-foreground">Before the first chapter</p>}
              <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
                {blocks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
                    No blocks yet.
                  </div>
                )}
                {intro.blocks.map(renderRow)}
              </div>
              <AddBlockMenu onAdd={(block) => addBlock(INTRO_GROUP_ID, block)} />
            </div>
          )}

          {chapters.map((chapter, chapterIndex) => {
            const heading = chapter.heading!;
            const isCollapsed = collapsed.has(chapter.id);
            return (
              <section
                key={chapter.id}
                aria-label={`Chapter: ${plainText(heading.text) || "Untitled"}`}
                className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden"
              >
                <ChapterHeader
                  heading={heading}
                  blockCount={chapter.blocks.length}
                  collapsed={isCollapsed}
                  onToggleCollapsed={() => setGroupCollapsed(chapter.id, !isCollapsed)}
                  expanded={expandedId === heading.id}
                  onToggleExpand={() => setExpandedId(expandedId === heading.id ? null : heading.id)}
                  canMoveUp={chapterIndex > 0}
                  canMoveDown={chapterIndex < chapters.length - 1}
                  onMove={(direction) => onChange(moveChapter(blocks, chapter.id, direction))}
                  onDelete={() => setConfirmDeleteId(chapter.id)}
                  onChange={(next) => onChange(blocks.map((b) => (b.id === heading.id ? next : b)))}
                  blockErrors={fieldErrors.get(heading.id)}
                  hasErrors={fieldErrors.has(heading.id)}
                  onUploadImage={onUploadImage}
                />
                {!isCollapsed && (
                  <>
                    {chapter.blocks.map(renderRow)}
                    <div className="px-3 py-2.5">
                      <AddBlockMenu onAdd={(block) => addBlock(chapter.id, block)} />
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </SortableContext>
        <DragOverlay>
          {activeBlock && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg text-sm">
              {blockTypeLabel(activeBlock)}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <AddChapterControl
        onAdd={(title) => {
          const result = addChapter(blocks, title);
          if (result) onChange(result.blocks);
        }}
      />

      <AlertDialog
        open={confirmGroup !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete the chapter “{confirmGroup ? plainText(confirmGroup.heading!.text) || "Untitled" : ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCount === 0
                ? "The chapter is empty, so only its heading is removed."
                : `Its heading and the ${confirmCount} ${confirmCount === 1 ? "block" : "blocks"} in it are removed.`}{" "}
              The lesson changes when you save it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmGroup) confirmDelete(confirmGroup.id);
                setConfirmDeleteId(null);
              }}
              className="rounded-xl"
            >
              Delete chapter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function plainText(runs: readonly { text: string }[]): string {
  return runs.map((r) => r.text).join("");
}

const OUTLINED_BUTTON_CLASS =
  "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors";

/** The "Add block" menu, one per group: a chapter's inserts at the end of
 * that chapter (0125 Decision 7). Its heading entry makes a subheading; a
 * chapter comes from "+ Add chapter" (0128). */
function AddBlockMenu({ onAdd }: { onAdd: (block: LessonBlock) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={OUTLINED_BUTTON_CLASS}>
          <Plus className="size-3.5" />
          Add block
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theory</DropdownMenuLabel>
        {THEORY_BLOCK_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onAdd(defaultBlockFor(type))}>
            {type === "heading" ? "Subheading" : TYPE_LABEL[type]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Exercise</DropdownMenuLabel>
        {EXERCISE_VARIANTS.map((variant) => (
          <DropdownMenuItem key={variant} onSelect={() => onAdd(exerciseTemplate(variant))}>
            {EXERCISE_VARIANT_LABEL[variant]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAdd(defaultVoiceTask())}>{VOICE_TASK_LABEL}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "+ Add chapter" asks for the title first, so the new level-1 heading is
 * valid the moment it exists (0125 Decision 7). */
function AddChapterControl({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState<string | null>(null);

  if (title === null) {
    return (
      <button type="button" onClick={() => setTitle("")} className={OUTLINED_BUTTON_CLASS}>
        <Plus className="size-3.5" />
        Add chapter
      </button>
    );
  }

  const blank = title.trim() === "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (blank) return;
        onAdd(title);
        setTitle(null);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setTitle(null);
        }}
        placeholder="Chapter title"
        aria-label="Chapter title"
        maxLength={120}
        className="flex-1 basis-48 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
      />
      <button
        type="submit"
        disabled={blank}
        className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
      >
        Add chapter
      </button>
      <button type="button" onClick={() => setTitle(null)} className={OUTLINED_BUTTON_CLASS}>
        Cancel
      </button>
    </form>
  );
}

/** A chapter's header: its level-1 heading. It is a drop target (a block
 * dropped on it joins this chapter or the group above it), never a drag
 * source: dragging it alone would carry half a lesson into another chapter
 * (0125 Decision 7). Its ↑↓ move the whole chapter. */
function ChapterHeader({
  heading,
  blockCount,
  collapsed,
  onToggleCollapsed,
  expanded,
  onToggleExpand,
  canMoveUp,
  canMoveDown,
  onMove,
  onDelete,
  onChange,
  blockErrors,
  hasErrors,
  onUploadImage,
}: {
  heading: HeadingBlock;
  blockCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onChange: (next: LessonBlock) => void;
  blockErrors: ReturnType<LessonFieldErrorMap["get"]>;
  hasErrors: boolean;
  onUploadImage: UploadLessonImage;
}) {
  const { setNodeRef, transform, transition } = useSortable({
    id: heading.id,
    disabled: { draggable: true, droppable: false },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const title = plainText(heading.text);

  return (
    <div ref={setNodeRef} style={style} data-sortable-row className={hasErrors ? "bg-destructive-subtle" : "bg-muted"}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand chapter" : "Collapse chapter"}
          className="cursor-pointer shrink-0 p-1 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label="Move chapter up"
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label="Move chapter down"
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <button type="button" onClick={onToggleExpand} className="cursor-pointer flex-1 min-w-0 text-left">
          <span className="block truncate text-sm font-semibold text-foreground">{title || "(empty)"}</span>
          <span className="block text-xs text-muted-foreground">
            Chapter · {blockCount} {blockCount === 1 ? "block" : "blocks"}
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete chapter"
          className="cursor-pointer shrink-0 p-1.5 text-muted-foreground hover:text-destructive-text transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border bg-card">
          <BlockForm block={heading} onChange={onChange} errors={blockErrors} onUploadImage={onUploadImage} />
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
  onUploadImage,
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
  onUploadImage: UploadLessonImage;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const typeLabel = blockTypeLabel(block);

  return (
    <div ref={setNodeRef} style={style} data-sortable-row className={hasErrors ? "bg-destructive-subtle" : ""}>
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
              onUploadImage={onUploadImage}
            />
          ) : block.kind === "task" ? (
            <VoiceTaskForm block={block} onChange={onChange} errors={blockErrors} />
          ) : (
            <BlockForm block={block} onChange={onChange} errors={blockErrors} onUploadImage={onUploadImage} />
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
