# 0140 — COH-006: Telegram bot notifications

Status: decided by the owner, 2026-10-14 (`type:decision`, card #167). Not
part of the M3 bar, but filed in M3 (owner).

## Context

The partner asked for reminders through a Telegram bot on 2026-10-07: "week
2 is open" and "your feedback is ready" (docs/handoff.md, "Open questions").
The bot exists: @Alliengll_bot, client id `8866306463`. ANON-010 tested how
the bot can reach a learner (docs/decisions/0098):

- **Through sign-in: no.** Supabase requests `telegram:bot_access`, but
  Telegram's consent page asked nothing about bot messages. The ID token's
  `sub` (`15027785433728414161`) is above the int64 maximum, so it is a
  pseudonymous id, not a chat id. `sendMessage` to it returned
  `400 chat not found`.
- **Through a `/start` deep link: yes.** `t.me/Alliengll_bot?start=anon010`,
  Start, then `sendMessage` to that update's `from.id` returned `ok: true`.
  The start parameter allows `A-Z a-z 0-9 _ -`, up to 64 characters
  (core.telegram.org/bots/features#deep-linking).

Scheduling constraints, from what the project runs on:

- Vercel Hobby crons run **once per day**, firing anywhere in the scheduled
  hour (±59 min) (vercel.com/docs/cron-jobs/usage-and-pricing, updated
  2026-07-15). The project is on Hobby (0069), and `vercel.json` already
  holds one such job (`/api/cron/voice-purge`, 03:41 UTC, `CRON_SECRET`,
  0110).
- pg_cron runs 033's and 059's jobs. 0110 rejected it for the voice purge
  because it would have needed a service-role key stored in the database.

## 1. Reach: settled by evidence

The learner presses a "Get reminders in Telegram" link:
`t.me/Alliengll_bot?start=<token>`.

- `<token>` is random, at most 64 characters from the allowed set, stored
  hashed, single-use and valid for one hour. Invite tokens (0107) are stored
  hashed the same way.
- A webhook route, `/api/telegram/webhook`, checks
  `X-Telegram-Bot-Api-Secret-Token` (setWebhook's `secret_token`). It then
  matches the token and stores the chat id against the user.
- The bot replies with what it will send and how to stop.

This works for any account, email or Telegram, and needs no sign-in scope.
`telegram:bot_access` can be dropped from the provider's scopes.

**Opt-in** is pressing Start through that link; nothing is on by default.

**Opt-out** works three ways:
- the `/stop` command;
- "Turn off" where the link was;
- blocking the bot. A `403` from `sendMessage` marks the link stopped, so
  nothing retries it.

One switch covers all reminders. Per-event toggles wait until someone asks
for them.

## 2. Events (owner picks)

| Event | Who gets it | Trigger | Needs a clock? |
|---|---|---|---|
| Week N is open | Cohort enrolees with a live enrolment | The week's lessons open: the run start plus 7 × (N−1) days, as decided by the cohort schedule in SQL (0093). Week 1 reads "the course has started". | Yes |
| Your feedback is ready | The learner whose recording was answered | The author publishes voice feedback (VOICE-006) | No: sent after the publish succeeds |
| Your final comment is ready | The enrolee | The author publishes the final comment (COH-008) | No |
| Call reminder | Extended-tier enrolees | A call in the run's schedule (COH-004) | Yes, and timing matters |

Not for free mini-courses. The product thesis counts a learner who finishes
and leaves as a success (docs/handoff.md), so there are no "come back"
nudges.

## 3. Scheduling "week N is open" (owner picks)

- **A. A daily Vercel cron, computed at send time.**
  - `/api/cron/telegram-reminders` runs daily and asks SQL which weeks opened
    since the last run, using the same schedule function the lesson state
    uses. Nothing is stored ahead of time.
  - A sent log, unique per enrolment and week, makes a re-run send nothing
    twice.
  - Cost: the message arrives up to about 24 h after the week opens.
  - Needs no new infrastructure.
- **B. pg_cron hourly, calling that same route** through `pg_net` with
  `CRON_SECRET` held in Vault.
  - The message arrives within about an hour.
  - Cost: a secret in the database. It is a weaker secret than 0110's
    service-role key, since it can only trigger this route.
  - It adds a second scheduler.
- **C. Vercel Pro**, the same route every few minutes. A plan change.

A per-week queue written at enrolment (a stored schedule) is not offered:
it would need rewriting whenever a week moves, and 0093 already lets an
unstarted run's dates change.

Call reminders only make sense under B or C. Under A, the best it can do is
a "you have a call today at HH:MM UTC" morning digest, and the bot doesn't
know the learner's time zone.

## 4. Message language (owner picks)

The partner writes Russian. `/my` and the course pages follow the saved
EN/RU cookie, but a cron has no cookie. Options:
- Russian only;
- the language saved when the learner linked the bot, read from that cookie
  at link time;
- English, like the lesson chrome.

Draft wording (Russian, with English beside it):
- "Неделя 2 курса «<title>» открыта: <link>" / "Week 2 of <title> is open: <link>"
- "Есть отзыв на вашу запись в уроке «<lesson>»: <link>" / "Your recording in <lesson> has feedback: <link>"
- "Готов итоговый комментарий по курсу «<title>»: <link>" / "Your final comment for <title> is ready: <link>"
- After `/start`: "Готово: буду писать, когда откроется новая неделя или придёт отзыв. Отключить: /stop." / "Done: I'll message you when a new week opens or feedback arrives. To turn this off: /stop."

## Decision (owner, 2026-10-14)

- **Reach:** the `/start` deep link (section 1). The owner did not re-open
  this; the evidence settled it.
- **Events:** all four: week N is open, feedback is ready, final comment is
  ready, and call reminders.
- **Scheduling:** A, one daily Vercel cron, computed at send time.
- **Language:** saved when the learner links the bot.
- **Cards:** filed in M3, not started in this session.

**Calls under a daily cron (decided in-session from the two picks above;
the owner may override).** A call reminder is a daily digest of the
extended enrolee's calls that start in the next 24 hours, sent by the same
cron. Times are shown in the learner's time zone, captured from the browser
along with the language when they link the bot. No message promises "an
hour before". If that is wanted, it is option B or C, as section 3 says.

## Recommendation (as laid out before the decision)

- **Reach:** the deep link.
- **Events:** "week N is open", "your feedback is ready" and "your final
  comment is ready".
- **Scheduling:** A, the daily cron computed at send time. The partner asked
  for "week 2 is open", not "at 10:00 exactly". The latency is the price of
  no new infrastructure, and B stays open if a day turns out to be too slow.
- **Language:** the one saved at link time.

## Legal (any option)

The bot adds new processing:
- the learner's Telegram chat id, stored;
- Telegram receives the message text (course and lesson titles).

That means a privacy-policy row (what, why, retention: until `/stop` or
account deletion), the chat id in the account export, and its deletion with
the account. subprocessors.md's Telegram row gains the messaging role.
Before launch it needs no notice (0095 Decision 1); after launch it is a
new data category, so it gets the in-app banner (0095 Option A).

## Build cards (filed in M3 by the owner, 2026-10-14)

1. **COH-010 (#201): link a learner's Telegram for reminders.**
   - A migration with a link table (user, chat id, language, linked/stopped)
     and hashed one-hour tokens.
   - The webhook route with the secret-header check, `/start <token>` and
     `/stop`.
   - The link and its status with "Turn off" on `/my`, and on the cohort
     course page for an enrolee.
   - Export and deletion, and the legal rows.
   - Acceptance includes a live link and `/stop` on production, plus `/my`
     under its JS budget.
2. **COH-011 (#202): reminder that feedback or a final comment is ready.** Sent after the publish
   succeeds. A send failure never fails the publish, and a sent log stops a
   republish from messaging twice. Acceptance: a live message for each.
3. **COH-012 (#203): reminder that week N is open,** on the chosen scheduler, computed from the
   SQL schedule. The sent log is unique per enrolment and week. Acceptance:
   a seeded run whose week opened gets exactly one message across two runs.
4. **COH-013 (#204): call reminders.** Chosen, under A, as the daily digest described in "Decision".

## Revisit if

- Telegram starts returning the account id at sign-in: Telegram-signed-in
  learners could then skip the link step.
- The partner wants per-event control, or reminders for free courses.
- A day's latency draws complaints: move to B.
