# 0164 — TCH-009: a teacher opens a self-paced course for a linked student

Status: built; migration 087 written and applied to the local stack twice, where
`supabase/verify/087_teacher_course_grants.sql` prints `TCH-009 PASS: 087 full
protocol (76 asserted cells)`. Written, not applied, as the card asks; the owner
then asked for it to be applied to the hosted project, and it was, through the
hosted-apply gate (2026-10-17, see "Hosted" below). Decided unattended under
`--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 5: for a self-paced course, an editor grants and
revokes a `course_entitlements` row (`source = 'grant'`) on their own course; the
single entitlement SQL function is unchanged, and "a link means access" was
rejected because it would change it. 041 made `course_entitlements` writable by
no app role; 058 added `revoked_at` (the one rule: access needs `revoked_at IS
NULL`). Nothing wrote a grant from the app before this card.

## Decisions

1. **Two SECURITY DEFINER writes, no new table.** `teacher_grant_course(course,
   student)` and `teacher_revoke_course_grant(course, student)`. The table keeps
   its single owner-read policy and no INSERT/UPDATE/DELETE grant for any app
   role (verify cells print both). `can_read_lesson`, `has_course_entitlement`,
   `_lesson_access_at` and every RLS policy are not touched: the migration has no
   CREATE for any of them and no policy statement (`grep -c` over 087: 0), and
   the verify script reads access through `can_read_lesson` before and after.
2. **A teacher-made grant is marked by `source_ref = 'teacher:<uuid>'`.** That
   is how it is told from an admin comp (source_ref NULL or free text) and from a
   purchase. A teacher may revoke only rows carrying the marker, and may reopen
   only a row a teacher revoked. Rejected: a new `granted_by` column (a schema
   change to a table the entitlement function reads, for one prefix test), and
   letting a teacher revoke any grant on their course (it would let a teacher
   undo an admin's comp or a refund).
   - A grant over an active entitlement from another source is `has_access`; over
     a row revoked by someone else it is `not_grantable`. Neither writes.
   - The marker contains the teacher's user id, so it reaches the student's own
     data export (which already carries `source_ref`). It names an account the
     student is linked to and sees as a teacher already. If a teacher's account is
     later deleted, the id stays and the student keeps access (verify cell).
3. **Order of refusals, after 0155 Decision 2.** `unauthenticated`; `forbidden`
   (the caller does not edit the course, or an argument is NULL); `seat_lapsed`
   (`_studio_can_write`); `cohort_course`; `not_linked`. A stranger still hears
   `forbidden` on a frozen seat. Both writes call `_studio_can_write`, so 083's
   coverage count is now 40 and the verify script for 083 lists the two new reads
   among the unguarded functions; it is updated here.
4. **Self-paced courses only.** A cohort course is opened by runs and invites
   (0141 Decision 5), so a grant on one is `cohort_course`. A grant on a cohort
   course opens every lesson regardless of the schedule (docs/handoff.md,
   "Payments"), which a teacher should not be able to do by accident.
5. **"Live linked student only", for both writes.** `_teacher_linked` (076) and a
   profile that is not deleted. Consequence, stated: once a link ends the student
   keeps the access they have (nobody loses access, 0141 Decision 4) and the
   teacher can neither revoke it nor see it in their grantee list. A teacher who
   needs it gone asks an admin. Rejected: letting a teacher act on an ended link;
   the card says live, and a teacher's reach into someone who left should shrink,
   not stay.
6. **Any course status.** A grant on a draft course is allowed (a teacher can
   open a course before publishing it); the Studio list shows a "Draft" pill.
7. **Reads.** `teacher_grantable_courses(student)` returns the self-paced courses
   the caller edits with the student's state (`none`, `granted`, `other`,
   `revoked`, `unavailable`) so the page offers only what the RPC will accept;
   `course_grantees(course)` returns the caller's linked students with an active
   teacher-made grant. An admin edits every course, so an admin sees every
   self-paced course for a student linked to them; that is `can_edit_course`'s
   existing meaning and is not narrowed here. Reads stay open to a frozen seat.
8. **Studio.** A "Course access" section on a linked student's page (a row per
   course: Open access, or Close access behind an AlertDialog; a note when the
   student already has access another way); a "Granted access" list on the
   course editor of a self-paced course, with Close access. Both are wrapped in
   `WriteArea`. A failed read hides the section instead of failing the page.
   `/api/studio/course-grants` validates shape and relays the RPC's error.

## Evidence

- Local stack, `supabase/verify/087_teacher_course_grants.sql`: `TCH-009 PASS:
  087 full protocol (76 asserted cells)`, run twice. Refusals each beside the
  success they control: another teacher, a stranger course, a plain user,
  an unlinked student, an editor who is not a student, a cohort course, a NULL
  argument, anon (42501 on all four functions), a student writing their own row
  directly (42501). A granted student opens an entitled lesson and, after the
  revoke, does not; the row is kept with `revoked_at`; a second revoke is
  `not_granted`; a regrant after a teacher's revoke reopens it. A purchaser, an
  admin-comped student and a refunded purchase are never changed. A lapsed seat:
  both writes `seat_lapsed`, nothing written, the student keeps access, the reads
  answer; renewed, the same calls by the same teacher are `ok`.
- A mutated copy of 087 without the editor check fails on its first refusal cell
  (`another teacher (t2) grants s on E: forbidden (got not_linked, want
  forbidden)`); the real file passes after restoring it.
- Anonymous-path rows (docs/decisions/0056 Decision 4) printed before and after:
  `true/false/true/false/true/true` both times (anon free, anon paid, user free,
  user paid, purchaser paid, editor or admin paid).
- Re-run after 087, all printing PASS: 067, 068, 069, 070, 073, 076, 077, 078,
  079, 080, 081, 082, 083 (126 cells, with the coverage count at 40), 084, 085,
  086. 087 applied twice. `npm run check` exit 0; `npm test` 1,500 passed.
  (A first full run had two timeouts in files this card does not touch,
  `LessonPlayer.askTeacher.test.tsx` and `LessonContentEditor.exercises.test.tsx`;
  alone they pass, and the full run after passed.)
- 360px, local stack, a seeded teacher and three linked students
  (`scrollWidth/innerWidth`): 360/360 on a linked student's page with no grants,
  after a grant (a 76-character course title, a 70-character email), with the
  revoke confirm open (dialog x 21, width 318), for a student who already has a
  purchase, and with the seat lapsed and the banner showing; 360/360 on the course
  editor with two grantees, with its confirm open, after a revoke, and with the
  seat lapsed. Not reached: a toast, the empty list text in a browser.
- Print rule, right before commit: latest migration `087_teacher_course_grants.sql`
  (086 before it); latest `delete_my_account` body `086_calendar_feed.sql`, not
  re-emitted.

## Hosted

Gate run 2026-10-17, in order. Print rule right before applying: latest migration
`087_teacher_course_grants.sql`, latest `delete_my_account` body
`086_calendar_feed.sql`. Read-only probe first (`migration list --linked`: 001
through 086 on both sides, 087 local only; `pg_proc`: `_studio_can_write`,
`_teacher_linked`, `can_edit_course`, `my_calendar`, `calendar_events`,
`calendar_feed` present, none of the four new functions; `course_entitlements` has
`revoked_at`; 38 guarded functions, 3 seats, 0 teacher grants, 0 `@verify.test`
users). Applied with `db query --linked -f`, then `migration repair --status
applied 087`. Probe after: the four functions exist, anon cannot execute any,
authenticated can; 40 guarded functions. Verify script run on hosted: a copy whose
last line raises instead of notices, because `db query` does not return NOTICEs;
its output is `TCH-009 PASS: 087 full protocol (76 asserted cells)` (the unmodified
script also exits clean, with no output). Afterwards a read-only count: 0
`@verify.test` users, 0 `v87-` courses, 0 teacher grants, 3 seats, 0 links.

## Not in this card

A teacher seeing the
grants of a student whose link ended; a purchase flow (parked, docs/handoff.md,
"Payments"); the teacher terms and data roles (OPS-025).

## What would make us revisit this

- A teacher needs to close access for a student who left: a `teacher_revoke` for
  ended links, or an admin tool.
- Teachers sell access to many students: a bulk grant, or a purchase rail.
- A second kind of teacher-made row needs a different marker than `source_ref`:
  then a `granted_by` column earns its schema change.
- The entitlement function changes: this card's grant semantics must be re-read.
