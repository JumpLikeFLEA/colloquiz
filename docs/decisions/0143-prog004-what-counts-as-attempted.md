# 0143 — PROG-004: when a lesson is complete

Status: decided by the owner, 2026-10-16. Implementation is not part of this
card; it is split out below.

## Context

Signed-in run on Future Imperfect, 2026-10-12 (issue #192):

1. Lessons 4 and 7 have no exercises, so they never produce a
   `lesson_attempts` row (048). Course completion ("every lesson attempted",
   docs/handoff.md) is unreachable for that course.
2. A lesson score covers answered blocks only
   (`lib/lessonPlayer/session.ts` `scoreSession`; `get_course_attempt_summary`,
   050, sums the best attempt per answered block). Lesson 5 showed 75% and
   counted as attempted after 2 of 25 exercises.
3. The RU course label "пройдено уроков" (completed) was read against a count
   that meant "has any attempt" (063: "completed = attempted").

`lesson_opens` (056) records, per signed-in learner and lesson,
`first_opened_at` / `last_opened_at`, written only by `record_lesson_open`.
056 states "No backfill: nothing recorded lesson opens before this migration."

## Options considered

Theory-only lessons: exclude from the total; a "Mark as read" control; count on
reaching the end; a self-check counts. Partial attempts: best-of-answered with
"in progress"; score over the whole lesson; leave as is. Label: "пройдено" vs
"начато" or another word.

## Decision

1. **Rule.** A lesson with exercises is complete when every exercise has
   been answered at least once (any version, see 3); `lesson_opens` is not
   consulted. A lesson with no exercises is complete when the learner has a
   `lesson_opens` row. Answering implies opening, and requiring an open row for
   exercise lessons would also drop every attempt migrated from anonymous
   play, since opens are never recorded for anonymous learners. No new table or
   write path.
2. **In-progress lessons do not count.** A lesson with some but not all
   exercises answered is not counted in "N of M", the course average, or
   homework done (TCH-005). Its score is shown only once it is complete; until
   then its tile reads "N из M заданий" with no score, matching the player's
   completion card (0079 D7).
3. **Republish.** A lesson completed on any version the learner played stays
   complete after a republish. The exercise count for that test is taken from
   that version's own document, because `lessons.published_item_count` covers
   the current version only.
4. **Label.** RU stays "пройдено уроков". EN "lessons attempted" becomes
   "lessons completed". Files: `app/(english)/courses/[courseSlug]/courseCopy.ts` lines 78 and 122,
   `myCopy.ts` lines 47 and 70, plus a new string for the in-progress tile.
5. **Same rule elsewhere.** The 063 learner roster and the Studio course stats
   (065) follow it.

## Consequences (to be verified by the implementing card)

- SQL: the course progress read path (`get_course_attempt_summary`, 050), the
  roster (063), the learner detail (064) and `course_stats` (065) need the new
  definition (`lesson_opens` is read only for zero-exercise lessons). This is a migration, filed as PROG-006, written by a
  session and applied by the owner.
- No backfill. A theory-only lesson read before 056 was applied, or read
  anonymously, counts once reopened while signed in: accepted.
  `lesson_opens.first_opened_at` stays a true first-open time (AUTH-011 reads
  it).
- TypeScript: the course page, `/my`, the lesson tile and the completion check
  use the SQL result; completeness is not recomputed client-side
  (entitlement-style single-source rule).
- Lesson 5 would read "2 из 25 заданий" instead of "Лучший: 75%" until
  finished.

## Revisit if

- Learners who open a lesson and bounce are shown as completing zero-exercise
  lessons in a way the partner finds misleading (opening is a weak signal).
- Homework (TCH-005) needs "attempted but unfinished" as a distinct state.
