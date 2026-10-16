# 0148 — TCH-001: a learner links to a teacher

Status: built; migration 076 written, **not applied**; its verify script
(`supabase/verify/076_teacher_links.sql`) written, **not run** (no database
reachable from the session). Decided unattended under `--no-approval`; each
call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 3: groups, homework, messages and answer reads
work on linked students only. A learner links by opening a teacher's student
link or by claiming a run invite, and sees what the teacher will see first.
Privacy 1.5 §5 ("Teachers you link to") already describes exactly this
(docs/decisions/0144), so no legal change is needed; the card's "if the live
legal text doesn't describe it, stop" did not fire. The statement shown in
the UI (`lib/teacherLinks.ts` `linkStatement`) mirrors that section's bullets.

## Decisions

1. **A teacher is an admin or anyone with a `course_editors` row**, in one
   SQL function, `_is_teacher()` (076). The card says "until seats
   (TCH-007)"; TCH-007 redefines this one function. Revisit if admin-without-
   courses should not be a teacher.

2. **The join token is stored hashed and shown once.** The card asks for
   "a rotating per-teacher join token stored hashed (the 0107 pattern)" and
   also for "the teacher's join link with Copy and Rotate". A hash cannot be
   shown again, so Studio offers **Create link / Rotate link**, and Copy works
   on the link just returned; after a reload the teacher rotates to get a new
   one (the invite dialog's "can't be shown again" rule, 0107). The
   alternative, storing the raw token, was rejected as contradicting the
   hashed-storage line. Rotating needs a confirm because it kills the old link.
   Revisit if teachers keep losing the link: store it encrypted, not raw.

3. **The teacher's name on the join page is `profiles.display_name`**, the
   public handle (the leaderboard rule, never `full_name`), falling back to
   "Your teacher". It is the only fact the page discloses about the teacher.

4. **Claiming a run invite links in the same call.** `claim_run_invite` (059,
   re-emitted) inserts the link when the invite's creator still passes
   `can_edit_course` for the course and is not the claimer; otherwise the
   learner is enrolled and linked to nobody. `run_invite_preview` (059,
   re-emitted) returns `teacher_name` under the same condition, and the invite
   page shows the statement only when it is present, so the statement appears
   exactly when the claim will link. An existing active link is left alone.

5. **Ending a link keeps the row; deleting an account deletes it.** `ended_at`
   and `ended_by` record the history privacy §4 lists. The card says
   `delete_my_account` "ends them"; privacy §9 (signed off, 0144) says teacher
   links are "deleted outright", so 076 deletes rows where the caller is the
   student or the teacher, and the caller's join token. Re-emitted from 061
   (the print rule's latest body). One active link per pair is a partial unique
   index; relinking after leaving makes a new row.

6. **`_teacher_linked(teacher, student)` is the one gate** later TCH reads
   call. It is true only for an active link, which is how "an ended link stops
   every TCH read" holds without TCH-002..006 re-deriving it. It has no grants;
   only other SECURITY DEFINER functions call it.

7. **Linked students are a separate list from the activity roster.**
   `learner_roster()` is unchanged (0141 Decision 3). Studio Learners gains a
   panel above it: the join link, then every active linked student (including
   those with no activity) with a "Linked" pill and Remove; roster cards for a
   linked learner get the same pill. The panel's student rows are not links to
   the learner page: that page is built from the roster and a linked student
   with no activity has nothing on it yet (TCH-003 owns what a teacher sees of
   a student).

8. **Leave on `/my` is confirmed without client JS**: a native `<details>`
   whose open body holds the consequence sentence and the submit button, the
   `AccountMenu` `<details>` precedent (0086). It posts a plain form to
   `/api/teacher-links/leave`. `/join/[token]` is English/Russian by the saved
   choice with no toggle, as `/my` is (0120); the invite page's statement is
   English, as that page is (0107).

9. **No rate limit on `join_teacher`.** The token is 128 random bits, a join
   only ever links the caller to one teacher who published the link, and the
   unique index makes repeats no-ops. Revisit if a link is posted somewhere
   public and a flood of joins appears.

## Surprises

- The migration cannot be exercised from here: no local database, and the
  hosted one is the owner's to change. `supabase/verify/076_teacher_links.sql`
  is the full protocol with positive controls beside each negative check
  (learner cannot link anyone else; a teacher sees only their own links; an
  ended link stops `_teacher_linked`, the roster and `my_teachers`; rotation
  kills the old token; the invite claim links the creator and not another
  editor; deletion removes both sides). It needs 073 applied.
- Until 076 is applied, `/my`, Studio Learners, the join page and the account
  export all call RPCs that do not exist and will error. Apply 076 (and
  073-075 before it) before deploying this commit.

## What would make us revisit

- TCH-007 changes who is a teacher (Decision 1).
- Teachers need to re-read their link (Decision 2).
- A teacher is frozen (TCH-008): whether a frozen teacher's existing links
  still resolve a join is not decided here; `_is_teacher` is where it lands.
