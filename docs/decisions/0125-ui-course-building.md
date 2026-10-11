# 0125 — Authors build a course in Studio

Status: **decided by the owner** (2026-10-11, a planning session). It is
split into AUTH-015 to AUTH-018.

## Context

Studio (0109) gives authors a workspace. Building a course still needs Gleb,
for three reasons:

- `create_course` is admin-only (`044:408`) and inserts no `course_editors`
  row. A non-admin cannot create a course, and could not edit one if they
  did.
- The lesson editor's "Add block" menu (`BlockList.tsx:234-242`) offers the
  nine theory types and Voice task but no exercise. Practice blocks only
  arrive through `scripts/import-lesson.ts`, so a course built in the UI
  has no exercises.
- Nothing deletes a course. `rg "DELETE FROM courses"` finds only 040's
  one-off cleanup (0124, "The inventory").

0109's Context said "course creation stays on the PDF -> JSON -> import
path", but gave no reason. The reasons in 0018 D3, 0025 D5 and 0028 are
about turning a PDF into a draft. They do not argue against the UI. That
path is unchanged here: the maintainer runs `prompts/draft-lesson.md` in a
chat, then `validate-course-file.ts`, then `import-lesson.ts`. No import UI
and no assistant UI is added.

## Decision 1: a chapter is a level-1 heading

A chapter is a `heading` block with `level: 1`, plus every block after it
up to the next level-1 heading. Blocks before the first one form an
unnamed intro group.

- Options:
  - **Heading blocks (chosen).**
  - A `chapter` node that contains blocks. Rejected: it changes
    `parseLessonDocument`, the player, the importer, the drafting prompt,
    the export shape and every stored version.
  - A level between course and lesson. Rejected: it contradicts handoff's
    "Course → lesson. Two levels, nothing between them".
  - A paged player. Rejected: it changes the learner's experience, not the
    authoring.
- 0020 already calls level 1 a "section heading", so imported lessons that
  use level-1 headings are already in chapters.
- The player does not change. Chapters are an authoring view only.

## Decision 2: any existing editor may create a course

`create_course` allows `is_admin` OR any caller with at least one
`course_editors` row. That is the same population that can open Studio
(`lib/studioEditor.ts`).

- A non-admin creator gets `course_editors (course_id, user_id, granted_by
  = self)` in the same transaction. An admin gets no row, because
  `is_admin` already passes `can_edit_course` and a row would only clutter
  the Editors list.
- 044:56-62's circularity argument is answered: the gate checks "is an
  editor of something", not "is an editor of this course".
- Granting and revoking editors stays admin-only (0041 D4).
- Consequence: granting someone editor rights on one course now also lets
  them create courses. With one partner, that is the intent.
- Options rejected:
  - an explicit creator permission (one more table and admin control for
    one person);
  - any signed-in user (Studio is a tool for authors).

## Decision 3: publishing is unchanged

`publish_course` and `publish_lesson` are already gated on
`can_edit_course`. Requiring an admin to approve a first publish was
rejected because it works against M1's bar, "the partner can publish
without Gleb".

## Decision 4: course slug from the title, editable

The "New course" dialog fills the slug from the title with
`slugifyLessonTitle` (`lib/lessonSlug.ts:32`) until the author edits the
slug field. The slug stays fixed after creation, as today, and
`slug_taken` is shown inline. A hidden auto-slug was rejected because the
author could not fix an ugly URL.

## Decision 5: exercises are added from friendly variants

"Add block" gets an Exercise group of templates named for what the author
wants to make:

| Label | Template |
|---|---|
| Multiple choice | `selection` |
| True / False | `selection`, two options prefilled "True" / "False" |
| True/False statements | `selection_grid` |
| Put in order | `ordering` |
| Match pairs | `matching`, `presentation: "pairs"` |
| Sort into groups | `matching`, `presentation: "sort"` |
| Fill the gaps | `slots`, `input: "typed"` |
| Drag words into gaps | `slots`, `input: "drag"` |

- The matching form gains a "Show as: Pairs / Sort into groups" Select;
  today nothing in the form sets `presentation`.
- Block rows use the same labels instead of "Practice · selection".
- Five entries named after the engine's types were rejected: that is the
  engine's vocabulary, not the author's.

## Decision 6: an unfinished exercise blocks Save

A new exercise starts empty and fails `parseItem` until it is complete:
two options, a correct one, an explanation or a fallback. Save returns
422, and the form flags each missing field.

- An empty theory block already behaves this way, and it keeps every saved
  draft previewable.
- A placeholder template that passes validation was rejected: placeholder
  text could be published.
- Lenient drafts were rejected: they change the editor load, the preview
  and the import contract.

## Decision 7: chapter operations

- An outline with each chapter collapsible.
- A per-chapter "+ Add block" that inserts at the end of that chapter.
- ↑↓ to move a whole chapter.
- Delete a chapter with its blocks, after a confirm that gives the block
  count.
- "+ Add chapter" asks for the title inline first, so the new heading is
  valid at once.
- Ordinary blocks drag within and across chapters. A level-1 heading row
  is the chapter's header and is not dragged on its own; dragging it would
  silently move half a lesson into another chapter.
- The flat block array stays the editor's only state. Grouping is derived
  from it.

## Decision 8: delete a draft course nobody has played

A course can be deleted when `status = 'draft'` AND no learner data
references it. Any editor of the course may delete it (`can_edit_course`);
the guard keeps it safe, not the caller's role.

- The confirm asks for the course title. After the RPC succeeds, the route
  removes `<courseId>/` from the `lesson-images` bucket.
- A course whose lessons were once published can still be deleted if
  nobody played them. The owner accepted that a link to it may have been
  shared.
- Every foreign key into `courses`, `lessons`, `lesson_versions` and
  `course_runs` is `ON DELETE CASCADE`, except 053's `SET NULL`. So the
  guard, not the schema, is what keeps a delete from taking learner data
  with it. The guard lists every such table. It is derived at work time
  from the migrations, not from this file.
- This holds 0124's invariant ("no editor-callable function removes access
  from an entitled learner"): a course with any entitlement or enrolment
  is refused. `delete_course` joins 0124's inventory.
- Options rejected:
  - "never had a published lesson" (stricter, owner declined);
  - a `first_published_at` column (needs a backfill with unknown history).

## Decision 9: board

There are four cards in M3, ranked before OPS-020:

| Card | Rank | Depends on |
|---|---|---|
| AUTH-015 Editors create courses | 2516 | — |
| AUTH-016 Add exercises | 2517 | AUTH-015 |
| AUTH-017 Chapter outline | 2518 | AUTH-016, because both rework the Add-block menu |
| AUTH-018 Delete a draft course | 2519 | AUTH-015 |

## What would make us revisit this

- A second partner, or an editor who should not create courses: move to an
  explicit creator permission (Decision 2).
- A lesson whose outline needs more than chapter and subheading: revisit
  Decision 1 and 0020's two-level cap together.
- A request for chapter navigation in the player: a new learner-facing
  card with its own budget.
- A deleted course turning out to have had anonymous learners mid-way
  through it: tighten Decision 8 to "never had a published lesson".
