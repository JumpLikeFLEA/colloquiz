# 0244 — PROG-020: a linked teacher reads a student's notebook

Status: built 2026-11-26 (#335). No migration: the read is 112's `linked_student_notebook(p_student)`
(0236 section 5, pick 2). Settled inputs: 0235 "The teacher's view", 0236, 0237 (the drafted
link-statement bullets).

## Decisions

1. **One read, no TypeScript access rule.** The learner page calls `linked_student_notebook` only when
   the caller is linked (the TCH-003 pattern); the function itself decides every row
   (`_is_teacher`, `_teacher_linked`, `_teacher_readable_lessons`, copied rows only, the baseline rule).
   `lib/notebook/teacherView.ts` only reads and groups its JSON. It also drops an `own` row if one ever
   arrived, so a later change to the function would still not draw one.
2. **Placement: a "Notebook" section right after "Answers"**, one card per course, one native
   `<details>` per lesson (LinkedAnswers' frame), newest lesson first. Inside: AI summaries (kind, time,
   text, goal or next step), phrases merged by key inside the lesson with "× N", then fixes. No client JS.
3. **The "AI feedback can be wrong. It is not a grade." line is in the section's lead** (0236 pick 2,
   privacy section 12). A summary the function leaves out leaves no placeholder.
4. **Snapshot titles**, not current ones: the teacher view reads no lesson table; the course and lesson
   names are the ones copied with the entry.
5. **A failed read is a dashed "couldn't be read" box**, never an empty notebook; an empty answer is
   "Nothing in their notebook from lessons you can read yet."
6. **Link statement** (`lib/teacherLinks.ts`): 0237's two bullets, verbatim, EN and RU, directly after
   the first bullet: written answers, then the notebook. `cannot` stays true: own notes are named as
   excluded, and nothing else in the account is added.
7. **`/my`'s teacher copy is left as written** (the card asks for a report, not a rewording; see below).

## The /my copy, checked against the final statement

- `teachersLead` ("A teacher sees your answers and scores while you are linked." / RU) — still true, but
  incomplete: it names neither written answers nor notebook entries.
- `leaveConfirm` ("They will no longer see your answers or scores." / RU) — true (after leaving they see
  none of it), incomplete in the same way.
- The statement's own `leave` line ("Then they can no longer see your answers or scores.") — the same.
None is false, so none was changed here. Reported on #335 for the owner.

## Tested

- `lib/notebook/teacherView.test.ts` (4): grouping, newest first, a phrase said twice merged with the
  newest quote; an `own` row never drawn; empty lists vs an unexpected shape (null); rows that do not read.
- `lib/teacherLinks.test.ts`: both new bullets, both languages, in place before "write to you…".
- `lib/studioGuide/articles.test.ts` passes with the updated "Learners and stats" article.

## Measured

Local stack, `next build` + `next start`, Edge, `prog007-learner` (said and fix in Week one and Week
four, a `first` summary in Week one, a `final` in Week four with Week one as baseline, an own note in
another course, and a seeded Cyrillic own note in Week one), four scratch users, deleted afterwards.

| Caller | Notebook section | Lessons | Phrase | Fix (wk 1) | First summary | Final summary | Own notes |
|---|---|---|---|---|---|---|---|
| T1: linked, edits the course (control) | 1 | wk 4, wk 1 | yes | yes | yes | yes | **no** |
| A2: edits the course, not linked | 0 | — | no | no | no | no | no |
| T3: linked, assigned Week four only | 1 | wk 4 | yes | no | no | **no** (baseline not readable) | no |
| T3 after Week one is assigned too (control) | 1 | wk 4, wk 1 | yes | yes | yes | yes | no |
| T1 after the link ended | 0 | — | no | no | no | no | no |

The RPC called directly as A2 returned `{"entries": [], "summaries": []}`; as T1 (control) 3 entries
and 2 summaries. A linked student with no entries shows the empty box.

360px (document and Studio's `main`): 360/360 and 360/360 in every row above and for the empty
state; 1280/1280 too. Join and invite pages with a real token and the longer statement
(`npm run viewport360 --expect` a new bullet): `/join` signed out EN, RU, signed in EN, RU, and
`/invite` signed in, all 360/360. `npm run budget` before / after: `/join/0…0` and `/invite/0…0`
176.0 / 176.0 KB of 183 (those budget routes use an all-zero token, which does not render the
statement; the statement is server-rendered text).

## What would make us revisit this

- Teachers asking what a missing final summary means (0236's first revisit line).
- The owner rewording `teachersLead` / `leaveConfirm` to name written answers and the notebook.
