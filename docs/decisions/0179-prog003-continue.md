# 0179 — PROG-003: "Continue" on the course page and /my

Status: decided unattended under `work on next --no-approval`, 2026-10-19
(issue #193). Owner review at the Verify column.

## Context

After five lessons the course page still read "Start the first free lesson" and
opened lesson 1 (issue #193). `/my`'s course card had no continue action, and an
anonymous visitor's course page ignored the attempts held in their browser.
PROG-004 / 0143 define "complete"; PROG-006 (075) implemented it in SQL, so
`get_course_attempt_summary` now returns `complete` per lesson.

## Decisions

1. **The rule is one pure function**, `pickContinueLesson` (`lib/continueLesson.ts`),
   used by the course page, `/my` and the anonymous variant.
   - Candidates are lessons whose SQL `state` is `open`. A cohort learner's
     `scheduled` lessons, and any sign-in or paid lesson the caller cannot open,
     are never targets. Entitlement stays in SQL; the function only filters on
     the state SQL returned.
   - Target = the first candidate that is not complete. A partly answered lesson
     is not complete (0143), so it is where the learner left off. A learner who
     skipped lesson 3 and finished 4 is sent back to 3: that is "the first open
     lesson not yet attempted" read literally.
   - All candidates complete: the last one the learner opened, else the last
     candidate.
2. **When the CTA appears ("once any lesson is attempted").** The learner is
   engaged when some lesson is complete or partly answered. Before that the
   first-lesson CTA is unchanged. Opening a lesson with exercises and answering
   nothing does not engage. (An assumption the card did not settle; revisit if
   the partner wants "Continue" from the first open.)
3. **"Last opened" for a signed-in learner comes from `lesson_opens`** (056,
   owner-read RLS), via `getLastOpenedLessonSlug`, read only when every candidate
   is complete (`needsLastOpened`). No schema change, no migration. A failed
   read is logged and falls back to the last candidate.
4. **Anonymous: the browser decides.** `AnonymousProgress.tsx` (client) reads the
   attempt store and a new opens store and applies the same rule through
   `anonAttemptSummary`. It is mounted only for a signed-out visitor, and only
   over lessons SQL already opened to them.
   - Complete = distinct stored blocks for the lesson's CURRENT published version
     >= `published_item_count`. A republish resets an anonymous visitor's lesson
     (the server path does not); the local store holds no document to count
     against.
   - **New localStorage key `alliengll.opens.v1`** (`lib/lessonPlayer/anonOpens.ts`):
     version ids opened here, oldest first, capped at 200. Needed because a
     lesson with no exercises produces no attempt, and without an open record
     "next unattempted" would stop on a theory-only lesson for good, which is
     the failure the card cites. Written by the player's mount for a
     signed-out learner (`LessonPlayer.tsx`), no request. It is NOT uploaded on
     sign-in (no RPC exists); 0143 already accepts that a theory-only lesson
     read anonymously counts once reopened while signed in. `alliengll.attempts.v1`
     and its migration are untouched.
   - `getPublicCourse` now also returns `versionIds` (slug to published version
     id), already selected and not previously passed on.
5. **No layout shift is bought by omission, not by reserving space.** For an
   anonymous visitor the server HTML is the ordinary first-lesson page. After
   hydration the CTA's text and href change on one truncated line (a CTA's
   height cannot change), and a ✓ appears absolutely positioned on the row's
   number tile. An anonymous visitor therefore gets no score pill, no
   "N of M exercises" pill and no hero progress tiles: each would insert content
   into the flow, and reserving space would add blank area to every first visit.
   The card asks for "the same CTA and the per-row ✓" only. Signed-in learners
   keep all of those from the server.
6. **`/my`'s card** keeps whole-card clickability with a stretched link (the
   title's `::after`), so the Continue action can be a second real link above it
   (two `<a>` cannot nest). The focus ring moves to the card via
   `has-[:focus-visible]`.

## Not decided here

- Telegram/e-mail nudges to continue (COH-010..013 / 0140) are separate.
- Showing the anonymous visitor's score and in-progress pills (see 5).

## Measured

All printed output is in the card's evidence comment (#193). Budget, local
stack, before to after: course page 172.8 to 175.3 KB (limit 182), cohort
fixture 172.8 to 175.3 (181), `/my` 174.4 to 174.4 (180), the two lesson routes
+0.3 KB. The cohort fixture is measured signed in, so a signed-in learner pays
the same +2.5 KB. The cause is not established. Hypothesis: `LessonListItem`
imports the client tick, so its module joins the page's client chunk even when
it renders nothing. Nothing was measured to confirm it.

## Revisit if

- The 2.5 KB on the signed-in course page starts to matter: load the tick
  lazily, or render it only from the anonymous branch.
- Anonymous visitors on a republished course lose their ✓ often enough to
  matter (decision 4).
- The partner wants "Continue" to appear before any answer (decision 2).
