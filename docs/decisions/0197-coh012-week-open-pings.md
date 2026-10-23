# 0197 — COH-012: a Telegram message when a week of a cohort course opens

Status: built. Migration 099 is written and applied to the local stack twice, with its verify
script passing (`COH-012 PASS`); it is NOT applied to hosted, as the card says. Decided
unattended under `--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0140 event 1, scheduling option A: one daily Vercel cron asks SQL which weeks
opened, a sent log keeps a re-run from sending twice, nothing is stored ahead of time. 0173 built
the link (`telegram_links`, `lib/telegram/send.ts`); 0177 and 0180 set the shape this card
follows: SQL decides and logs, TypeScript words and sends, a failure never throws. The
`/api/cron/voice-purge` route (0110) is the pattern for the schedule and the `CRON_SECRET`
guard.

## Decisions

1. **SQL decides, in `telegram_week_ping_claim(p_limit, p_now)`** (migration 099, service_role
   only). It inserts the log row for each due (enrolment, week) and returns exactly the rows it
   inserted, so the log insert is the decision and a concurrent or repeated run gets nothing for
   a row someone already claimed. The route has no rule of its own.
2. **When a week opens is 058's expression, restated, not called.** Week N opens at
   `run.starts_at + 7*(N-1) days` (058 header §3; the `unlock_at` expression in
   `_lesson_access_at`). The function cannot be called for this because it answers per user
   across all of their runs ("open in ANY run", 0093 Decision 4), which would hide a week that
   opened in this run if an earlier run of the course had already opened it. Instead
   `supabase/verify/099_telegram_week_pings.sql` checks the two agree on the same seeded data:
   `_lesson_access_at` says `scheduled` with `opens_at` equal to the claim's `opened_at` just
   before, and `open` just after.
3. **Which weeks exist.** A week counts when it has a published, non-archived `entitled`
   lesson with that week. Week 1 always counts: it is the "course has started" message and
   0140 does not tie it to a lesson. A week with only a draft lesson announces nothing, and
   announces on the first run after the lesson is published (verify section 4).
4. **Which weeks are still news.** A week is sent only if it opened after the LATER of the
   enrolment and the link (`linked_at`, which `telegram_link_claim` resets when a stopped
   learner links again, 090 line 199), and within the last 3 days. The first rule means
   someone who enrols or links in week 3 is not sent weeks 1 and 2, the same instinct as 0180
   Decision 3 (an edit never messages a late linker). The second means a cron that was down
   for a week does not send a stale "week 2 is open" during week 3; a day of outage still
   sends. Cost: a learner who links the bot an hour after the week opened is told nothing
   about that week; the course page shows it. Verified at the 3-day boundary (verify section
   6): the same learner is left out at 4 days and claimed at 2 days 23 hours.
5. **The run's end.** A week that would open at or after `ends_at` is not announced (an early
   close, 0093). Verified with a positive control (verify section 7b): a probe, rolled back,
   shows week 5 due to all seven learners while the run is open, then the run is closed at the
   moment week 5 would open and nobody is claimed.
6. **Only live, linked enrolments on a published course.** `revoked_at IS NULL`, an ACTIVE
   `telegram_links` row, `courses.status = 'published'`. A revocation is final (058), so the
   verify script's positive control for a revoked learner is a new enrolment row (0093 c). The
   tier plays no part: week-open pings go to basic and extended alike (0140 section 2).
7. **The claim comes before the send,** as in 0177 Decision 4 and 0180 Decision 6: a send that
   fails (Telegram down, a 403) is not retried, and a 403 already stops the link. The miss costs
   one notification; the course page shows the week regardless.
8. **A batch of 100.** `p_limit` (default 100) bounds one run, so a function invocation cannot
   claim more than it can send inside its time limit. What is left is still due on the next run
   while it is inside the 3 days.
9. **The log holds no personal data.** `telegram_week_pings (enrolment_id, week, claimed_at)`,
   `ON DELETE CASCADE` from `run_enrolments`. `delete_my_account` (latest body 096) already
   deletes the learner's `run_enrolments`, so the rows go with them and the function is not
   re-emitted (verify section 9: after deletion the account's 3 rows are gone, the others
   unchanged). Not in the data export, for the reason in 0180 Decision 4.
10. **Schedule: 07:17 UTC daily,** `vercel.json`, the third cron beside 03:41 and 03:47 (Hobby
    runs it once a day, anywhere inside that hour, 0140). Mid-morning in Europe, when a
    Russian-speaking learner is likely to read it; the message arrives up to about a day after
    the week opens, which is option A's stated cost. The route is `/api/cron/telegram-reminders`
    and is where COH-013's call digest goes.
11. **Wording is 0140's draft,** in the language saved at link time: "Неделя N курса «<title>»
    открыта: <link>" / "Week N of “<title>” is open: <link>"; week 1 "Курс «<title>» начался" /
    "“<title>” has started". The link is the course page, which lists the lessons that opened.
    The text carries the course's authored title, which the privacy policy already says
    Telegram receives ("course and lesson titles"), so there is no legal edit. Pending partner
    review, like the rest of the bot's copy.

## Not done here

- **Hosted migration.** The card asks for "written, not applied". Applying 099 is the gate's
  job when the owner wants it; the route returns 500 on hosted until then (the function does
  not exist) and logs `telegram_week_ping_claim failed`. The cron entry is in `vercel.json`, so
  it starts firing on the next deploy: apply 099 before pushing, or accept a daily 500 in the
  meantime.
- **The route was not driven end to end** against a running server: the local `.env.local`
  points at the hosted project. The claim was called over PostgREST on the local stack with the
  service key (`[]` on an empty stack; the same call as anon is 401), the SQL by the verify
  script, the text and the loop by vitest.
- **Live delivery on production,** which needs the migration and a linked test enrolee.

## What would make us revisit it

- A learner who links the bot soon after a week opens asks why they heard nothing (Decision 4):
  drop the link-time baseline and keep only the enrolment one.
- A day's latency draws complaints (0140's "Revisit if"): option B or C.
- A cron outage longer than 3 days matters more than a stale message (Decision 4): widen the
  window.
- The partner wants a lesson count or titles in the message.
