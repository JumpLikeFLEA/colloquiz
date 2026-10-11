import type { LessonBlock, TheoryBlock } from "../lessons";

export type HeadingBlock = Extract<TheoryBlock, { type: "heading" }>;

// AUTH-017 (docs/decisions/0125 Decisions 1 and 7, 0128): the lesson editor's
// chapter outline. A chapter is a level-1 `heading` block plus every block
// after it up to the next level-1 heading; blocks before the first one form
// an unnamed intro group. The flat block array stays the editor's only state
// and is what gets saved, so the lesson document and the player are
// unchanged. Every function here derives from or returns that flat array.

/** The intro group's id. Never a block id: block ids are UUIDs or authored
 * slugs, and an intro is not a block. */
export const INTRO_GROUP_ID = "__intro__";

export type BlockGroup = {
  /** `INTRO_GROUP_ID` for the intro, else the chapter heading's block id. */
  id: string;
  /** The chapter's level-1 heading; null for the intro. */
  heading: HeadingBlock | null;
  /** Half-open range [start, end) into the flat array, heading included. */
  start: number;
  end: number;
  /** The blocks under the heading (the heading itself excluded). */
  blocks: LessonBlock[];
};

export function isChapterHeading(block: LessonBlock): block is HeadingBlock {
  return block.kind === "theory" && block.type === "heading" && block.level === 1;
}

/** The intro group first (always present, possibly empty), then one group
 * per level-1 heading, in document order. Level-2 headings are ordinary
 * blocks and stay inside their chapter. */
export function groupChapters(blocks: readonly LessonBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [{ id: INTRO_GROUP_ID, heading: null, start: 0, end: 0, blocks: [] }];
  blocks.forEach((block, index) => {
    if (isChapterHeading(block)) {
      groups[groups.length - 1].end = index;
      groups.push({ id: block.id, heading: block, start: index, end: index, blocks: [] });
    } else {
      groups[groups.length - 1].blocks.push(block);
    }
  });
  groups[groups.length - 1].end = blocks.length;
  return groups;
}

/** Inserts `block` at the end of the group `groupId`. An unknown group id
 * returns the array unchanged. */
export function insertIntoChapter(blocks: readonly LessonBlock[], groupId: string, block: LessonBlock): LessonBlock[] {
  const group = groupChapters(blocks).find((g) => g.id === groupId);
  if (!group) return [...blocks];
  return [...blocks.slice(0, group.end), block, ...blocks.slice(group.end)];
}

/** Swaps the chapter `chapterId` with its neighbouring chapter. The intro
 * never moves, and a chapter never moves above it; a move past either edge,
 * or of an unknown id, returns the array unchanged. */
export function moveChapter(blocks: readonly LessonBlock[], chapterId: string, direction: -1 | 1): LessonBlock[] {
  if (chapterId === INTRO_GROUP_ID) return [...blocks];
  const groups = groupChapters(blocks);
  const index = groups.findIndex((g) => g.id === chapterId);
  const target = index + direction;
  // groups[0] is the intro, so a chapter's lowest position is 1.
  if (index < 1 || target < 1 || target >= groups.length) return [...blocks];
  const [first, second] = direction === -1 ? [groups[target], groups[index]] : [groups[index], groups[target]];
  return [
    ...blocks.slice(0, first.start),
    ...blocks.slice(second.start, second.end),
    ...blocks.slice(first.start, first.end),
    ...blocks.slice(second.end),
  ];
}

/** Removes the chapter `chapterId`: its heading and exactly the blocks under
 * it. The intro is not a chapter and is never removed this way. */
export function deleteChapter(blocks: readonly LessonBlock[], chapterId: string): LessonBlock[] {
  if (chapterId === INTRO_GROUP_ID) return [...blocks];
  const group = groupChapters(blocks).find((g) => g.id === chapterId);
  if (!group) return [...blocks];
  return [...blocks.slice(0, group.start), ...blocks.slice(group.end)];
}

/** Appends a new chapter with the given title, so the heading is valid the
 * moment it exists. A blank title is refused (null): an empty heading fails
 * the document's validation. */
export function addChapter(
  blocks: readonly LessonBlock[],
  title: string,
  id: string = crypto.randomUUID(),
): { blocks: LessonBlock[]; heading: HeadingBlock } | null {
  const text = title.trim();
  if (text === "") return null;
  const heading: HeadingBlock = { id, kind: "theory", type: "heading", level: 1, text: [{ text }] };
  return { blocks: [...blocks, heading], heading };
}

/** A drag-and-drop move of one ordinary block onto the row `overId`, with
 * dnd-kit's sortable semantics: the block takes the over row's position,
 * landing after it when moving down and before it when moving up. Dropped on
 * a chapter heading from above, it becomes that chapter's first block; from
 * below, the previous group's last. A level-1 heading is never moved this
 * way (it is the chapter's header, and moving it alone would carry half a
 * lesson into another chapter): that, an unknown id, or a drop on itself
 * returns the array unchanged. */
export function moveBlock(blocks: readonly LessonBlock[], activeId: string, overId: string): LessonBlock[] {
  const from = blocks.findIndex((b) => b.id === activeId);
  const to = blocks.findIndex((b) => b.id === overId);
  if (from === -1 || to === -1 || from === to || isChapterHeading(blocks[from])) return [...blocks];
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Number of blocks under a chapter's heading, which a chapter delete
 * removes along with the heading — the count the confirm states. */
export function chapterBlockCount(blocks: readonly LessonBlock[], chapterId: string): number {
  const group = groupChapters(blocks).find((g) => g.id === chapterId);
  return group && group.heading ? group.blocks.length : 0;
}
