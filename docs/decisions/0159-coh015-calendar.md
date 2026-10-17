# 0159 — COH-015: the calendar on /my and in Studio

Status: built; migration 085 written and applied to the local stack twice, where
`supabase/verify/085_calendar_reader.sql` prints `COH-015 PASS`. Decided
unattended under `--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decisions 15 and 16 ask for one view of the dates that
matter, as a server-rendered month grid at `sm` and up and an agenda on a phone,
on `/my` and in Studio, with no new dependency. COH-014 (0158) supplied the
events and one reader; the other date kinds already have readers of their own
(`course_calls`, `_lesson_access_at`, `my_homework`, `teacher_homework_list`).

## Decisions

1. **One reader, `my_calendar(p_role)`, that calls the existing readers and
   restates none of their rules.** `p_role` is `'learner'` or `'teacher'`
   (anything else is `22023`). Rows: `run_start`, `run_end`, `week_open`, `call`,
   `homework_due`, `event`. Homework comes from `my_homework()` /
   `teacher_homework_list()` and events from `calendar_events()`, so "who sees a
   homework row or an event" has one definition each (0152, 0158 Decision 3).
   Rejected: a reader per role (two places to get it wrong), and re-deriving
   homework recipients inside the calendar.
2. **Two roles, not "everything the caller can see".** An admin or a teacher who
   is also a learner would otherwise get a mixed calendar and no way to tell
   a run they teach from one they study in. `/my` asks for `learner`, Studio for
   `teacher`; the `.ics` feed (COH-016) asks for both.
3. **Learner scope.** Runs where the caller has a LIVE enrolment (`revoked_at IS
   NULL`) of a PUBLISHED course. Week openings only for published, non-archived
   entitled lessons. A call only for a live `extended` enrolment (course_calls'
   rule). Events: those of the caller's runs and the groups they belong to (a
   member's row has no group id, 0158 Decision 3). A revoked enrolee, another
   run's enrolee and a stranger get nothing (verify sections 1 and 5, each beside
   a positive control).
4. **Teacher scope.** Every run of a course `can_edit_course` allows, drafts
   included (a teacher plans before publishing; an admin therefore has every
   course), the calls of all those runs (course_calls gives an editor all runs),
   their own assignments, and the events they can manage (`can_manage`). Week
   openings include draft lessons' weeks, as `_course_run_end` does (058).
5. **Week openings use `_lesson_access_at`'s formula, `LEAST(starts_at + 7 x
   (N-1) days, ends_at)`, and the verify script ties them together.** The week-3
   row of a run equals `_lesson_access_at(lesson, user, now()).opens_at` for a
   scheduled lesson (positive control: the value is not NULL). Past weeks are
   listed; week 1 coincides with the run's start and is still listed, because the
   card says every week.
6. **A due date is a DATE, never a moment.** `homework_due` carries `due_on` and
   no time; the UI places it on that day in every zone, so a student in Auckland
   and one in Lima both see 24 Dec on the 24th (0141 Decision 14).
7. **Time zone: a cookie written by an inline script (the card's open question).**
   A server-rendered grid has to know the zone before it renders, and only
   JavaScript can read it. Options: (a) a client component that sets a cookie and
   calls `router.refresh()`; (b) render instants in the browser and give up the
   server-side grid; (c) an inline `<script>` that writes `colloquiz_tz` and
   reloads once. Chosen (c): it ships no bundle bytes (`/my` stayed at 171.5 KB,
   measured below), keeps the grid server-rendered, and the reload happens only
   when the cookie was absent or different AND the write stuck, so a browser that
   blocks cookies cannot loop. The server validates the cookie with `Intl`
   (`resolveTimeZone`: anything unknown is UTC). Until the cookie exists, or
   without JS, the page renders in UTC and says so. The cookie holds an IANA zone
   name, not personal data beyond the zone, and is read only by these two pages.
   Rejected (a): extra client JS on `/my` against a hard budget. The zone is the
   browser's current zone, so a traveller's calendar moves with them.
8. **An event spanning midnight sits on its start day.** `ends_at` is shown as an
   end time only when it falls on the same local day; no multi-day bars. A teacher
   can add a second event if needed. Revisit if a multi-day event shows up.
9. **Links.** Learner: runs, weeks → the course page; homework → its lesson (or the
   course); a call → its Meet link in a new tab (that is what "Join" is); an event
   → its own link, else the course. Teacher: run dates, weeks, calls and run events
   → the run's page in Studio (`/studio/courses/<id>/runs`); a group event → the
   group page; homework → `/studio/homework`. Studio is where the teacher edits
   them, and the group id is returned only to the group's own teacher (085).
10. **`/my` shows the section only when the learner has at least one date,** like
    Messages, and leaves it out (logging the error) if the read fails, so `/my`
    never breaks because 085 is not applied yet. `/studio/calendar` reads strictly.
11. **Copy.** EN and RU strings live in `app/components/calendar/calendarCopy.ts`,
    not in `lib/alliengll/copy.ts`; `/my` follows the saved EN/RU choice (the `/my`
    rule), Studio is English. New RU copy is pending owner/partner review.

## Legal (found, not changed)

`colloquiz_tz` is a new first-party cookie holding an IANA zone name, read only to place
dates on days, so it is functional, not tracking. `docs/release/legal/privacy-policy.md`
§3.4 lists only `sb-*` and the theme preference, and does not list the existing
`colloquiz_landing_lang` cookie either, so the table was already incomplete. I did not
edit reviewed legal copy; a card should list the functional cookies (`colloquiz_tz`,
`colloquiz_landing_lang`) in §3.4. Labelled as an assumption that no consent is needed for
a strictly functional preference cookie: I did not take legal advice.

## Budget

`npm run budget` on the local stack, same seed, before (HEAD, calendar absent)
and after: `/my` 171.5 KB and 171.5 KB (limit 180); `/` 178.2 / 178.2; `/my/messages`
175.9 / 175.9. The calendar is all Server Components plus one inline script, so
no client chunk is added.

## What would make us revisit it

- A teacher wants an all-day, recurring or multi-day event (0158 Decision 6, and
  Decision 8 here).
- A traveller reports their dates moved: the zone is the browser's current one.
- The learner calendar needs the teacher's group name (it must not, 0149).
- A reload on first visit is judged too jarring: then move to (a) and pay the JS.
