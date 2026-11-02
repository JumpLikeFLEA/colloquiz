# 0209 — Course complete: the finishing moment and what comes next

PROG-008 (#267), worked under `--no-approval`, 2026-11-02. Every decision
below was taken unattended and is open to the owner's review.

## Context

Finishing a course's last lesson showed only "Back to course"
(`LessonCompletion.tsx`, before this card), and nothing in `app/` or `lib/`
marked a course complete. docs/handoff.md: "Completion is the product", and
revenue tracks new courses shipped, so a learner who has just finished one is
the best prospect for the next.

Per-lesson completion was already settled: `lesson_completion()` (0143), read
through `get_course_attempt_summary` (migration 075) for a signed-in learner
and restated for local data by `anonAttemptSummary` (0179). The "Continue"
target was settled too: `pickContinueLesson` (0179).

## Decisions

1. **A course is complete when it has at least one lesson and every listed
   lesson is `open` to the caller and complete** (`isCourseComplete`,
   `lib/courseCompletion.ts`). A lesson that is not open (a cohort learner's
   `scheduled` week, a sign-in or paid lesson) cannot be finished, so it keeps
   the course incomplete until it opens and is done. The card's acceptance
   line says scheduled lessons are "excluded until open". Two readings were
   possible: excluded from the set (the course would read "complete" in week
   1 of a four-week cohort, with "lessons 2 of 2" while six lessons were still
   to come), or excluded as a target (never offered as "next", and never
   complete, until it opens). The second was chosen. The first would show
   "lessons N of N" with lessons still to come, against handoff's "Completion
   = every lesson complete". An anonymous visitor who has done only a
   course's free sample therefore never sees "Course complete".
2. **What the page already holds, plus this session.** The lesson page passes
   the course's lessons and SQL states (from `getPublicCourse`, cached per
   request, which now also gives "Lesson N of M" in place of `getLessonNav` on
   this page: same rows, same order). A signed-in learner's summary is the
   server's. For an anonymous visitor, the card builds the summary in the browser from the
   local stores (the server snapshot is empty, so hydration matches). The
   lesson on screen is folded in from the session (`withSessionResult`):
   complete once every exercise is answered, or at once for a lesson with no
   exercises (0143), and its best score is never lowered. A signed-in learner
   whose summary read fails gets no course context. The card then behaves as
   before, rather than deciding completion from an empty map.
3. **"Next lesson" after an answered lesson is the first open lesson that is
   not complete**, other than the one on screen (`nextUnfinishedLesson`, over
   `pickContinueLesson`). When every other open lesson is complete there is
   no next lesson: `pickContinueLesson`'s fallback (the last opened lesson) is
   a "continue" target, not a "next" one. **The neutral card, shown while the
   lesson is unfinished, keeps the next lesson in course order.** A learner
   halfway through lesson 4 who never opened lesson 1 is not told "Next
   lesson: 1". The acceptance line names only the completion card.
4. **The course-complete card** keeps the marker-yellow frame of a completed
   lesson. It shows a "Course complete" pill, the course title, the two
   numbers as two tiles ("Lessons completed N of N", "Average score X%" over
   completed lessons; never blended), and this lesson's own score in a quiet
   line. Below those: "Next course: <title>" (the violet offset button), then
   Share and Back to course. **The course page hero shows the same state to a
   signed-in learner**: a "Course complete" pill beside the level, the two
   tiles it already had, and the next course and Share under the CTA.
   **An anonymous visitor's hero is unchanged.** Their progress is known only
   after hydration, and 0179 keeps local progress from moving the layout. A
   pill, a button row and the progress tiles would all insert content into
   the flow.
5. **The share card carries no score and no name** (the default the card
   asked for). The share URL is one per course (`/completed/<course>`), shared
   by every learner who finishes it, so it could not carry a score anyway
   without a per-learner URL. The share text carries no score either. Share
   uses `navigator.share` where it exists. Otherwise the link goes to the
   clipboard and the label says "Link copied".
6. **The share page is top-level, `/completed/[courseSlug]`**, not
   `/courses/<course>/complete`, where a static segment would shadow a lesson
   slugged "complete". It is a Server Component with no client JS: the course
   title and lead, one line, "Open the course". It follows the saved EN/RU
   choice with no toggle, as `/my` does (`pageLangForPath`). The share card is
   English: Telegram caches one preview per URL. It is public through the
   proxy already (only `/app`, `/studio` and `/my` are gated).
7. **"Next course" is the next listed, published course in catalogue order,
   wrapping round** (`nextCatalogueCourse` over `getPublishedCourses`). It is
   the first listed course when this one is unlisted (a teacher's course,
   0171), and none when there is no other. It does not skip courses the
   learner has already finished: the catalogue is small, and that would need
   every course's summary. The lesson page reads the catalogue on every load
   (one query, in parallel with the other reads), because an anonymous
   visitor's completion is known only in the browser. The course page reads
   it only when the course is complete.
8. **The course-aware card is a lazy chunk** (`CourseAwareCompletion.tsx`,
   `React.lazy`), loaded once the lesson is complete. While it loads, the
   completed lesson's own card shows without a CTA, so the target never
   flips. Bundled into the player, it put the free lesson at 260.9 KB of its
   260 KB budget (`npm run budget`, 256.7 KB before the card); lazy, the
   lesson is 257.0 KB.

## Measured

Local stack, `next start` build, system Edge, 2026-11-02.

- `npm run budget`, before (this card stashed) and after:
  `/courses/future-imperfect/true-or-false` (the free lesson) 256.7 → 257.0 KB
  of 260; `/courses/future-imperfect` 175.4 → 176.0 KB of 182;
  `/courses/future-imperfect/applied-practice` 284.4 → 284.7 KB of 290; new
  `/completed/future-imperfect` 176.0 KB of 183. Every other route unchanged.
  `/runs/c0050000-0000-4000-8000-00000000f1a1` reads 180.8 KB of 179, OVER
  both before and after; it is not touched by this card.
- 360px, `scrollWidth/innerWidth` (a scratch Playwright script driving the
  True/False lesson, then `npm run viewport360` with `--expect`):
  - anonymous, fresh store: 360/360, "Lesson complete" with "Next lesson:
    Applied practice" (lesson 2 not done, so the pick sends the learner to it);
    1280/1280.
  - anonymous, lesson 2 seeded in the local store: 360/360, "Course complete"
    with "Next course: COH-005 cohort fixture"; 1280/1280.
  - signed in (a throwaway local user with lesson 2 in `lesson_attempts`,
    deleted after; 0 users and 0 attempts left): 360/360 "Course complete";
    1280/1280.
  - course page hero, signed in after that lesson: 360/360 EN ("Course
    complete"), 360/360 RU ("Курс пройден"); signed out 360/360 with no pill.
    The first RU run read 372/360: the "Next course" label was `truncate`, and
    a nowrap label's width became the hero column's minimum. It now wraps.
  - `/completed/future-imperfect`: 360/360 EN and RU.
- Share: with `navigator.share` removed, a click copied
  `http://localhost:3100/completed/future-imperfect` and the label read "Link
  copied". Desktop Edge has `navigator.share` (the Windows share sheet), which
  headless cannot show, so that path is not observed.
- The share card: the `/completed` page's og:image answered 200 `image/png`
  (61,633 B), with the "Course complete" pill, level, title and lead and no
  score. Measured on a course whose cover had been set for a moment to an
  undecodable WebP, then restored: every local fixture cover fails Satori
  ("Unsupported image type: unknown"), the existing course card included, so
  a real cover is not measured here.
- Not measured: a phone, an in-app browser, dark mode, the course hero at
  1280, a cohort course's finished state in a browser (covered by unit tests).

## What would make us revisit

- A catalogue big enough that "next course" should skip finished ones or
  follow level.
- An owner call that a cohort learner should see "complete" at the end of the
  open weeks (Decision 1's other reading).
- A wish to show the score on the share card, which needs a per-learner URL.
- The anonymous hero gaining a reserved-space design (0179) that could carry
  the finished state.
