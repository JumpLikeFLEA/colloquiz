# 0249 — TCH-019: one teacher check for the linked-student readers

Date: 2026-11-27. Card: TCH-019 (#339). Migration: `113_teacher_readable_lessons_teacher_check.sql`.
Verify: `supabase/verify/113_teacher_readable_lessons_teacher_check.sql`.

## Context

`_teacher_readable_lessons(teacher, student)` (080) decides which lessons a teacher may read a linked
student's answers for. It asked for an active link (`_teacher_linked`) but not `_is_teacher`, while
messages and ask-the-teacher (079, 081, 083) ask for both. 0236 flagged the gap.

Shown on the local stack before the change (verify 113, run against 112): a user with no admin role, no
`course_editors` row and no `author_seats` row, still linked and still the owner of an assignment of
lesson L1, read `1/1/1/1/0` (attempts / scores / assigned lessons / written answers / notebook entries).
The notebook was already 0 because PROG-012 checks `_is_teacher` itself (0236).

## Options

- A. Add `_is_teacher(p_teacher)` to `_teacher_readable_lessons`. One place; every caller inherits it.
- B. Add it to each reader. Five places, and the next reader built on the helper could forget it, which
  is how this gap arose.

## Decision

A. One added `AND` in the helper; nothing else is re-emitted.

`_is_teacher` (082) is true for an admin, any `course_editors` row, or any `author_seats` row, expired or
not, so a lapsed seat keeps reading (0155) and an editor without a seat keeps reading.

Every caller of `_teacher_readable_lessons` at this time, and the effect:

| caller | migration | effect |
|---|---|---|
| `linked_student_attempts` | 080 | an ex-teacher gets 0 rows |
| `linked_student_lesson_scores` | 080 | 0 rows |
| `linked_student_assigned_lessons` | 080 | 0 rows |
| `_writing_can_review` (linked route) | 109 | false: the answer leaves `writing_review_queue`, `save_writing_feedback` answers `forbidden` as for an unknown id. The cohort route (`can_edit_course`) is unchanged |
| `linked_student_notebook` | 112 | none: it already checked `_is_teacher`; that check is now redundant and kept |

After the change (verify 113): the ex-teacher reads `0/0/0/0/0` from every reader, for both seeded
students. Controls read exactly what they read before the change: an editor `2/2/0/1/1`, an active seat
`1/1/1/1/1`, a lapsed seat `1/1/1/1/1`; a lapsed seat can still save feedback.

Applied to hosted through the hosted-apply gate on 2026-11-27 (history 112 to 113); verify 113 on hosted
printed the same counts and "PASS cells 15", with no seeded row left.

## What the student sees

Checked in verify 113, not assumed:

- A student whose only teacher stopped being one: `writing_task_state` returns `practice` and
  `submit_writing_answer` returns `no_route`, as 0225 says. This was already so before 113:
  `_writing_route` asks `_ask_teacher_allowed`, which requires `_is_teacher` (083). A student who also
  has a real teacher keeps the `linked` route.
- `/my`'s teacher list (`my_teachers`, 076) still lists the ex-teacher, because the link is still active.
  Reported as it is; 113 does not change it. Their conversation shows as closed (079/092 `open_now`
  requires `_is_teacher`).

## Revisit if

- A new reader of a linked student's data is built that does not go through `_teacher_readable_lessons`
  (`homework_results`, 106, is one today: it checks the assignment's teacher only; proposed as its own
  card).
- `/my` should hide a teacher who is no longer one, or such links should end on their own.
