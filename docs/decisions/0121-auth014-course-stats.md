# 0121 — AUTH-014: course stats

Status: Decision 1's migration and Decision 6's legal text were approved by
the owner on 2026-10-11 (#179). The rest was **decided unattended**
(AUTH-014 ran `--no-approval`) and is open to correction.

## Context

AUTH-014 shows the author which lesson loses learners and which exercise is
broken or too hard, without identifying anyone (0109 Decision 9). An average
is shown only when at least 5 distinct learners attempted the block. The
counts need no threshold, because the author already sees per-learner opens
and completions (0109 Decision 8, 063, 064).

`lesson_attempts` (048) holds one row per attempt × block, keyed to a
`lesson_version_id`, and is readable by its owner only. A lesson is
republished as a new version, and blocks keep their `id` across versions.

## Decision 1 — one read RPC, migration 065 (owner-approved)

`course_stats(course)` is STABLE and SECURITY DEFINER, and returns no rows
unless `can_edit_course(course, auth.uid())`. EXECUTE goes to
`authenticated` only. It returns one row per practice block of each
published, non-archived lesson, plus one row with the block columns NULL for
a lesson that has no practice block. The 5-learner threshold is applied
there: `block_avg` is NULL below it. `block_learners` is still returned
below the threshold, because a count of attempts is not a score. There is no
table, so `delete_my_account` is not re-emitted. Learners are accounts with
`profiles.deleted_at IS NULL`, as in 063 and 064.

Evidence (local stack, seeds rolled back, AUTH-014's evidence comment):

| block | learners | `block_avg` |
|---|---|---|
| seeded with 4 learners | 4 | NULL |
| seeded with 5 learners | 5 | 0.8 |

An editor of another course and a non-editor learner of the course got 0
rows. `anon` has no EXECUTE.

## Decision 2 — the first attempt per learner, not the best (owner-approved)

Learners see an explanation after a wrong answer, and a retake is optional.
A learner's best score therefore drifts toward 100% and hides the exercise
that is too hard. The first attempt is the honest measure of difficulty.
This does not touch "display the best score, always" (docs/handoff.md),
which is about what the learner sees. Ties on `created_at` break on the
attempt id.

## Decision 3 — combining lesson versions (owner-approved)

An attempt on version V counts toward a block only when V's block with the
same id is identical JSON (`jsonb =`) to the published version's block. Two
consequences follow:

- Fixing an exercise starts its stats over. The broken exercise's scores
  must not hide the fix.
- Republishing a lesson to correct something else (a typo in theory, a
  different exercise) keeps every other block's stats.

Rejected:

- **The current version only.** Every republish would wipe every average.
- **The same block id across any version.** A fixed exercise would keep the
  broken one's scores.

Cost: any edit to the block counts, even a whitespace change in an
explanation. That is the price of not judging which edits matter. The page
says "Editing an exercise starts its average over."

## Decision 4 — "opened" follows 063's rule (*unattended*)

The card's acceptance names `lesson_opens` as the source for "opened". The
function instead counts a learner who has an open, an attempt or a voice
take in the lesson. That is 063's definition, which the roster and the
learner page already use.

Measured reason: on seeded attempts with no open rows, the page read
"Opened 1 · Attempted 7". This is a real case, not a fixture artefact. An
anonymous learner's attempts upload at sign-in (ANON-004), and no open is
recorded for the visit made before signing in. A funnel that shows more
attempts than opens reads as broken. The rule only adds learners
`lesson_opens` misses, so it never counts anyone who didn't open the lesson.

## Decision 5 — page shape (*unattended*)

`/studio/courses/[id]/stats` is reached from a "Stats" link in the course
editor header, for both self-paced and cohort courses. It has one card per
lesson: "Opened N learners · Attempted N learners", then one row per
exercise. Each row shows the prompt as plain text, the item type as the
lesson editor's raw type label, and the average as a whole percent with a
bar. Below the threshold the row reads "N learners · average shows from 5".
The averages are rounded on the page, not in SQL.

## Decision 6 — legal text (owner-approved)

Privacy 1.2 → 1.3:

- §5 "Course authors" gains the per-exercise average disclosure.
- The account-deletion section's "nothing else in the Service reads another
  learner's attempts" now excepts those averages, and says that deleted
  attempts stop counting.

Materiality under §13: not material, so a version bump only. The new use is
an aggregate that can't be traced to a person, gated at 5 learners. 0095's
"author sees learner activity" was material because it reversed an explicit
promise, and this change doesn't. 0095 Decision 1 also records that there
are no real accounts before launch.

## Known limitation

Someone who watches `block_learners` go from 5 to 6 can work out the sixth
learner's first-attempt score from the change in the average. The learner
page shows them who was last active. Rounding to a whole percent narrows
this but doesn't close it. 0109 Decision 9 chose a plain threshold, and
this card keeps that choice.

## What would make us revisit this

- An author reports a fixed exercise "losing" its stats after a cosmetic
  edit: compare a normalised block (without `explanations`) instead of the
  whole JSON.
- Differencing becomes a real concern, for example a cohort small enough
  that one new learner is identifiable: add noise, or bucket the averages.
- Anonymous attempts start reaching the server: the "signed-in learners
  only" notice and §5 change with them.
