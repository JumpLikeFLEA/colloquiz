# 0173 — COH-010: a learner links the Telegram bot

Status: built. Migration 090 was written and applied to the local stack; the owner
then asked for it to go to hosted (2026-10-18) and it was applied through the
hosted-apply gate, verify script PASS on hosted, no seeded row left. Builds docs/decisions/0140
(reach, events, scheduling, language), which the owner decided; this file records
only what was chosen while writing the card.

## Context

0140 settled that a learner links `@Alliengll_bot` through a `t.me/<bot>?start=<token>`
deep link, that the language is saved at link time, and that the time zone is captured
from the browser. COH-011..013 and TCH-012/013 send through the link this card builds.

## Decisions

1. **Webhook identity is the sender's id, not a trusted chat id.** `/start <token>` links
   `from.id`; the update is only answered when `chat.type` is `private` and `chat.id`
   equals `from.id` (`readUpdate`, `lib/telegram/messages.ts`). A group message that
   carries a token links nothing.
2. **One active link per chat.** A partial unique index on `chat_id WHERE stopped_at IS
   NULL`, and `telegram_link_claim` stops another account's active link to the same chat
   before inserting. Without it, two accounts sharing a Telegram chat would each be
   messaged about the other's course. (Opposite choice: reject the second claim. Rejected:
   the person who just pressed Start is the one who holds the chat.)
3. **The token-creating RPC is not gated on an enrolment.** TCH-012 reuses this table for
   teachers, so the gate would have to be loosened then. The UI offers the panel to an
   enrolee only (`/my`: a non-revoked enrolment; the course page: `cohortAudience` is basic
   or extended). Nothing paid is exposed by the link, so this is not the "UI decides
   entitlement" failure mode in `docs/handoff.md`.
4. **Tokens: 64 hex characters, hashed, one hour, one outstanding per user.** Creating a
   token deletes the user's earlier ones (and anyone's older than a day). "Turn off" also
   deletes the user's pending token. Single use and expiry are decided by one `UPDATE ...
   WHERE used_at IS NULL AND expires_at > now() RETURNING`.
5. **A stopped link keeps its row** (`stopped_at`), as 0140 specified; relinking clears it.
   The privacy policy says so (retention row). A 403 from `sendMessage` stops the link via
   `telegram_link_stop`.
6. **The webhook answers 200 once authenticated, whatever happens inside.** Telegram retries
   non-2xx updates; a retry of a half-done `/start` would repeat the failure. A body that is
   not JSON gets 400. A missing or wrong `X-Telegram-Bot-Api-Secret-Token`, or an unset
   `TELEGRAM_WEBHOOK_SECRET`, gets 401 before the body is read. Errors are logged without
   the update, which can carry a token.
7. **Replies.** After `/start`: the 0140 draft extended to name call reminders (it decided
   all four events). Unknown token, `/stop` with nothing on, and help are bilingual because
   the chat has no saved language. Wording pending partner review.
8. **Client JS.** The panel is a client component (a `fetch` to `/api/telegram/link`, not a
   Server Action, for the reason in 0086). The server page passes one language's strings as
   a prop. Budget, local stack (`npm run budget`): `/my` 174.0 -> 174.4 KB (limit 180);
   `/courses/future-imperfect` (a visitor) 172.1 -> 172.9 KB (limit 182); the enrolee's
   cohort course page `/courses/coh005-fixture` 172.1 -> 172.9 KB, new entry in
   `scripts/budget.ts`. A `next/dynamic` import on the course page was tried to keep
   visitors at 172.1 KB; it measured 173.3 KB, so the static import stays.
9. **Legal basis drafted as Contract (Art. 6(1)(b))**, like the calendar feed: a feature
   the person switches on. Consent (Art. 6(1)(a)) is the alternative, since the opt-in is
   pressing Start. For the owner's sign-off with the legal text; the policy's "we do not
   rely on consent" sentence stays true only under Contract.

## Not done here

- No message about an event (COH-011..013). `lib/telegram/send.ts` is the sender they use.
- `setWebhook` and the env vars on Vercel: the owner's, see the card's closing comment.
- Live link and `/stop` on production: the
  owner's positive control.

## What would make us revisit it

- Telegram returns the account id at sign-in (0140): a Telegram-signed-in learner could skip
  the link step.
- A second account legitimately sharing a chat (a parent and child): decision 2.
- The partner wants a reminder per event: one switch covers all today (0140).
