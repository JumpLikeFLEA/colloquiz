# 0153 — TCH-006: "Ask the teacher" from an exercise or voice-task card

Status: built; migration 081 applied to the local stack twice, where its
verify script (`supabase/verify/081_ask_the_teacher.sql`) prints
`TCH-006 PASS: 081 full protocol`, and to the hosted project on 2026-10-16
through CLAUDE.md's hosted-apply gate (history repaired, 080 and 081 both
recorded). On hosted `db query` prints no notices, so the script's silence is
the pass: a copy with its last assertion made wrong failed with "got 3, want
999" on that assertion, so the run reached the end, and no seeded row, user,
helper function or trigger remained afterwards. The before and after probes
are in the card's evidence comment. Decided unattended under `--no-approval`;
each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 10: an "Ask the teacher" link on every exercise
and voice-task card, shown to a linked student whose teacher edits the course
or assigned it; the message stores a frozen snapshot of the exercise as
rendered and, if ticked, the student's answer. 0151 Decision 11: the snapshot
must be a column of `teacher_messages` or a child row with `ON DELETE
CASCADE`, so account deletion keeps removing both sides in full. Privacy 1.5
already says all of it (section 3.1, the Messages row: "a frozen copy of an
exercise and your answer to it"; section 5: "You can attach a frozen copy of
an exercise, and your answer to it if you tick that box" and copies "stay in
it until you delete your account"; section 7: "Messages, with any exercise or
answer attached" kept until you close your account, then deleted outright;
section 9: conversations deleted "in full (both sides, with anything
attached)"), so no legal text changes.

## Decisions

1. **The snapshot is a nullable JSONB column, `teacher_messages.attachment`.**
   Not a child table: it is one value per message, and the 079 cascade and
   `delete_my_account` (not re-emitted; 079's `DELETE FROM
   teacher_conversations` already removes the messages) cover it for free.
   Capped at 40,000 characters by a CHECK; the existing rows are NULL, so the
   constraint cannot invalidate them.
2. **The database checks the snapshot; it does not take the client's word.**
   `_attachment_normalise` keeps only the version id, block id, block and
   (for an exercise, if included) the response from the request. The block
   must EQUAL the one in that version's own `lesson_versions.document`; the
   course and lesson titles and slugs, the lesson id and "Exercise N" are
   written from the database. Equality is deliberate over copying: copying
   would let a student pull a lesson they cannot open into their own message
   and read it back, equality reveals nothing the caller did not already
   hold. Verify script cells: a changed prompt, an unknown version, a block id
   not in the version, a theory block, a practice block sent as a voice task,
   a JSON-null response and a response over 8,000 characters are each refused;
   the forged display fields in the request are overwritten.
3. **Who may ask is decided once**, in `_ask_teacher_allowed(teacher,
   student, lesson)`: link live, `_is_teacher`, and the teacher edits the
   lesson's course OR the student receives an assignment from that teacher
   that covers it (the course, or that very lesson: 080's rule, so an
   assignment of lesson 2 does not open lesson 1). `ask_teacher_options(lesson)`
   (what the page offers) and the send path (what is accepted) both call it.
4. **Only the student attaches.** A teacher posting with an attachment gets
   `attachment_not_allowed`. The card is "a student sends the exercise they
   are stuck on" (0141 D10); a teacher answering uses the body.
5. **`send_teacher_message` gets a four-argument form, and the 079 signature
   stays as a wrapper.** The route calls the three-argument one when there is
   no attachment, so plain messages keep working before 081 is applied, and
   the page's `ask_teacher_options` read is fail-soft, so the link is simply
   absent. The new app code and the migration can land in either order. The
   attachment is validated before the conversation row is created, so a
   refused snapshot never leaves an empty conversation (verify script).
6. **`conversation_messages` and `my_conversations_export` are dropped and
   created again** (CREATE OR REPLACE cannot add a column to a returned
   table), inside the same transaction, grants re-issued. A DROP FUNCTION is
   not one of the gate's listed destructive statements and no data is
   touched, but it is the one statement in 081 an owner might want to see
   named. Both gain `attachment` last, so an old caller that ignores unknown
   columns is unaffected.
7. **"Include my answer" is on by default once the exercise is checked, and
   disabled (with a reason) before.** The answer is the response as the
   player produced it, stored as sent (at most 8,000 characters of JSON), not
   scored: an attachment is the student's own words, not a record, and
   TCH-003 already shows scores for linked students where the lesson is the
   teacher's. A voice task has no answer to include; its recording is not
   attached.
8. **The card never draws the answer key.** The stored block carries it (the
   player already shipped it to the student), but `exerciseLines` shows a
   selection's options without which are right, True/False statements without
   their truth, an ordering's elements alphabetically (authored order is the
   right order) and a matching item's left items plus its right-hand options
   as one line, never the pairing. A slots item is its prompt. Reading the
   answer reuses `lib/learners/answerText.ts` (TCH-003), so the teacher sees
   the same wording in both places.
9. **A dialog, not an inline composer.** "Ask the teacher" opens a Radix
   dialog (the Studio and Colloquiz precedent) holding the picker (radios;
   a single teacher is named, not asked), the frozen card in its own scroll
   box (`max-h-60`; an eight-row True/False exercise otherwise pushed the
   message box off a 360px screen), the toggle and the existing
   `MessageComposer`. Sending does not refresh the page: `MessageComposer`
   gained an `onSent` that replaces `router.refresh()`, because refreshing the
   lesson page re-renders the player with a new `attemptId` (0086). The dialog
   is its own lazy chunk, fetched on the first click.
10. **Where the link lives, and why it is a sibling client.** An exercise's
    link rides on the `practiceRenderer` function prop (it already receives the
    block and `onScore(result, response)`, so the wrapper also learns the
    latest response); a voice task's link is drawn by the voice block's own
    chunk through a new optional `voiceTasks.renderAsk`. Nothing in
    `LessonPlayer` or `LessonPageClient` changed. The lesson page renders
    `LinkedLesson` only when `ask_teacher_options` returned a teacher; the
    admin preview, the demo and every other visitor keep `LessonPageClient`.
11. **Threads.** `MessageThread` draws a read-only `AttachmentCard` under the
    text: course · lesson, "Exercise N" (or "Voice task"), the prompt, what the
    exercise offered, the answer. The heading links to the lesson (the
    exercise's card for an exercise). `/my` follows the saved EN/RU choice;
    Studio is English. The answer lines come from `answerText`, which is
    English ("Gap 1: ...", "no answer"); a Russian reader sees authored content
    plus those few English words. Not translated here.
12. **Export.** `my_conversations_export` returns `attachment`; the export
    document carries it whole per message. `EXPORT_FORMAT_VERSION` 11 to 12.
    080 had added the `homework` key without a bump; this bump covers both.

## Budget

`npm run budget` (a rebuild each time, same machine), measured against the
hosted project's data. The seeded `/my` learner does not exist there, so
`/my`, `/my/messages` and `/runs/...` print FAIL before and after, as in 0151.

| route | before | after |
|---|---|---|
| `/courses/future-imperfect/true-or-false` (free lesson, anonymous) | 257.2 KB | 257.4 KB |
| `/courses/future-imperfect/applied-practice` | 285.1 KB | 285.3 KB |
| `/`, `/courses/future-imperfect`, `/login`, `/join`, `/invite` | unchanged | unchanged |

The +0.2 KB is the loader stub. The card says "unchanged for a visitor who
is not linked" and the M3 header says "byte for byte"; **that is not met to the
letter**. What is met is that nothing but the stub reaches them. Three shapes
were tried:

- `page.tsx` importing the linked client directly: free lesson 258.3 KB.
- `page.tsx` importing it through a dynamically imported Server Component (the
  Next 16 doc says a Server Component's dynamic import of a Client Component is
  not code-split but that Client Component children of a dynamically imported
  Server Component are lazy,
  `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`): free lesson
  still 258.3 KB. In the built lesson HTML the chunk holding the Ask code
  (`.next/static/chunks/0...pgamtt0nb.js`, 29,359 bytes) was listed in the
  `I[...]` entries of the ordinary client components and as an async script,
  i.e. shared with them.
- A `"use client"` stub (`LinkedLesson.tsx`) that calls `next/dynamic`:
  257.4 KB, the chosen shape.

An A/B with `page.tsx` rendering only `LessonPageClient` (the linked path
disconnected, every other edit of this diff left in) printed 257.2 / 285.1 KB,
exactly the baseline, so the whole +0.2 KB is the stub.

What would reach zero: serve linked students a different route (a rewrite in
`proxy.ts` on a flag), which trades 0.2 KB for a second URL and a flag that
can go stale. Not built; the owner's call.

## Verification

- `supabase/verify/081_ask_the_teacher.sql`: PASS locally, with a positive
  control beside each denial (a good snapshot to the same teacher, a good
  attachment from the same student, a live link). Earlier scripts for what 081
  re-emits or touches, 079 (`send_teacher_message`, `conversation_messages`,
  `my_conversations_export`, `teacher_messages`) and 080, re-run and PASS.
- `npm run check` and `npm test` exit 0, including
  `lib/askTeacher/snapshot.test.ts` (one case per item type and the voice
  task) and the RTL tests for the player and the thread.
- Driven in Edge at 360px against the local stack with a seeded student and
  two teachers (users removed afterwards): the lesson with the link, the dialog
  unanswered with two teachers (one with a long name), answered with the answer
  included, a long unbroken question, the sent state, the student's thread and
  Studio's thread, all `scrollWidth/innerWidth 360/360`. The official script
  with `--expect` on both threads and on the RU choice: 360/360. **Not reached
  in a browser:** a voice task's card (the local fixture lesson has none; the
  RTL test covers the link and the dialog) and the dialog's error line (RTL
  covers a refusal).

## What would make us revisit

- The owner wants the free lesson byte for byte: the proxy-rewrite route above.
- Teachers want the student's answer marked right or wrong in the card: store
  earned and possible with the response (not done: the attachment is the
  student's own words).
- A student should attach to a teacher who neither edits nor assigned the
  lesson: that widens decision 3 and the privacy text's "teacher who edits or
  assigned".
- 8,000 characters of response or 40,000 of snapshot refuses a real exercise (a
  long slots item): both are guesses, nothing measured them.
- Voice recordings should be attachable: that is audio storage, not this card.
