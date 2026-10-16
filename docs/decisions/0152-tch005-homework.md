# 0152 — TCH-005: homework, a teacher assigns a lesson or a course and tracks it

Status: built; migration 080 written, not applied to the hosted project (applied
to the local stack only; `supabase/verify/080_homework.sql` printed `TCH-005
PASS` there). Decided unattended under `--no-approval`; each call below is one
the owner can overturn.

## Context

docs/decisions/0141 Decisions 12–14: a teacher assigns a lesson or a whole
course to linked students and/or groups; a group's open homework reaches a
student added later; "done" is PROG-004's complete lesson (0143), at any time;
a due date never locks. 0144 Q5 and privacy 1.5 §5: a teacher who assigns one
lesson reads answers for that lesson only. 0149 gave groups, 0150 the answers
reader this card widens, 0143/0147 `lesson_completion()`.

## Decisions

1. **One definition of "who receives it".** `_homework_recipients(teacher,
   student)` (NULL = any; both NULL returns nothing, so a NULL `auth.uid()` can
   never become "everyone") returns (assignment, student) pairs: a direct
   target, or a member of a targeted group right now, with the teacher's link
   to them active and the profile not deleted. Group membership is read live,
   which is what makes homework reach a student added later. Every reader below
   calls it; no page re-derives it.
2. **"Open" means "not deleted".** 0141 Decision 12 says a student added to a
   group gets the group's *open* homework. There is no closed state in the
   acceptance; a past due date does not close anything (Decision 14). A student
   added after the due date therefore sees "Was due …". A `closed_at` is a
   later card if a teacher asks.
3. **A link that ends takes the student's direct targets, and relinking does
   not bring them back.** A trigger on `teacher_student_links` (the 077
   pattern), because privacy §9 says homework naming the learner is removed
   when the link ends. A group target needs no cleanup: 077's trigger already
   removes the student from that teacher's groups. The assignment itself stays,
   with its other targets.
4. **Content.** The course must be published or one the caller edits (the
   acceptance wording); a lesson must be a published, non-archived lesson of
   *that* course. A course the caller neither edits nor sees published answers
   `course_not_found`, the same as one that does not exist. Consequence, stated
   so it is not a surprise: an assignment of a *draft* course the teacher edits
   is allowed, but the student does not see it (`my_homework` joins to
   published courses) and Studio marks the row "Course not published: students
   don't see it".
5. **The due date is a DATE.** No time zone, so "Due 20 Oct" means the same day
   for everyone. SQL never reads it (the verify script asserts that a 2020 due
   date leaves `_lesson_access_at` at `open`). The wording "Was due" is chosen
   in TypeScript by comparing calendar days in UTC (`dueState`): a learner far
   from UTC may see it a few hours early or late. That is wording, not access.
6. **The reader is widened, not duplicated.** `_teacher_readable_lessons(
   teacher, student)` = every lesson of a course the teacher edits (078's rule)
   plus the lessons covered by an assignment the student receives from that
   teacher: a course assignment covers the course's lessons, a lesson
   assignment covers that lesson only. 078's `linked_student_attempts` and
   `linked_student_lesson_scores` are re-emitted to join it; their columns and
   order are unchanged and 078's verify script still passes. A new
   `linked_student_assigned_lessons` titles the lessons the teacher does not
   edit so the Studio Answers section can list them.
7. **Done and best.** Done is `lesson_completion()` (075), untouched. A lesson
   assignment is done when its lesson is complete; a course assignment when
   every published, non-archived lesson of the course is complete; an
   assignment whose scope is empty (the lesson was archived since) is never
   done. A course assignment's best score is the average over its completed
   lessons that have a score, the handoff's second progress number; it is not
   blended with completion.
8. **Learner reads.** `my_homework()` is plpgsql so a NULL `auth.uid()` returns
   before `lesson_completion(NULL, …)`, which would otherwise mean "all users"
   (075 header). The access state of an assigned lesson is
   `_lesson_access_at`'s, returned as is; assigning a lesson grants nothing
   (verified: `can_read_lesson` stays false for an entitled lesson, and flips to
   open only after a grant).
9. **Assign creates; update changes only the due date and the note.** Content
   and targets are fixed after creation: to change who gets it, delete and
   assign again. This keeps the targets' constraints (the composite FKs to the
   teacher's own groups) the only place that rule lives, and no
   add/remove-target RPC to protect. Revisit if teachers ask.
10. **Studio.** One dialog (`AssignHomework.tsx`) used from the course editor
    (course fixed), a linked learner's page (student preselected) and a
    group's page (group preselected); `/studio/homework` lists each assignment
    with, per recipient, Done / "k of n lessons" / "Not yet", the best score
    and the last activity; a "Homework" nav entry. The course editor reads the
    section in a try/catch and omits it when the read fails, so an editor still
    renders against a database without 080.
11. **The lesson pill is matched by slug.** `PublicLesson`'s `not_available`
    states carry no lesson id, and the pill belongs on those too (the access
    state is the point of the paid page). `homeworkForLesson` matches
    `courseId` and `lessonSlug`; a course assignment covers every lesson.
12. **A linked student with no activity is no longer a 404.** The learner page
    404'd when roster, lessons and recordings were all empty (AUTH-013's rule
    for a non-linked id). Homework links to students who have not started, so
    that rule now applies to non-linked ids only; for a linked one the label is
    the link's.
13. **Export and deletion.** `my_homework_export()` (what currently applies,
    teacher name and content titles, no other recipient) joins the account
    export; `delete_my_account` is re-emitted from 079 with two DELETEs (the
    caller's assignments, and their direct targets as a student).

## Not in this card

Telegram pings for homework (TCH-013), homework due dates on the calendar and
`.ics` feed (COH-015, COH-016), "Ask the teacher" (TCH-006), `closed_at`, and a
DB rate limit on assigning (none was asked for; assigning writes at most 600
rows per call).

## Evidence

- `supabase/verify/080_homework.sql` (run on the local stack): printed `TCH-005
  PASS`; 078, 079 and 077's verify scripts re-run after 080 printed their
  `PASS` lines.
- Browser checks and 360px numbers are in the `docs/ui-decisions.md` entry.
- Budget (`npm run budget`, a local stack seeded by `scripts/seed-local-fixtures.ts`,
  clean `.next`, HEAD vs this change): `/my` 171.5 KB before and 171.5 KB after
  (budget 180); `/courses/future-imperfect/true-or-false` 256.0 KB before and
  256.0 KB after (budget 260). Every new component on those routes is a Server
  Component, so no client JS was added. The first baseline, run against the
  hosted project in `.env.local`, FAILed on `/my` and `/runs` (no seeded
  sign-in user or fixture there); the figures above are from the local stack.

## What would make us revisit this

- A teacher needs to change targets or content without deleting (Decision 9).
- Teachers want homework to stop at a date for group newcomers (Decision 2).
- The UTC "Was due" boundary confuses learners far from UTC (Decision 5).
- OPS-025/TCH-007 decide a lapsed seat's read access to assigned answers.
