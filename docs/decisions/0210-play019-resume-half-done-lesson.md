# 0210 — PLAY-019: a half-done lesson resumes where the course page says

Status: decided unattended (`work on next --no-approval`), 2026-11-02. Issue #268.

## Context

0143 counts an exercise as answered once it has an attempt; the course page
reads that through `lesson_completion()` (075). The player counted only the
current visit (`sessionProgress`, `lib/lessonPlayer/session.ts`), so a learner
who answered 3 of 6 exercises and came back read "6 exercises left" while the
course page said "3 of 6 exercises".

0088 chose option A for a returning learner: show the best score, keep the
exercises empty, do not restore answers (option B). This card revisits 0088
for the answered SET only.

## Decisions

1. **The rule is `lesson_completion()`'s per-version half.** An attempt counts
   only for the version it was made on, and only for a block that version's
   document holds as an exercise (075, 0147 Decision 2). Best per block by
   earned / possible (the 050 order). `lib/lessonPlayer/answeredBefore.ts`
   (`earlierAnswers`, `withEarlierAnswers`), unit-tested.
2. **Sources.** Signed in: the learner's own `lesson_attempts` rows for the
   played version, read in page.tsx through the owner-read policy (048,
   `getLessonVersionAttempts` in `lib/courseAttempts.ts`), beside the summary
   read; a failed read counts nothing. Everyone: the local attempt store as it
   was at page load (the 0088 read-once pattern, now caching the attempts
   rather than a percentage), joined with the server rows. No migration.
3. **No carry-over across a republish.** After a republish the player counts the
   new version only. Telling an unchanged exercise from a changed one would mean
   reading superseded versions' documents, which a learner cannot do
   (`lesson_versions: published content read`, 041), so it would need a new
   SECURITY DEFINER read, i.e. a migration. The course page can therefore still
   show an older version's completion or progress (0143 Decision 3) while the
   player starts the new version at 0. Accepted: the exercises really are new
   to the player, and the course page's figure is frozen on purpose.
4. **What the player shows.** The strip and the completion card count the
   union of earlier answers and this visit. An exercise answered before and not
   yet in this visit gets a muted "Answered before" beside its pill, on the
   pill's line (no added height when it appears after hydration). Inputs stay
   empty; answering again works as before. 0088's option B stays declined.
5. **Which score the card shows.** The union's score, best per block (so a
   worse answer now never lowers a block), and never below 0088's figure
   (server best joined with the local best). When 0088's figure is the higher
   one, it may come from an older version, so the "earned of possible" line,
   which describes the union, is left out. The strip's percent is the same
   figure. The answer review and the `lesson_complete` funnel event stay on
   this visit's own results.
6. **Anonymous learners get the answered set too**, not only signed-in ones:
   the card's acceptance names both. The 0088 "Your best" note itself stays
   signed-in only (0088 Decision 2).

## Measured

Local stack, `next start` build, system Edge, 2026-11-02.

- `npm run budget`, before (this card stashed) and after:
  `/courses/future-imperfect/true-or-false` (the free lesson) 257.0 → 259.3 KB
  of 260; `/courses/future-imperfect/applied-practice` 284.7 → 287.0 KB of 290.
  Every other route unchanged. `/runs/c0050000-0000-4000-8000-00000000f1a1`
  reads 180.8 KB of 179, OVER both before and after (as in 0209); not touched
  here. The first "after" build crashed (`Next.js build worker exited with code:
  3221226505`); the retry built. The +2.3 KB is more than the code added would
  suggest and leaves 0.7 KB of headroom on the free lesson: not traced.
- Half-done lesson (`applied-practice`, 3 of its 6 exercises answered;
  scratch Playwright script), `scrollWidth/innerWidth`:
  - anonymous, 3 attempts in the local store: 360/360 and 1280/1280, strip
    "3/6", "Answered before" ×3, card "3 exercises left".
  - signed in, a throwaway local user with 3 `lesson_attempts` rows: 360/360
    and 1280/1280, the same strip, marks and card. User and rows deleted
    after (`lesson_attempts left 0`).
  - `npm run viewport360 --expect="Applied practice"`: 360/360.
- Unit: `lib/lessonPlayer/answeredBefore.test.ts` 8/8 (none, some, all,
  republish with a changed exercise, no version). Component:
  `LessonPlayer.answeredBefore.test.tsx` 5/5 (2/4 → complete after the other
  two, the mark clears on a re-answer, anonymous store, another version, the
  floor at the learner's best).
- Not measured: a phone, an in-app browser, dark mode, the card in its
  completed state in a browser (covered by the component test).

## What would make us revisit

- The partner republishing often enough that learners lose progress in the
  player: then a SECURITY DEFINER read that carries over unchanged exercises
  (same block id, same item) across versions.
- The owner wanting the answers themselves back (0088 option B).
- The free lesson's budget: 0.7 KB of headroom left.
