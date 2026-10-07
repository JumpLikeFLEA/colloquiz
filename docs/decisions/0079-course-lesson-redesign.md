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

## Decision 1 — course page: a gradient hero band, then the lessons, one column edge

Settled in the grill, choosing between a gradient hero band, a two-column
light page with a sticky summary card, and a full-bleed cover banner. The
band won because it carries the landing's look (0078) straight through,
and because a banner depends on every course having a good wide cover,
which nothing guarantees.

- **Top bar.** `BandTopBar` holds the wordmark and a back link.
- **Lead.** The hero leads with `subtitle`, the ≤200-character catalogue
  summary, and falls back to `description`. The full `description` gets
  an "О курсе" section below the band only when it differs from the lead,
  so a long description never stretches the band.
- **Size line.** The hero's size line comes from `courseTotals`
  (lib/coursePageProgress.ts). Minutes are omitted when any lesson lacks
  an estimate, the same rule the catalogue card follows (0078 D2), so the
  two never disagree. An exercise count of 0 is hidden; the real
  smoke-test course has a lesson with none.
- **Missing cover.** At `lg` there is a translucent level tile, not
  `CourseCard`'s gradient tile, which would be gradient on gradient. On a
  phone there is no tile at all, because the level pill already says it
  and a tile would push the lesson list down.
- **Alignment (implementation call).** The "О курсе" text is capped at
  `max-w-3xl` for line length, but it is LEFT-aligned to the hero's
  column edge, not centred. A centred narrower block under a left-aligned
  hero is the exact misalignment the owner reported.
- **Motion (implementation call).** The hero has the landing's
  tw-animate-css entry stagger, off under reduced motion. There is no
  `.reveal-on-scroll` on the sections below. They are usually already in
  view on load, where a scroll-driven fade leaves the list half-faded
  until the visitor scrolls.

## Decision 2 — the two progress numbers render only once something is attempted

The handoff requires "two numbers, never blended", and that is kept. What
changed is when they show. Today that is only for a signed-in learner
with attempts, because anonymous attempts aren't read on this page (see
lib/courseAttempts.ts). An anonymous visitor was always shown "0/N
пройдено уроков", which carried no information. When the numbers do
show, they are two separate glass tiles in the hero. An attempted lesson
row gets a ✓ on its number tile and "Лучший: N%".

## Decision 3 — "free" is marked once for an all-free course

At launch every lesson of the first courses is free (docs/handoff.md,
2026-09-24), so a per-row "Бесплатно" badge would sit on every row.

- **All-free course.** One "Весь курс бесплатно" pill in the hero, no
  per-row badges, and the CTA reads "Начать курс".
- **Mixed course.** A per-row badge on the free lessons, and the original
  "Начать первый бесплатный урок" CTA.
- **Paid rows.** No lock icon either way. There is no forced order, and
  the paid-preview UX is M3.

Free is still the author's explicit `inFreeSample` flag, never derived
from position.

## Decision 9 — the "Alliengll" wordmark extends to the course and lesson pages

0078 put "Alliengll" in the landing header as literal display text, not a
rename. The course and lesson bands carry the same wordmark, linking to
`/`. It is still not a branding decision: `alliengllCopy.siteName` stays
"Colloquiz", and so does the `%s · Colloquiz` title template. There is no
EN/RU toggle (the landing exception in docs/handoff.md stays
landing-only) and no login link (registration is offered after a lesson,
never before one).

## Decision 10 — how this was verified without touching the hosted database

Owner-approved in the grill:

- **Fixtures.** A dev-only fixture module, gated on `NODE_ENV=development`
  plus `ENGLISH_FIXTURES=1` and on `fixture-*` slugs, hooked into
  `getPublicCourse`, `getCourseAttemptSummary`, `getPublicLesson` and
  `getLessonNav`. It was kept as a scratchpad patch, reversed before every
  commit and re-applied after, so it is in no commit (the 0078 D6
  precedent). Fixture shapes: no cover, a long title, a long two-paragraph
  description, 8 lessons, mixed free/paid, null minutes, all-free with a
  real cover, and recorded attempts.
- **Real data.** The real published `auth003-smoke-test` course was
  checked too.
- **Screenshots.** Playwright (bundled Chromium) at 390×844 and 1440×900,
  in light and dark, with reduced motion. `scrollWidth` was checked equal
  to the viewport width (no horizontal scroll) on every shot.

## Budget

The committed budget routes are `/courses/future-imperfect/*`, which 404
on hosted (probed 2026-10-07; only `auth003-smoke-test` is published). So
these numbers come from `npm run budget` run with a temporary, uncommitted
ROUTES edit pointing at that course. The committed budgets are unchanged.

Before this work, at e1c124e:

| route | KB |
|---|---|
| `/login` | 284.1 |
| `/` | 179.8 / 180 |
| `/courses/auth003-smoke-test` | 173.1 |
| `/courses/auth003-smoke-test/9` | 263.0 |
| `/courses/auth003-smoke-test/one-of-each-item-type` | 291.3 |

The two lesson figures are above the 260/290 targets. Those targets were
set for different lessons (`future-imperfect`'s), so the comparison that
means something here is the before→after delta on the same route.

## Decision 11 — lesson images and videos move to reading width (revises 0043)

Decided with the owner during implementation. The "before" screenshot of a
lesson at 1440px showed what 0043 had left open ("seen as intended …
pending a look in a real browser"): a 1024px video between 672px
paragraphs and exercises. That is the misalignment the owner reported.

`lessonBlockWidth` now puts `image` and `video` at reading width, alongside
every other theory block and every practice block. `table` keeps its own
FIT band, the only block that may grow wider, because a table genuinely
needs the room. That left the "wide" band with no block, so it was
removed from the type and from `LessonPlayer`'s switch rather than kept as
a dead case. `ImageBlockView`'s `sizes` now matches: 672px at `lg`, 544px
up to it, full width on a phone.

Heading centring (`HEADING_WIDTH_CLASS`) is untouched. 0043 made it
explicit policy, and that stands. Its original trigger, a left-aligned
heading over a wider block, now only occurs above a wide table.

**What would make us revisit it:** an author with an image that is
unreadable at 672px, such as a dense diagram. The precedent to reach for
is `table`'s FIT band, not a return to full-column breakout.

## Decision 6 — one exercise card, drawn by the player, with "Задание N из M"

Each of the six practice renderers used to draw its own `rounded-lg border
bg-card p-3` root: Slots did so twice, once per input mode. The card now
lives in one place. `LessonPlayer` wraps every practice block in
`PRACTICE_CARD_CLASS` (columnLayout.ts: rounded-2xl, resting shadow,
`p-4 sm:p-5`), and the renderers render only their contents.

- **Pill.** The top of the card carries a "Задание N из M" pill in the
  landing demo card's label-pill style. N counts practice blocks only, in
  document order, so it agrees with the course page's "N заданий"
  (`published_item_count` = `countPracticeBlocks`). Once the exercise has
  a result, the pill switches to the success tokens with a ✓. It marks
  "answered", never "correct", so a wrong answer turns it green too.
  Nothing on the page demotivates (docs/handoff.md).
- **Shared classes.** "Проверить" and the prompt line share
  `practice/practiceClasses.ts`. The button takes the landing CTA's shape
  (rounded-xl, `min-h-11`, tinted shadow) in the brand fill. The prompt
  steps up to `font-semibold sm:text-base`, so it reads as the card's
  title. `optionClassName` is unchanged; the landing's hero demo already
  uses it.
- **Card is the player's, not the renderers'.** It was moved into
  `LessonPlayer` rather than restyled six times. One definition can't
  drift, and a seventh item type gets the card for free. The admin preview
  and `lesson-player-demo` render through the same `LessonPlayer`, so they
  change too. That is intended: the preview must be the learner's view
  (docs/handoff.md, "Preview is must-have").
- **No `overflow` on the card.** Matching's bank is `sticky bottom-0`
  inside it (0039 Decision 5).

Verified:
- **Test.** An RTL test in LessonPlayer.test.tsx: a document of theory,
  practice, theory, practice renders "Задание 1 из 2" and "Задание 2 из 2",
  and nothing numbered 3.
- **Screenshots.** At 1440 and 390: an answered pill turns green, wrong or
  right.
- **Admin shell.** Through a temporary admin user, created via the Admin
  API, used for this check, then deleted. Deletion was confirmed:
  `getUserById` returns no user, and 0 `profiles` rows. The admin lesson
  preview and `/app/admin/lesson-player-demo` render the same cards inside
  the Colloquiz shell.

## Decision 5 — lesson band and sticky progress strip; the top score banner goes

Settled in the grill. The other options were a light header with no strip,
and a single always-sticky bar.

**The band.** `LessonBand` is a server-rendered compact gradient band,
passed into the client `LessonPageClient` as a node, so it costs no client
JS (0078 D5). It holds:
- `BandTopBar`, with "← Назад к курсу"
- the course title
- the lesson `<h1>` and its description
- glass pills: "Урок N из M" (from Decision 5a's `getLessonNav`), minutes,
  and "N заданий"

Its content edge is `LESSON_READING_FRAME_CLASS` (columnLayout.ts): `px-4`
around exactly the 42rem reading measure at `lg`, and `max-w-xl` below
it. The title, the strip and every block below it therefore start at one
x. The old `<h1>` sat at the 1024px column's edge, over content centred at
672px.

**The strip.** `LessonProgressStrip` is `sticky top-0`, directly under the
band. It holds an icon-only back link (server-rendered, `aria-label`
"Назад к курсу"), a `role="progressbar"` of answered/total exercises, and
"x/y". Once every exercise has an answer, "x/y" becomes the lesson score
("85%"). Details:
- Plain CSS sticky, with no scroll listener or observer.
- Its containing block is `LessonPageClient`'s wrapper, which spans the
  band and the whole player.
- It is never an ancestor of matching's bank (0039 D5), and the bank
  sticks to the bottom, not the top.
- It is not rendered for a lesson with no exercises.

**How it reaches the page.** `LessonPlayer` gained an optional
`renderProgress(progress)`, rendered as a sibling just before its column.
Only `LessonPageClient` passes it. The admin preview and the demo render
no strip: the preview's own header sits above it inside the Colloquiz
shell, and a second sticky bar there would only fight the shell's topbar.

**`complete` vs `scored`.** `LessonProgress.complete` means every practice
block has a result. That is `sessionProgress` (Decision 5a), not
`lessonScore.status === "scored"`, which turns true on the first answer
(0058 Decision 1, 0068 Decision 2).

**The banner is removed.** The score banner that opened `LessonPlayer`'s
column predates PLAY-007's completion box: it was an English
"Progress: X%" line that 0058 flagged and left alone. SHELL-011/0071
localised and kept it. It sat at the top of the page and appeared only once an
answer existed, i.e. while the learner was further down. The strip
carries the running state where the learner can see it, and
`LessonCompletion` carries the score at the end. `LessonPlayer.test.tsx`'s
"two elements carry the score line" expectation is now one, with the
reason in the test.

Verified:
- **Screenshots.** Playwright at 1440×900 (light) and 390×844 (light and
  dark), with `scrollWidth` equal to the viewport width.
- **Band.** The title, the strip's back arrow and the content's left edge
  line up.
- **Strip behaviour.** After answering two exercises and scrolling, the
  strip is stuck to the top and reads "2/8", with the bar a quarter full.
