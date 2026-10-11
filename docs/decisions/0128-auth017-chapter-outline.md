# 0128 — AUTH-017: the lesson editor's chapter outline

Status: decided unattended while working AUTH-017 (`--no-approval`), inside
0125 Decisions 1 and 7. What a chapter is, and which operations exist, come
from 0125; this file records what the card left open.

## Decision 1: the operations live in `lib/studio/chapters.ts`

`groupChapters`, `insertIntoChapter`, `moveChapter`, `deleteChapter`,
`addChapter`, `moveBlock` and `chapterBlockCount`, all taking and returning
the flat block array (0125 Decision 7: the array stays the editor's only
state). A chapter's id is its heading's block id; the intro group's is the
constant `INTRO_GROUP_ID`. Every no-op (an edge move, the intro, an unknown
id, a level-1 heading as a drag source) returns an equal array, so the
editor's "nothing changed" check holds. Tested in `chapters.test.ts`.

## Decision 2: dropping a block on a chapter header

Headers are sortable drop targets but never drag sources (`useSortable`
with `disabled: { draggable: true }`). `moveBlock` uses dnd-kit's own
sortable semantics: the block takes the target row's position. So a block
dropped on a header from above becomes that chapter's first block, and from
below it becomes the previous group's last. This matches what the drag
animation shows. When the target chapter is collapsed, it opens, so the
block doesn't disappear from view.

- Rejected: a separate droppable per chapter body. It adds a second
  collision model for the same outcome.

## Decision 3: "Heading" in Add block makes a subheading

Every Add-block menu now labels its heading entry "Subheading", and the
new block is `level: 2`. Before, it made a level-1 heading. Under 0125
Decision 1, a level-1 heading added from a chapter's menu would split that
chapter at once, and it would start empty and invalid. Chapters come only
from "+ Add chapter", which asks for the title first. The heading form's
Level Select still offers "Section" (level 1). Changing a subheading to
Section, or a chapter heading to Subheading, splits or merges chapters, and
the outline shows the result straight away.

## Decision 4: the intro group

The intro group has no header and never moves. If the lesson has no
chapters, it is shown exactly as the list was before (one card, "Add block"
below it). If the lesson has chapters, it is shown only when it has blocks,
labelled "Before the first chapter". An empty intro beside chapters would
be a card with nothing in it. To put a block before the first chapter in
that case, add it to the first chapter and drag it onto that chapter's
header.

## Decision 5: per-block ↑↓ stay flat

A block's ↑↓ still swaps it with its neighbour in the flat array. Next to a
chapter header, that moves the block across the chapter boundary. This
keeps the accessible no-drag path able to do everything a drag can.
Chapter ↑↓ are separate buttons on the header ("Move chapter up/down").

## Decision 6: collapse state is not saved

Which chapters are collapsed is per-visit `useState`, all expanded on load.
It isn't stored anywhere, because the lesson document has no place for it
and an editor preference doesn't justify a column.

## Decision 7: the RTL drag mock measures the overlay at the dragged row

`LessonContentEditor.chapters.test.tsx` reuses OrderingRenderer's
keyboard-sensor path (0054). Rows sit in separate chapter cards, so the
rect mock indexes them across the whole document, not among siblings. The
`DragOverlay` node has no row marker. It is measured at the focused grip's
row: measured at top 0, it made ArrowDown resolve from the top of the list
(seen in this card's first run: a2 moved above a1).

## What would make us revisit this

- An author asks for a third level of grouping: revisit 0125 Decision 1
  with 0020's two-level cap.
- Authors lose track of collapsed state between visits: store it per user
  and lesson in localStorage (Decision 6).
- Authors keep needing an empty intro beside chapters: show the empty intro
  with its own Add block (Decision 4).
