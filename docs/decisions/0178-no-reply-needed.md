# 0178 — "No reply needed" on a Studio thread

Status: built (ad-hoc, owner request 2026-10-19). Migration 092 written, applied to the
local stack twice, then through the hosted-apply gate to hosted (see "Hosted").

## Context

Owner report: a teacher read a student's message, had nothing to answer, and the Studio
Messages badge still counted it. The badge was never an unread count. It counts threads
`message_threads.unanswered` marks (079): the last message is the student's and the link is
live (0151 Decision 7). Opening a thread marks the messages read (0151 Decision 9), which
clears the "N unread" pill on `/studio/messages` but cannot change "unanswered"; only a reply
did. The owner asked for a "Mark as read" button.

## Options

- **A. A dismissal stored per conversation, read by `message_threads`.** The badge, the
  inbox's "Unanswered questions" and the list's "Unanswered" pill all read that one call, so
  all three drop the thread together. Needs a migration.
- **B. Make the badge count unread messages.** No migration and no button: opening a thread
  would clear it. Reverses 0151 Decision 7, and a teacher who reads a message intending to
  answer later loses the reminder. Rejected by the owner.

## Decisions

1. **Option A, labelled "No reply needed"** (owner, 2026-10-19). "Mark as read" would
   describe something the page already does on open.
2. **What is stored is the dismissed message's id, not a time**
   (`teacher_conversations.teacher_dismissed_message_id`). The thread is unanswered when its
   last message is the student's AND is not that message. A new student message is a new id,
   so the thread comes back with no extra state. A timestamp compared against `created_at`
   would hide a student message whose transaction began before the dismiss and committed
   after it. (Assumption, not measured: the id comparison has no such window, because the
   dismiss reads the last committed message under a row lock on the conversation.)
3. **`dismiss_conversation(p_student)` takes the teacher from `auth.uid()`.** A student or a
   third user can only name a conversation they are not the teacher of and gets `not_found`;
   so does a linked student with no conversation yet. When the last message is the teacher's
   it changes nothing and returns `dismissed: false`. It does not touch `read_at`: reading
   stays the page's job, and TCH-012's ping throttle (0177 Decision 2) keeps reading `read_at`
   alone. Verified in `supabase/verify/092_message_no_reply_needed.sql` sections 2 to 5.
4. **Not gated by `_studio_can_write`.** Dismissing acts inside an existing conversation, and
   0155 Decision 5 keeps replies in existing conversations open through a lapsed seat. Gating
   the dismissal while leaving the reply open would leave a frozen teacher able to clear the
   badge only by writing something.
5. **The thread page only** (owner). The button sits between the thread and the composer,
   shown only while the thread is unanswered, so it never appears on a closed thread or one the
   teacher answered last. The list and inbox rows are whole-row links; a button inside them
   would need a row redesign.
6. **Nothing changes for the student.** No column or value reaches a student's read
   (`conversation_messages`, `my_conversations_export` are untouched), consistent with 0151
   Decision 5: a sender learns nothing about how the other side handled their message.

## Measured

Local stack, a seeded teacher and student, Edge via Playwright, `next dev`:

```
360 unanswered: scrollWidth/innerWidth 360/360 button=true navBadge="none" sql_unanswered=t
360 POST /api/messages/dismiss -> 200
360 after No reply needed: scrollWidth/innerWidth 360/360 button=false navBadge="none" sql_unanswered=f
360 after the student writes again: scrollWidth/innerWidth 360/360 button=true navBadge="1 unanswered" sql_unanswered=t
1280 unanswered: scrollWidth/innerWidth 1280/1280 button=true navBadge="1 unanswered" sql_unanswered=t
1280 POST /api/messages/dismiss -> 200
1280 after No reply needed: scrollWidth/innerWidth 1280/1280 button=false navBadge="none" sql_unanswered=f
1280 after the student writes again: scrollWidth/innerWidth 1280/1280 button=true navBadge="1 unanswered" sql_unanswered=t
```

The first 360 reading has no badge while SQL says unanswered; later 360 readings show it. Not
investigated: the mobile nav is offcanvas, and the badge was read before it was
confirmed rendered. The 1280 rows show the badge going 1 → none → 1. Not reached: the
button's inline error line.

## Hosted

Gate run 2026-10-19, in order. Local: 092 applied twice (the second run skips the existing
column); `verify/092` prints `0178 PASS`; `verify/079`, `081`, `083` and `091` re-run and print
PASS; `npm run check` and `npm test` (1534 tests) exit 0. Print rule right before applying:
latest migration `092_message_no_reply_needed.sql`, latest `delete_my_account` body
`090_telegram_reminders.sql`. Read-only probe first: latest recorded 091, 91 recorded;
`teacher_conversations`, `teacher_messages`, `message_threads(text)` present;
`teacher_dismissed_message_id` absent, `dismiss_conversation(uuid)` absent, `message_threads`
body without the new column. Applied with `db query --linked -f`, then `migration repair
--status applied 092`. Probe after: latest recorded 092, 92 recorded; the column and the
function exist, `message_threads` carries the new body, anon cannot execute
`dismiss_conversation`. Verify script on hosted: a copy whose last line raises instead of
notices (the 0164 precedent; `db query` returns no NOTICEs) prints `ERROR: P0001: 0178 PASS`;
the unmodified script exits clean with no output. Afterwards a read-only count: 0
`@verify.test` users, 0 `v92-a` courses, 0 `_verify092_clock` functions, 0 conversations with
a dismissed id.

## Revisit if

- Teachers ask to dismiss from the list or the inbox without opening the thread (Decision 5).
- A student-facing "seen" or "handled" state is ever wanted (Decision 6, 0151 Decision 5).
