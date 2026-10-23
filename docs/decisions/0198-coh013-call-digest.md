# 0198 — COH-013: a Telegram digest of the calls that start soon

Status: built. Migration 100 was written, applied to the local stack twice, and then applied to hosted
through the hosted-apply gate (history 001..100 level); its verify script printed `COH-013 PASS` on
both. Decided unattended under `--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0140 event 4, scheduling option A: the daily cron cannot send "an hour before", so the
call reminder is a digest of the extended enrolee's calls that start in the next day, in the time zone
saved when the learner linked the bot. 0197 built the cron route, the claim-then-send shape and the log
pattern this card follows: SQL decides and logs, TypeScript words and sends, a failure never throws.

## Decisions

1. **SQL decides, in `telegram_call_ping_claim(p_limit, p_now)`** (migration 100, service_role only).
   It inserts the log row for each due (enrolment, call) and returns exactly the rows it inserted, so
   the log insert is the decision (0197 Decision 1). The route has no rule of its own.
2. **Who sees which call is 058's `course_calls` rule, restated, not called.** A non-revoked `extended`
   enrolment sees the calls of that run only. `course_calls` answers for `auth.uid()`, which a cron does
   not have, so the expression is repeated and `supabase/verify/100_telegram_call_pings.sql` checks the two
   agree on the same seeded data: for each learner, what `course_calls` lists inside the window equals what
   the claim announces (a, b after re-enrolling, e after moving to extended), run B's learner sees only
   run B's call, and the revoked and basic learners get zero rows from `course_calls` and nothing from the
   claim. On top of 058's rule: an ACTIVE `telegram_links` row and a published course.
3. **The window is 25 hours, not 24.** A call is due when it starts after `p_now` and at most 25 hours
   after it. The card says "the next 24 hours". Vercel Hobby fires the job anywhere inside its hour
   (0140), so two consecutive runs can be 24 h 59 min apart; with a 24-hour window a call starting in
   that gap is announced by neither run. The extra hour closes the gap. Verified at the edges (verify
   section 2): a call at +24 h 30 min is claimed, one at +25 h 30 min is not, and one that started an
   hour earlier is not. Cost: some learners hear about a call up to 25 h ahead.
4. **A call is announced at most once per enrolee, even if it moves.** The log key is
   `(enrolment_id, call_id)`, as the card says. A call moved after it was announced is not announced
   again (verify section 6, with a positive control: a new call at the same time goes to everyone).
   The learner got the old time; the course page shows the current one. Revisit below.
5. **No late-linker baseline.** Unlike a week-open ping (0197 Decision 4), someone who links the bot
   an hour ago still hears about a call tomorrow: a call ahead is news whenever they link. A stopped link
   that is started again is claimed too (verify section 4, c).
6. **One message per learner per run.** The claim returns rows per (enrolment, call), ordered by learner
   and start time; `lib/telegram/callPings.ts` groups them, so a learner in two runs gets one digest.
   More than 10 calls go in a second message. A learner split by the batch limit (100 rows) gets the
   rest on the next run if the calls are still ahead.
7. **Time zone.** The zone saved at link time (`telegram_links.time_zone`, validated against
   `pg_timezone_names` when the link token was made, 090) formats the time with `Intl.DateTimeFormat`
   in the saved language's locale, with the zone's short name, e.g. "Wed, 28 Oct, 15:00 GMT+1". With no
   zone saved, or one this runtime rejects, the time is in UTC and says "UTC". Tested for Belgrade,
   Tokyo, null, an unknown name, and the date rolling over (23:30 UTC is the next day in Tokyo).
8. **No lead-time wording.** The digest is headed "Calls coming up:" / "Ближайшие созвоны:" and gives
   each call's date and time, never "in an hour". A vitest case fails if any text contains hour, час,
   минут or minute.
9. **Wording.** Per call: `• <when> — <course title> · <call title>` and the join link on the next
   line; the call title is omitted when it has none and clipped at 80 characters. The text carries the
   course's authored title, the call's authored title and the Meet link. The privacy policy already
   says Telegram receives "course and lesson titles and a link"; a call title is the same kind of
   authored title, so there is no legal edit. Wording pending partner review, like the rest of the bot.
10. **The log holds no personal data and needs no export row.** `telegram_call_pings (enrolment_id,
    call_id, claimed_at)`, `ON DELETE CASCADE` from `run_enrolments` and from `run_calls`.
    `delete_my_account` (latest body 096) already deletes the learner's `run_enrolments`, so the rows go
    with them and the function is not re-emitted (verify section 8: after deletion the account's 3 rows
    are gone, the others unchanged; deleting a call removes its rows).
11. **The route runs both jobs and neither blocks the other.** `/api/cron/telegram-reminders` runs the
    week pings, then the call digest, and answers 500 if either claim failed. No new cron entry: the
    07:17 UTC schedule (0197 Decision 10) is the same job. A claim before the migration existed would
    have failed only the call half; hosted has 100 now.

## Not done here

- **The route was not driven end to end** against a running server (the local `.env.local` points at
  the hosted project, and the cron needs `CRON_SECRET`). The claim ran in SQL (the verify script, on
  the local stack and on hosted), the text and the loop under vitest.
- **Live delivery on production**, which needs an extended enrolee with a linked bot and a call in the
  next 25 hours: the owner's step.

## What would make us revisit it

- A learner acts on a stale time after a call moved (Decision 4): key the log on the call's start as
  well and announce a moved call again.
- A day's latency or the 25-hour window draws complaints (0140's "Revisit if"): option B or C.
- The partner wants an hour-before reminder: B or C, with a different message.
