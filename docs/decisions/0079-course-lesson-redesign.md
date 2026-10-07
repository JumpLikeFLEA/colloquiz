# 0079 — Course page and lesson page redesign, in the 0078 landing vocabulary

## Context

Ad-hoc owner request (2026-10-07), the day after the 0078 landing redesign.
The path is course card → course page → free lesson → lesson content. Both
pages predated 0078 and the owner described them as "a lot of empty space,
misalignments". The concrete defects found before any code was written:

- Neither page had a header or a link back. `alliengllCopy.player.backToCourse`
  existed, and nothing rendered it.
- The course page stacked everything in the `max-w-5xl` column (1024px at
  `lg`) with `text-sm` rows, so a two-lesson course was mostly whitespace.
- The lesson page's `<h1>` sat at the left edge of that 1024px column. The
  content below it is centred at `max-w-2xl` (decision 0043), so the title
  hung off to the left of everything it titles.
- An anonymous visitor always saw "0/2 пройдено уроков".
- "Урок завершён" rendered before anything had been answered (0058
  Decision 1).
- The lesson's score banner sits at the top of the page, but the learner is
  at the bottom when it appears.

The options were settled with the owner in a planning session (grill)
before any code was written. This file records them, plus the calls made
while implementing. It is appended to in the same commit as each step.

## Decision 4 — the course page lists published, non-archived lessons only

(Numbered to match the plan's D1–D10. D4 shipped first because the later
steps count against this list.)

`getPublicCourse` (lib/coursePage.ts) relied on RLS alone to hide drafts.
That holds for an anonymous or ordinary signed-in caller. It does not hold
for a signed-in editor: "lessons: editor read" (migration 041) returns
every lesson of the course, drafts and archived ones included. The owner,
who is an editor, therefore saw lessons on the public course page that
404 when tapped, because lib/publicLesson.ts serves
`published_version_id IS NOT NULL` only. lib/catalogueSummary.ts had
already documented and fixed the same leak for the catalogue counts.

The fix is a pure `publishedLessonsOnly` filter (lib/coursePageProgress.ts,
unit-tested), applied to the lessons read. Course `status` is deliberately
left alone: a draft course's page is reachable only by its editors, and
for them it now shows whatever is actually published in it.

Verified: anonymous output is unchanged. `/courses/auth003-smoke-test`
lists the same two lessons with and without the change (curl, dev server,
`git stash` A/B). The editor case is covered by the unit test, not by a
live editor session.

**What would make us revisit it:** an editor asking to preview a draft
lesson in its course-page context. That is the preview screen's job
(AUTH-005), not the public page's.

## Decision 5a — "Урок N из M" and "next lesson" come from one list read

`getNextLesson` (PLAY-007) is replaced by `getLessonNav(courseId, slug)`
(lib/publicLesson.ts). It is one lessons query, ordered by ordinal then
slug, passed through `publishedLessonsOnly`. The pure `lessonNav` helper
then derives the 1-based position, the total and the following lesson.
The lesson route makes the same number of queries as before.

- **Position is the index in the list, never the ordinal.** Ordinals are
  neither unique nor gapless (migration 041). The slug tiebreak, added to
  `getPublicCourse` as well, keeps both pages on one order, so "Урок 2" on
  the lesson page is the second card on the course page.
- **The archived filter is a fix, not just a refactor.** `getNextLesson`
  checked `published_version_id` but not `archived_at`, so for an editor it
  could offer an archived lesson as "next".
- `getPublicLesson` now also returns `courseId` and `courseTitle` on both
  the `ok` and `not_available` states, for the band's back link. It no
  longer returns `ordinal`, whose only consumer was `getNextLesson`.

`sessionProgress(document, results)` (lib/lessonPlayer/session.ts) is the
player's first "how many exercises are answered, out of how many" signal.
Its `total` is the same count `countPracticeBlocks` feeds `publish_lesson`
as `published_item_count`. The "N заданий" on the course page and the
"x/y" in the lesson therefore agree by construction.

Verified: `/courses/auth003-smoke-test/one-of-each-item-type` still links
"Следующий урок" to `/9`, and `/9` (the last lesson) shows none.
