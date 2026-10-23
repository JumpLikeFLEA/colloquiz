# 0199 — TCH-013: Telegram messages about homework

Status: built. Migration 101 was written and applied to the local stack twice; its verify script
(`supabase/verify/101_telegram_homework_pings.sql`) printed `TCH-013 PASS`. It was then applied to
hosted through the hosted-apply gate (history 001..101 level). The CLI shows no NOTICE lines, so the
hosted run is evidenced differently: a control script that raises `TCH-013 FAIL` exits 1 through the
same command, and the verify script with a final `SELECT 'TCH-013 PASS ...'` appended returned that row
(it ran to its end with no assertion raised); afterwards hosted held 0 log rows, 0 `@verify.test` users,
0 `v101-` courses and 0 assignments. Decided unattended under `--no-approval`; each call below is one the owner
can overturn.

## Context

TCH-005 (0152) built homework and left its Telegram pings to this card. 0173 built the link
(`telegram_links`, `lib/telegram/send.ts`); 0177, 0180, 0197 and 0198 set the shape this card
follows: SQL decides and logs, TypeScript words and sends, the claim is logged before the send, a
failure never throws.

## Decisions

1. **SQL decides, in two service_role functions (migration 101).** `telegram_homework_new_claim(
   assignment, limit, now)` for the message right after an assign, `telegram_homework_due_claim(
   limit, now)` for the daily cron. Each inserts the log row and returns exactly the rows it
   inserted, so the insert is the decision (0197 Decision 1).
2. **Who receives it is `_homework_recipients`, called, not restated.** It is 080's one definition
   (a direct target or a live member of a targeted group, with the teacher's link active, profile not
   deleted). Called per teacher through `CROSS JOIN LATERAL`, because with both arguments NULL it
   returns nothing by design (`supabase/migrations/080_homework.sql`, section 2). On top of it: an
   ACTIVE `telegram_links` row, and a published course (a draft course is invisible to the student in
   `my_homework()`, so a ping about it would point at nothing).
3. **The "new" ping is sent by the assign route, after the save.** `/api/studio/homework` calls
   `pingForHomework` inside `after()` once `assign_homework` returned ok (the 0177 Decision 5
   pattern). The claim refuses an assignment older than an hour, so a stray call cannot announce old
   homework. The route calls it once, so a student added to a targeted group later, or who links the
   bot later, is not told about it as new; the due message still reaches them.
4. **"Tomorrow" is the student's, in the zone they saved when they linked.** `due_on` is a DATE with
   no zone (0152 Decision 5). A (assignment, student) is due when `due_on` equals the day after
   today in `telegram_links.time_zone`, UTC with none or with a name this database does not know
   (`pg_timezone_names`, so one bad row cannot fail the whole run). Each student therefore matches on
   exactly one calendar day: consecutive daily runs neither skip nor repeat a homework, except across
   a cron outage (a day missed is a message missed). Verified in verify section B: at 2030-06-10
   20:00 UTC a UTC student is claimed for a homework due on the 11th and an Auckland student (08:00
   on the 11th there) for one due on the 12th; a day later the UTC student is claimed for the 12th.
5. **Done is `_homework_progress`'s, not a second rule.** Done means every lesson in scope is
   complete (075). A partly done course is still announced. An empty scope (the lesson was archived)
   is never done and is not announced either: there is nothing to do. Verified with a positive control
   for each exclusion (verify B4, B6): the same student is claimed once the only obstacle is removed.
6. **A student told about new homework in the last 12 hours gets no "due tomorrow" for it.** This is
   a deliberate narrowing of the card's wording ("one ping per not-done homework due in the next 24
   hours"): a homework assigned in the morning and due tomorrow would otherwise send two messages,
   hours apart, both with the date. The rule is one `NOT EXISTS` on the log. Verified both ways
   (verify B7). Cost: homework assigned just after the day's cron and due the next day gets one
   message, not two. Revisit below.
7. **One digest per student per run** for "due tomorrow", at most 10 items per message
   (`HOMEWORK_PER_MESSAGE`); "new" is one message per assignment and student.
8. **Claim before send.** A send that fails is not retried (0177 Decision 4); a 403 already stops the
   link. The assign route claims in batches of 50 and sends five at a time, until a batch comes back
   short; an assign has at most 500 students and 100 groups (080), so a call is bounded. Not measured:
   the function duration for a few hundred sends.
9. **The log is `telegram_homework_pings (assignment_id, student_id, kind, claimed_at)`.** It holds a
   user id, so it must go with the account; the profile row stays on deletion (ADR 0002), so a
   `ON DELETE CASCADE` from `profiles` never fires. It goes through the teacher link instead: a row
   exists only for a student with a live link to the assignment's teacher, and ending or deleting that
   link fires `_teacher_link_ended_drop_homework`, which migration 101 re-emits with one more DELETE.
   `delete_my_account` (latest body: 096) is therefore not re-emitted. Verified (verify D): ending a
   link, deleting the assignment, a student deleting their account and a teacher deleting theirs each
   remove exactly the right rows, with positive controls. **Mutation check:** with 080's body of that
   trigger function restored, the verify script FAILs at D1 ("f ended the link: f has no log rows
   (got 2, want 0)"); migration 101 re-applied afterwards.
10. **Not in the data export.** The log says only when a notification was sent; the homework it is
    about is in `my_homework_export()`. Same reasoning as 0180 Decision 4. The owner may disagree: an
    access request arguably covers it.
11. **Wording.** New: "New homework from your teacher: “Course · Lesson” (due 25 Oct). <link>" and
    the Russian pair; digest header "Homework due tomorrow:" / "Домашнее задание на завтра:". The
    text names the course and lesson by their authored titles and links to `/my`. It names no teacher
    and carries no note: a note is free text a teacher wrote about a student (0177 Decision 6 kept
    names and bodies out of the bot for the same reason). A test fails if the teacher's name or note
    reaches the text. The bot's linked and help replies and the `/my` panel's lead now mention
    homework. Wording pending partner review.
12. **Legal copy is not edited here.** The privacy policy (`docs/release/legal/privacy-policy.md`,
    lines 99 and 193) and the Telegram row of `subprocessors.md` say the bot messages "about a course
    you joined". Homework from a teacher is a new purpose, like 0177's message pings. Proposed
    wording for the owner: "about a course you joined, or when your teacher gives you homework or
    writes to you". Titles and a link are already covered ("course and lesson titles and a link",
    line 219). Before launch no notice is needed; after it, Terms §10 (0095).
13. **No new cron entry.** The due digest is a third job in `/api/cron/telegram-reminders`
    (07:17 UTC, 0197 Decision 10); the response gains a `homework` summary and answers 500 if any of
    the three claims failed.

## Not done here

- **A student with no enrolment cannot link the bot.** The `/my` panel is offered to enrolees only
  (`app/(english)/my/page.tsx`, `hasEnrolment`; 0173 Decision 3), so a student whose only tie is a
  teacher link gets no homework pings. 0177 flagged the same gap for message pings. Proposed card:
  offer the panel to a learner with a teacher link, a conversation or homework.
- **The routes were not driven end to end:** the local `.env.local` points at the hosted project and
  the bot needs `TELEGRAM_BOT_TOKEN` and `CRON_SECRET`. The claims ran in SQL (the verify script),
  the text and the loops under vitest (75 tests in `lib/telegram/telegram.test.ts`, 18 of them new).
- **Live delivery on production,** which needs a linked test student and a teacher.
- **360px** is not measured for the panel's longer lead on `/my` and the course page: it is a
  wrapping paragraph in an existing card, no new element.

## What would make us revisit it

- A student asks why a late-added group member heard nothing as new (Decision 3).
- Two messages are wanted for a same-day assign (Decision 6): drop the 12-hour rule.
- A missed cron day matters (Decision 4): widen the window to two days and rely on the log.
- Teachers want a note in the ping (Decision 11) or the log in the export (Decision 10).
