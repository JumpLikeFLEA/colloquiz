# 0177 — TCH-012: a Telegram ping for a new message

Status: built. Migration 091 was written, applied to the local stack twice, and then, through
the hosted-apply gate, to hosted (history 001..091 level). Decided unattended under
`--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 17: badges first, Telegram pings as separate cards that reuse
COH-010's sender. 0173 built the link (`telegram_links`, the webhook, `lib/telegram/send.ts`)
and left `create_telegram_link_token` open to any signed-in user for exactly this card
(0173 Decision 3). 0151 built the messages this card announces.

## Decisions

1. **SQL decides whether a message earns a ping; TypeScript words and sends it.**
   `telegram_message_ping_claim(message_id)` (service_role only, 091) finds the other party of
   the message's author, requires an ACTIVE `telegram_links` row for them, applies the limit
   and logs the ping. Same rule as entitlement: one place decides, so the route cannot
   disagree with the database about who is a party or whether the link is live.
2. **The limit is "one per conversation per side per hour while unread", read from the
   messages themselves.** A ping is suppressed only when a ping to that side was logged in the
   last hour AND the recipient still has an unread message (`read_at IS NULL`) from before that
   ping. Reading the thread ends the throttle early, so the next message pings again. Side
   means 'teacher' or 'student': the teacher's pings do not throttle the student's.
   (Opposite choice: a flat hour regardless of reading. Rejected: a teacher who answers and
   gets a reply ten minutes later would hear nothing.) Verified in
   `supabase/verify/091_telegram_message_pings.sql` sections 4 to 7.
3. **The log holds no user id, no text, no chat id.** `telegram_message_pings(conversation_id,
   to_role, sent_at)`. Because it hangs off the conversation with `ON DELETE CASCADE`, and
   `delete_my_account` (079) already deletes every conversation the caller is party to, the
   log goes with the account without re-emitting that function (print rule: latest body is
   090's, untouched). Verified (section 9): after `delete_my_account` the pings of that
   conversation are gone and another pair's remain. It is not in the data export: it holds
   nothing about the person that the conversation export does not.
4. **The ping is claimed before it is sent.** A send that fails (Telegram down, no token)
   still uses the hour. The alternative, releasing the row on failure, would retry on every
   message during an outage and needs a second function. A 403 already stops the link
   (`sendToUser`), so a blocked bot costs one failed call, not many. The in-app badge and the
   unread dot are unchanged and stay the reliable signal.
5. **After the post, outside the response.** `/api/messages` calls `pingForMessage` inside
   `after()` once `send_teacher_message` returned ok. `pingNewMessage` never throws; the
   route logs only the outcome word. A ping failure cannot change the 200.
6. **The text names no one and carries nothing of the message**: "Your teacher sent you a
   message: <link>" / "A student sent you a message: <link>" and the Russian pair, in the
   language saved at link time. Names and bodies would send more personal data to Telegram
   than a pointer needs (privacy policy: "Telegram receives the text of each message").
   The link goes to the recipient's own surface: `/my/messages/<teacherId>` for a student,
   `/studio/messages/<studentId>` for a teacher (`threadPath`, 0151), on `SITE_URL`.
7. **Studio gets the COH-010 panel, not a second mechanism.** `/studio/messages` shows
   "Messages in Telegram" (`TelegramRemindersPanel` with `studioTelegramCopy`, English, lang
   `en`), above the conversations, via `/api/telegram/link` and the same webhook. One link per
   user (a person who is both a learner and a teacher has one chat for both). A failed status
   read leaves the card out.
8. **The bot's `/start` and help replies now also mention messages**, in both languages,
   because a teacher who links from Studio would otherwise be told the bot reminds them about
   "a new week of the course". Wording pending partner review.

## Not done here

- **A student with no enrolment has no way to link the bot.** The learner panel is offered to
  enrolees only (0173 Decision 3), so a student whose only tie is a teacher link never sees a
  button, and gets no pings. Proposed card: offer the `/my` panel to a learner with a teacher
  link or a conversation too.
- **The privacy policy and the subprocessor list say reminders are "about a course you
  joined".** Message pings are a new purpose and a new audience (teachers). Legal copy is
  reviewed text and is not edited here. Proposed wording for the owner: in the privacy
  policy's data table (Telegram reminders row) and its Art. 6 row, "about a course you
  joined, or when your teacher or student writes to you"; in section 5, "a fixed sentence
  and a link, never the text of your message or anyone's name"; in subprocessors.md the
  "Reminders" role, the same. Before launch no notice is needed (0095 Decision 1); after, it
  is the Terms §10 in-app notice.
- **Live delivery on production** is the owner's step: link a test account with the deep link
  and write to it. See the card's closing comment.

## What would make us revisit it

- A ping lost to a transient send failure (Decision 4) turns out to matter: release the row
  on failure.
- 30 messages an hour per author (0151) times many conversations is more than a bot can send:
  Telegram's limits (about 30 messages a second overall, one a second per chat) are far above
  this, so nothing measured suggests it; revisit on a 429 in the logs.
- The owner wants names or a preview in the ping: Decision 6 and the privacy text.
- Someone wants the throttle per message author rather than per conversation side.
