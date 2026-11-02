# 0211 — PROG-009: an "Up next" card at the top of /my

Status: decided unattended (`work on next --no-approval`), 2026-11-02. Issue #269.

## Context

`/my` stacks up to eight sections in a fixed order (`app/(english)/my/page.tsx`),
so an unread teacher reply or homework due tomorrow can sit below the calendar.
The card leads the page with the few things to do now, ranked by the issue:
an unread teacher reply, the undone homework with the soonest due date, the
Continue lesson (PROG-003, 0179), a call in the next seven days. At most three
rows, none when there is nothing to do, and no new read.

## Decisions

1. **One candidate per kind, then the first three.** The issue's order is a
   ranking of kinds, each named in the singular, so the card never shows two
   homework rows or two Continue rows. With all four kinds present the call is
   the one left out. Pure, in `lib/upNext.ts` (`upNext`), unit-tested.
2. **Unread replies are one row.** One teacher with unread messages: the row
   opens that conversation (`/my/messages/<teacherId>`) and names them. Several:
   one row to `/my/messages` with the total. Three teachers writing must not push
   homework off the card.
3. **Homework order.** Not done only. Soonest due date first; a date already past
   is the soonest, as it is the most pressing (the row still reads "Was due", in
   muted tokens, never destructive: 0152). No due date sorts last. Ties: the
   oldest assignment, then the id, so the order never depends on the read's.
4. **Homework the learner cannot open is skipped** (a scheduled lesson, a paid
   lesson without entitlement): it is not something to do now. Its row in the
   Homework section still says why. A whole-course assignment counts and links to
   the course page.
5. **Continue** is the first course, in the page's own course order (enrolled
   first, then the catalogue's, `listedCourses`), with a Continue lesson and not
   complete (completed < total). A finished course's Continue (the last lesson
   opened, 0179) is not a thing to do. A Continue that opens the same lesson as
   the homework row is skipped in favour of the next course's.
6. **Call**: `home.nextCall` (the soonest upcoming call of an extended enrolment,
   joinable two hours after it starts) when it starts within seven days of now.
   The row links straight to the call's meeting link, in a new tab, like the
   Next call section's Join.
7. **No duplicate call on the page.** When the card shows the call, the "Next
   call" section below it is left out: the same call twice, one under the other,
   read as a mistake. When the call is beyond seven days or squeezed out by the
   three-row cap, the Next call section shows as before.
8. **No new read.** The card reads the page's own `home`, `threads` and
   `homework`; the `Promise.all` keeps its eight reads.

## What would make us revisit

- Learners with several unread teachers asking for one row each.
- The partner wanting overdue homework ranked after upcoming homework.
- A fifth kind (AI feedback ready, a week opening) — the order is the issue's,
  not derived; a new kind needs the owner's place for it.

## Measured

Local stack, `next dev`, system Edge, 2026-11-02. A throwaway learner (deleted
afterwards, its rows removed; a read-only count printed 0|0|0|0) linked to the
`hw-teacher` fixture, with rows seeded per state.

- 360px, `scrollWidth/innerWidth`: 360/360 for no items (`play006-signedin`);
  message alone; homework alone; Continue alone; call alone (the Next call
  section absent); all four kinds, EN and RU (rows: reply, homework, Continue;
  the Next call section back); homework + Continue + call, EN and RU.
  `npm run viewport360 --expect="New reply from Anna"` and `--expect="Что дальше"`
  (RU): 360/360.
- Fixture readings: `prog002-learner`'s call on 9 Nov 18:00 UTC is more than
  seven days out, so the card shows only Continue and Next call stays.
  `hw-student`: homework "Was due 21 Oct" (overdue sorts first), then Continue.
- A first "all kinds" run showed no homework row: the seeded attempt was on the
  homework's own lesson (a `lesson_attempts` → `lessons` join printed "Free
  lesson", the assigned lesson). Read as done and skipped; that `my_homework`
  returned `done = true` for it was not printed separately. Reseeded on another
  course's lesson, and the row appeared.
- `npm run budget`, before and after: identical on every route; `/my` 175.1 /
  175.1 KB (limits 180, 182). The guard exits 1 on `/runs/...f1a1` (180.8 KB of
  179) both before and after, unrelated to this card.
