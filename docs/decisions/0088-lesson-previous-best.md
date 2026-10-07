# 0088 — A lesson shows the learner's best score on return

## Context

Owner report, 2026-10-07: "Signing in after completing the lesson resets
lesson's results." The player keeps answers only in component state
(`LessonPlayer`'s `results`, initialised empty), so the page that
`/auth/callback?next=` returns to is a blank lesson. The attempts themselves
were not lost: ANON-013 (#137) drove the same-browser path with email
sign-in and found the `lesson_attempts` row and "Best: 63%" on the course
page. That run used email, not the Google hop.

Options put to the owner: (A) show the best score on the lesson page, with
the exercises fresh for an optional retake; (B) restore every answer as it
was left, which touches all five renderers; (C) both. **The owner chose A.**

## Decision 1 — the server's figure is not enough

Read from the code, then confirmed in a browser (below): after a sign-in
from the end of a lesson, page.tsx renders BEFORE the player's mount-time
flush uploads the anonymous attempts (LessonPlayer `recordSignedInAttempt`,
0068 Decision 6). A note fed only by `get_course_attempt_summary` would be
missing on exactly the page the owner described.

So the shown value is the higher of:

- **the server's best**, the same `get_course_attempt_summary` →
  `bestScoreForLesson` the course page uses. The lesson page reads it for a
  signed-in learner; a failed read shows no note instead of failing the
  page;
- **the local best**, `bestPercentForVersion` (`lib/lessonPlayer/
  previousBest.ts`, unit-tested), which mirrors migration 050's formula
  over the local attempt store for the current lesson version.

The local value is read once per page load, keyed on `attemptId`, before the
flush empties the store, through `useSyncExternalStore` with a null server
snapshot. The server has no localStorage, so hydration matches the server
HTML and the client then fills in the local value.

Where the server holds some blocks and the store others for the same
version (a partly failed upload), the two partial figures are compared, not
merged. This is an edge case, accepted.

## Decision 2 — what is shown, and to whom

A note at the top of the lesson column, at reading width: "**Your best:
N%** Answer again to try to beat it. Your best score is kept." English,
like all lesson chrome (0080 Decision 5). The exercises stay unanswered;
answering again never lowers the shown best (docs/handoff.md, "Display the
best score, always").

Signed-in learners only, which is the reported case. An anonymous learner
who reloads a lesson also has a local best, and could get the same note.
That changes the anonymous experience, which nobody asked for, so it is left
for the owner to decide.

N is the course page's figure: earned over possible across the blocks
attempted, so one wrong answer out of five exercises reads "0%". That matches
the course page and is not changed here.

## Verification

- `npx vitest run lib/lessonPlayer/previousBest.test.ts`: 6/6.
- `LessonPlayer.previousBest.test.tsx`: 6/6, including the case this exists
  for (local attempt, signed in, no server figure → "Your best: 75%", still
  shown after the flush empties the store).
- Browser (scratchpad `best-check.mjs`, dev server against the hosted
  project, Admin-API test user deleted afterwards along with its rows), at
  390px. Answered one exercise of `auth003-smoke-test/one-of-each-item-type`
  anonymously: local store `[["q3",0,2]]`, no note. Signed in through
  `/login?next=<lesson>`: back on the lesson, "Your best: 0%" shown. The
  store then emptied and the note stayed. After a reload the note came from
  the server, with `lesson_attempts` `[{"block_id":"q3","earned":0,
  "possible":2}]` and the course page reading "Best: 0%". A signed-in visit
  to an unattempted lesson showed no note, and there were no console errors
  beyond the existing report-only CSP notice.

Not verified: the Google hop itself (it needs a real Google account). The
code path after `/auth/callback` is the same.

## Budget

`npm run budget`, temporary routes as in 0080/0086, fresh build:

| route | before (10827d5) | after (this change + 671e514) |
|---|---|---|
| `/` | 178.0 | 178.0 |
| `/courses/auth003-smoke-test` | 171.7 | 171.7 |
| `/courses/auth003-smoke-test/9` | 263.9 | 264.5 |
| `/courses/auth003-smoke-test/one-of-each-item-type` | 292.6 | 293.2 |

The before column is 0086's after-measurement. 671e514 (0087) was not
measured on its own: it adds a `lib/authRedirect` import to
`RegistrationOffer`, which the lesson page loads statically, so the +0.6 KB
is the two changes together, split between them unknown. Both lesson routes
were already above their 260/290 targets (0079).

## What would make us revisit it

- The owner wanting the answers themselves back (option B).
- The owner wanting the note for anonymous learners too.
- "Your best: 0%" reading as discouraging in practice: then change what the
  figure covers (all exercises, not only attempted ones) on the course page
  and here together.
