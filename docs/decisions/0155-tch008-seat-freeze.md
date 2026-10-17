# 0155 — TCH-008: a lapsed seat freezes the teacher's Studio

Status: built; migration 083 written and applied to the local stack twice,
where `supabase/verify/083_seat_freeze.sql` prints `TCH-008 PASS: 083 full
protocol (126 asserted cells)`. **Written, not applied to hosted**, as the card
asks. Decided unattended under `--no-approval`; each call below is one the
owner can overturn.

## Context

docs/decisions/0141 Decision 4: a lapsed seat freezes Studio. No create, edit or
publish, no new runs, invites, homework, groups or events, students cannot open
new threads; published courses stay playable and everyone keeps the access they
have ("anyone who has paid keeps access", docs/handoff.md). 0154 left the hook:
`_author_seat_active` and the line "TCH-008 uses it to freeze the rest of
Studio".

## Decisions

1. **One predicate, `_studio_can_write(user)`: admin, or an active seat.** No
   seat at all is not allowed either. That is the card's "active seat or admin"
   and 0154 Decision 4's rule for `create_course`, so a co-editor an admin
   grants after 082 needs a seat before they can write (082's backfill seated
   every existing editor; the hosted probe in 0154 found 0 editors without a
   seat). Rejected: "frozen only if a seat exists and has lapsed". It is kinder
   to a seatless co-editor, but `delete_my_account` deletes the caller's seat
   row while leaving `course_editors` rows, so a lapsed teacher could unfreeze
   themselves by calling it. **Behaviour change:** an editor with no seat now
   gets `seat_lapsed` on every write. Nine earlier verify scripts seeded editors
   with no seat (068–070, 076–081); they now seed one beside the editor row,
   marked TCH-008, and 076's "a teacher who stops being a teacher" cell also
   deletes the seat (082 made a seat count as a teacher).
2. **The guard goes AFTER each function's own authorisation check.** A caller who
   may not act at all (a plain user, another teacher's course) still hears
   `forbidden`; only an authorised-but-frozen caller hears `seat_lapsed`. Verify
   cells print both. The error code is the one 082 already mapped for
   `create_course`; its message is now the shared `SEAT_LAPSED_MESSAGE`.
3. **Re-emitted by script, not by hand.** `083_seat_freeze.sql` sections 4–6 were
   generated from the latest `CREATE OR REPLACE FUNCTION` body of each name (file
   named in a comment above each), with one statement inserted at a fixed point,
   and the generator asserts exactly one insertion per function. 35 bodies:
   course and lesson authoring (15), runs, calls, invites and tiers (11),
   the join-link rotation, groups (5) and homework (3). `CREATE OR REPLACE` keeps
   each function's privileges, so no GRANT is repeated; the verify script asserts
   `anon` can execute none of them.
4. **What stays open, and the check that keeps the list honest.** Not
   re-emitted: reads, `save_voice_feedback` and `save_final_comment` (replies to
   recordings), `end_teacher_link` (a student leaving; a teacher removing a
   student), `claim_run_invite` (an invite issued before the lapse still
   enrols: enrolments are unchanged), `grant_course_editor` (admin only). The
   verify script asserts that the functions using `can_edit_course`, `_is_teacher`
   or `_teacher_linked` WITHOUT the guard are exactly a listed 26: a new
   unguarded write RPC fails it. A count of 37 guarded functions is asserted too.
5. **Threads.** `send_teacher_message` (4 arguments) refuses only when no
   conversation exists yet and the teacher cannot write: `teacher_unavailable`
   for the student, `seat_lapsed` for the teacher. Replies both ways in an
   existing conversation keep working. `_ask_teacher_allowed` stops offering a
   frozen teacher to a student with no thread, so "Ask the teacher" never lists
   someone the send would refuse; a student with a thread still sees them.
6. **Storage.** The three lesson-images editor policies (041) gain
   `studio_can_write()`. Reading stays public. `studio_can_write()` (no
   argument, granted to `authenticated`) exists because a policy runs as the
   caller; `_studio_can_write(uuid)` is not granted, so nobody can probe another
   account's seat. The delete policy cannot be driven from SQL
   (`storage.protect_delete`); the script asserts all three policies carry the
   predicate and drives insert and update.
7. **The page.** The Studio layout asks `studio_can_write()` and
   `my_author_seat_state()` once, shows a read-only banner with the expiry date
   and what is not lost, and provides the answer through a context. Eleven client
   components that write are wrapped in `WriteArea`: frozen, it is a native
   `<fieldset disabled>` (every button, input, select and checkbox inside is
   disabled, links keep working, the reason is the tooltip, disabled controls are
   dimmed); not frozen, it renders its children and nothing else. Rejected:
   threading `disabled` through ~100 controls by hand, which a new control would
   silently miss. A failed read of the state does not freeze the page: the
   database refuses regardless, so the page never claims more than it knows.
8. **Not built here, deliberately.**
   - `join_teacher` (a student opening a frozen teacher's still-valid join link)
     is unchanged, because the card lists "links" as unchanged. See "Proposed".
   - "Grants" and "events" in the card's list do not exist yet (TCH-009 and the
     calendar cards, COH-014..016). Their RPCs must call `_studio_can_write`;
     the coverage assertion in the verify script fails until they do or are
     listed as reads.
   - Review queue cards and the message composer are not wrapped: feedback and
     replies are what a lapse leaves open. A frozen teacher starting a first
     message gets the refusal inline.

## Evidence

- Local stack, `supabase/verify/083_seat_freeze.sql`: `TCH-008 PASS: 083 full
  protocol (126 asserted cells)`. One call list of 35 write RPCs: pass 1 as the
  frozen teacher, all 35 `seat_lapsed`, a fingerprint of 12 tables unchanged;
  an admin renews the seat; pass 2, the same 35 calls by the same teacher, all
  `ok`, the fingerprint moved. A mutated copy expecting `ok` in pass 1 fails on
  call 1; a body with its guard removed fails the coverage count (36, want 37).
- A learner's lesson access, printed before the lapse, during it and after the
  renewal, is the same string three times (anon sees the open lesson, an
  entitled learner opens the paid one, an unentitled learner does not).
- Controls: admin without a seat writes; another active teacher writes to their
  own course and gets `forbidden` on this one; a plain user gets `forbidden`;
  a seatless editor gets `seat_lapsed`; a seat whose date simply passed (not the
  freeze RPC) refuses.
- Re-run after 083 and printing PASS: 067, 068, 069, 070, 076, 077, 078, 079,
  080, 081, 082. 083 applied twice, then once more after the last edit (40
  functions each time). `npm run check` exit 0; `npm test` 1,435 passed.
- 360px, local stack, a frozen teacher (`scrollWidth/innerWidth`): 360/360 on
  `/studio`, `/studio/courses`, the course editor, the runs page, the lesson
  editor, `/studio/learners`, a linked learner's page, the groups list, a group,
  `/studio/homework` and `/studio/messages`, each with the banner (checked with
  `--expect "Your author seat has ended"`). The same pages renewed: no banner,
  no `fieldset`, controls enabled.
- Not reached: the banner for a seatless editor, a dialog opened before the seat
  lapsed and left open, hosted.

## Proposed

- Refuse `join_teacher` for a frozen teacher ("this teacher can't take students
  right now"), so a stale link does not link a student who then shares answers
  with a teacher who cannot act. One re-emitted function and a cell.

## What would make us revisit this

- The owner wants a seatless co-editor to keep writing (Decision 1): the price
  is the `delete_my_account` loophole, which would then need its own fix.
- A teacher complains that a frozen Studio cannot collapse a chapter or open a
  block form to read it (disabled controls); a read-only view would be a card.
- TCH-009 or the calendar cards add a write RPC (the coverage cell fails).
