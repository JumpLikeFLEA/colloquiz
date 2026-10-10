# 0102 — CNT-014: learner surfaces read lesson states from SQL

Status: **decided unattended** (CNT-014 ran `--no-approval`).

## Context

After CNT-012 (migration 055, docs/decisions/0099), the lesson page asked
SQL whether a lesson was open (`can_read_lesson`), but the course page and
the landing decided "free", "whole course free" and the CTA target from the
raw `in_free_sample` column. 055 added `course_lesson_states(course_id)` and
`lesson_state(lesson_id)`, returning `(lesson_id, access_level, state,
opens_at)` per lesson for the caller. This card moves every learner surface
onto them.

## Decision 1 — what reads what

- `getPublicLesson` calls `lesson_state` instead of `can_read_lesson`.
  `state = 'open'` is defined in 055 as `can_read_lesson()` itself, so the
  lesson page's behaviour is unchanged. The `not_available` result now
  carries `access` (`needs_sign_in` | `needs_entitlement`) for ANON-011; the
  page still renders one screen for both.
- `getPublicCourse` calls `course_lesson_states` beside its lessons read
  (`Promise.all`, so no extra serial round trip) and joins by lesson id
  (`attachLessonStates`, `lib/coursePageProgress.ts`).
- The landing's CTA uses the same `getPublicCourse` result.

## Decision 2 — "free" is the level, the CTA is the state

Two different questions, answered by the two different columns the state
function returns:

- **"Free" badge and "whole course free" pill**: about the course, so they
  read `access_level = 'anyone'` (0099 Decision 5: "a lookup, not a TS
  decision"). A `signed_in` lesson is free to any account but does not get
  the badge, and a course containing one does not get the pill. That is what
  the page showed before this card (055 pins `in_free_sample` to `anyone`),
  so nothing visible changes.
- **CTA target**: the lowest-ordinal lesson whose `state` is `open` for the
  caller (`firstOpenLesson`). For an anonymous visitor that is exactly the
  first `anyone` lesson, which is what the acceptance asks of the landing.
  A signed-in visitor may get a `signed_in` lesson, and a buyer lesson 1 of a
  paid course — both lessons they can actually play.
- **CTA label**: "Start the course" when every lesson is `open` for the
  caller (`allOpen`), otherwise "Start the first free lesson". Keeping the
  old `allFree` test here would tell a buyer of a paid course "first free
  lesson" while linking to a paid one. For an anonymous visitor `allOpen`
  equals `allFree`, so their page is unchanged.

Options considered for the label: (a) keep `allFree` — mislabels a buyer's
CTA; (b) a third string for "continue" — new copy and a visible change, a
`--no-approval` stop; (c) **chosen**, `allOpen`.

## Decision 3 — a missing state row throws

Every lesson the course page lists, and every lesson `getPublicLesson`
reaches past its metadata check, is "listed or readable by the caller",
which is 055 §4's row rule. A lesson with no state row means RLS and the
state function disagree. That throws, following `getPublicLesson`'s
existing "can_read_lesson true but no version row" precedent, rather than
rendering a guessed state.

## Not changed

- `in_free_sample` is still read by authoring code
  (`lib/courseAuthoring.ts`, the editor toggle and its route). AUTH-009
  replaces those; the column drop follows (0099 Decision 2).
- No row shows a lock or a "sign in" mark: the paid preview and the sign-in
  prompt are ANON-011 and M3 work, not this card.

## Revisit if

- ANON-011 renders the sign-in state (it consumes `access`).
- The partner wants `signed_in` lessons badged as free, or a course whose
  lessons are all `anyone` or `signed_in` to show the pill: change the two
  `accessLevel === "anyone"` lookups, nothing in SQL.
- COH-002 fills `opens_at`: a cohort lesson that is not yet open will then
  need its own row treatment on the course page.
