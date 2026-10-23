# 0201 — OPS-029: legal drafts for Telegram homework and teacher-message pings

Status: DRAFTS ONLY. Nothing under `docs/release/legal/` is changed by this card; the owner
reviews and publishes (card acceptance 3). Decided unattended under `--no-approval`; the
drafts are proposals, the owner can overturn any of them.

## Context

The live policy (privacy 1.8, subprocessors 1.5) describes the Telegram bot as messaging a user
"about a course you joined". Since then the bot sends four more kinds of message:

| Ping | Sent to | Text carries | Source |
|---|---|---|---|
| New teacher or student message | the other party | a fixed sentence and a link; no name, no message text | 0177 Decision 6, `lib/telegram/pings.ts` (`TEXT`, `pingText`) |
| New homework | the student | course (and lesson) title, optional due date, a link to `/my`; not the teacher's note | 0199, `lib/telegram/homeworkPings.ts` (`newHomeworkText`) |
| Homework due tomorrow | the student | a list of course (and lesson) titles and a link | `dueDigestText` |
| Link offered to a learner with no enrolment | a learner tied to a teacher | same bot, same link | 0200 |

Titles are clipped at 80 characters (`MAX_TITLE`). A course or lesson title is authored text, so a
teacher chooses what appears in it.

What is stored: no new category. The chat id, language, time zone and dates are already in the
policy's data table. Two new log tables hold no text and no chat id:
`telegram_message_pings(conversation_id, to_role, sent_at)` (0177 Decision 3; goes with the
conversation, which `delete_my_account` deletes) and
`telegram_homework_pings(assignment_id, student_id, kind, claimed_at)` (0199 Decision 9; goes when
the teacher link ends or the account is deleted, verified there). Neither is in the data export
(0177 Decision 3, 0199 Decision 10).

Two things the existing text gets wrong once 0200 is live, besides the purpose:
(a) a learner with no enrolment can now turn reminders on, so "a course you joined" is untrue for
them; (b) a teacher can now link the bot from Studio (0177 Decision 7), so the audience is no
longer only learners, and the policy's "you" in the reminders rows must cover teachers.

## Drafts

### privacy-policy.md

**§3.2 data table, "Telegram reminders" row, second cell** (line 99 in 1.8). Replace
"So the bot can message you about a course you joined." with:

> So the bot can message you: about a course you joined; when a teacher you are linked to gives
> you homework, and the day before it is due; and when a teacher or a student you are linked to
> writes to you in the app. A one-hour link you press is stored only as a hashed token

**§3.2, new row after it** (the two logs):

> Notification log — for each message and homework notice the bot sent: which conversation or
> homework it was about, who it was for, and when. Not its text, and not your chat id | So the
> same notice is not sent twice, and messages are not announced more than once an hour per
> conversation

**§4 Art. 6 table, the Telegram row** (line 193 in 1.8). Replace the first cell with
"Messaging you in Telegram about a course you joined, about homework a teacher gives you, or when
a teacher or student writes to you, if you turn reminders on". The basis cell is unchanged
(**Contract**, Art. 6(1)(b)): the feature is one the user switches on by pressing Start, in each
case. This is the same basis the policy gives the in-app versions of the same events.

**§5, "Telegram reminders" paragraph** (lines 219 to 222 in 1.8). Replace with:

> **Telegram reminders.** If you turn them on, the bot sends you messages through Telegram, so
> Telegram receives the text of each message and your chat id, and can see that you use the bot.
> A message about a course or homework names the course and lesson and gives a link, and a
> homework notice also gives the due date if there is one. A message that someone has written to
> you is a fixed sentence and a link, never the text of the message and never anyone's name. We
> do not send Telegram your answers, your scores or a teacher's note. Telegram is listed in the
> [subprocessors](./subprocessors.md). We do not send Telegram anything else about you.

Note for the owner: a course or lesson title is chosen by its author. Under the sentence above a
teacher could put a student's name in a title and it would reach Telegram. The teacher terms
(`docs/release/teacher-terms-draft.md`) should forbid it; this paragraph does not promise that it
cannot happen.

**§7 retention table, one new row after "Telegram reminders"**:

> Notification log (conversation or homework, recipient role, time) | Message notices: deleted
> with the conversation, when you delete your account or the conversation is deleted. Homework
> notices: deleted when your link to the teacher ends, the homework is deleted, or you delete
> your account

The existing "Telegram reminders" retention row is unchanged.

**§9 and the export list** (lines 335 and 360): no change proposed. The log is not in the export
(0177 D3, 0199 D10) and §9 already says Telegram reminders data is deleted outright. If the owner
wants the log in the export (0199 "revisit"), §9's list gains it.

**§13**, add a sentence: "Version 1.9 extended the Telegram reminders to homework and to
messages between you and a teacher."

**Header:** `Version 1.9 · Last updated <publication date>`.

### subprocessors.md

**Telegram row, role cell:** "Sign-in, and reminder messages — **only if the user chooses
them**" becomes "Sign-in, and messages from our bot (course reminders, homework notices, and
notices of a message from a teacher or student) — **only if the user chooses them**".

**Telegram row, data cell**, the reminders sentence: replace "the text of the reminder messages
sent to it (course and lesson titles, a link)" with "the text of the messages sent to it (course
and lesson titles, a due date, a fixed sentence and a link; never the text of a message between
a teacher and a student, and never a name)".

**Transfer basis cell:** unchanged, and it still says "for the owner to confirm before launch".
This card does not confirm it; it is the open item below.

**Change log** (append): "1.6 (<date>) Telegram messaging gains two purposes: homework notices
from a teacher, and notices of a message between a teacher and a student (docs/decisions/0177,
0199, 0200). No new data category: the chat id and message text were already listed. A new
purpose, so after launch the in-app notice of Terms §10 applies (0095 Option A)."

**Header:** version 1.6.

### terms-of-service.md

No change proposed. The Terms describe voice review and paid access, not the bot. §10 is the
notice mechanism, not text to edit.

## Decisions

1. **Drafts live here, not in `docs/release/legal/`.** The card's third line says nothing under
   that folder changes without the owner. A later session edits the three files from this
   section when the owner says so.
2. **"Contract", not consent, for all four pings.** Each is switched on by the user (Start in the
   bot, or the panel), switched off by /stop, the button or blocking, and is the Telegram form of
   something the app already shows (a thread, a homework list). That is the basis the policy
   already gives the reminders row; no second basis is proposed.
3. **Say what is not sent.** The 0177 wording ("never the text of your message or anyone's name")
   is kept, and extended with the homework facts the code sends (titles, due date, link) and the
   things it does not (answers, scores, the teacher's note). Each clause is checked against
   `pingText`, `newHomeworkText` and `dueDigestText` above, not against the decisions' summaries.
4. **The notification logs get a data-table row and a retention row**, because they hold a user
   id (homework) or a conversation id. They are not in the export; the draft does not claim
   otherwise.
5. **Teacher audience.** The reminders rows say "you", which now includes a teacher who linked
   from Studio. No separate teacher row is drafted; the data is the same. Open: whether the
   teacher terms should say it.
6. **Materiality (0095).** Recommendation, not a ruling: treat it as material after launch. It
   adds no data category (the chat id and title text were listed), so by 0095's table it is nearer
   "Telegram as identity provider: version bump only" than "voice recordings: banner". But it is a
   new purpose that reaches people who never joined a course, and a user who turned reminders on
   for course weeks did not agree to hear about a teacher's message. If the bot is already live
   for real users, the safer reading is the Terms §10 in-app banner. **Before launch (production
   has no real accounts, 0095 Decision 1): version bump only, no notice.** Whether production has
   real accounts today is not recorded in the repo; the owner states it.

## For the owner

- Which of the drafts you accept, and the publication date for the version lines.
- Whether production has real accounts now (decides Decision 6: bump only, or banner).
- The Telegram transfer basis for reminders, which both the current policy and the current
  subprocessors row still mark as yours to confirm. This card does not change that, and the new
  purposes do not make it go away.
- Whether the notification logs belong in the data export (0199 Decision 10).

## What would make us revisit it

- A ping starts carrying a name, a message body, a score or a teacher's note: the §5 sentence is
  then false.
- The log tables gain the chat id or text.
- Telegram gets a role beyond messaging (for example, group posts).
