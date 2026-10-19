# 0180 — COH-011: a Telegram message when feedback or a final comment is ready

Status: built. Migration 093 was written, applied to the local stack twice, and then, through
the hosted-apply gate, to hosted (history 001..093 level). Decided unattended under
`--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0140 events 2 and 3: tell a linked learner when the author has answered. 0173
built the link (`telegram_links`, the webhook, `lib/telegram/send.ts`); 0177 built the first
card that sends through it and set the shape: SQL decides, TypeScript words and sends, after
the response, never throws. This card follows it for two new triggers: `save_voice_feedback`
(060) and `save_final_comment` (061).

## Decisions

1. **The two RPCs are not re-emitted.** The publish routes call a separate claim function
   after the RPC returned ok. Their bodies, their `can_edit_course` check and the Studio
   freeze (083, which leaves feedback open on purpose) stay as they are, and a message cannot
   change what a publish answers.
2. **SQL decides, in one place.** `telegram_feedback_ping_claim(kind, id)` (service_role
   only, 093) requires the row to be published, finds the learner's ACTIVE link and inserts
   the sent-log row; a primary-key conflict means someone already handled it. The route has
   no rule of its own: the same reasoning as entitlement and 0177 Decision 1.
3. **The log is "this publication was handled", and it is written when the learner is not
   linked too** (`sent = false`). The alternative, logging only real sends, would let an edit
   of old feedback message a learner who linked the bot afterwards, which is a message about
   something they may have read weeks ago. Verified
   (`supabase/verify/093_telegram_feedback_pings.sql` section 5): linking after the fact and
   claiming again answers `already_handled`. Cost: a learner who links the bot an hour after
   feedback was published is not told about it; the page and `/my` still show it.
4. **Keyed by the feedback itself, not by user.** `telegram_voice_feedback_pings
   (submission_id)` references `voice_feedback` and `telegram_final_comment_pings
   (enrolment_id)` references `run_final_comments`, both `ON DELETE CASCADE`. Neither holds a
   user id, a chat id or text. `delete_my_account` (090) already deletes the learner's
   submissions and final comments, so the logs go with them without re-emitting that function
   (print rule: latest body is 090's, untouched). Verified (section 9): after
   `delete_my_account` the account's two rows are gone and three voice and two final rows
   from other learners remain. Not in the data export: they hold nothing the feedback itself
   does not.
5. **A draft and an edit send nothing.** The route only runs the claim when the request asked
   to publish, and the claim answers `not_published` for a draft. A second publish or a save
   after publishing finds the log row and answers `already_handled` (sections 2, 4 and 7).
6. **The claim comes before the send,** as in 0177 Decision 4: a send that fails (Telegram
   down, a 403) is not retried. A 403 already stops the link (`sendToUser`). The feedback
   itself is unaffected, so the miss costs one notification.
7. **After the response.** `cohortRpcResponse` takes an optional `afterOk` hook, run only when
   the RPC returned `ok` and wrapped so a throw is logged and never changes the answer; both
   routes pass an `after()` call. `pingFeedbackPublished` never throws either.
8. **Wording is 0140's draft, titles included.** "Your recording in “<lesson>” has feedback:
   <link>" / "Есть отзыв на вашу запись в уроке «<lesson>»: <link>" and the final-comment
   pair, in the language saved at link time. Unlike the message ping, these carry authored
   titles (the lesson's for a voice take, the course's for a final comment): the privacy policy
   already says Telegram receives "course and lesson titles and a link" (section 5), and the
   subprocessor row says the same, so no legal edit is needed. Links: the lesson page
   `/courses/<course>/<lesson>` for a voice take, `/runs/<run>` (COH-005) for a final comment.
   Slugs are URL-encoded. Wording pending partner review, like the rest of the bot's copy.
9. **Revoked enrolments.** `save_final_comment` already refuses a revoked enrolment.
   `save_voice_feedback` does not look at the enrolment, and neither does the claim: a learner
   whose enrolment was revoked but whose take is answered still gets the message, as they still
   see the feedback on the lesson page. Not changed here.

## Not done here

- **Live delivery on production** is the owner's step (acceptance line 4): link a test
  account to the bot, then publish voice feedback and a final comment for it in Studio. See
  the card's closing comment.

## What would make us revisit it

- Learners who link the bot shortly after feedback arrives ask why they were not told
  (Decision 3): log only real sends, and accept that an edit can message a late linker.
- A failed send turns out to matter (Decision 6): release the log row on failure.
- The owner wants a message when feedback is edited, or per-event switches (0140 "Revisit if").
