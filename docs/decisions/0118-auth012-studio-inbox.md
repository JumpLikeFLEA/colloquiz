# 0118 — AUTH-012: the Studio inbox

Status: **decided unattended** (AUTH-012 ran `--no-approval`). Open to
correction.

## Context

0109 Decision 5 makes `/studio` a cross-course "Needs attention" inbox:
waiting submissions per course, run and week with the oldest's age,
unpublished feedback drafts, and calls in the next 7 days, plus a
waiting-count badge on the Studio nav that is the only author alert.
Until this card, `/studio` redirected to `/studio/courses`.

## Decision 1 — no new SQL; the badge and the list share one cached call

Everything the inbox needs is already readable through functions that
gate on `can_edit_course`:

- `review_queue(p_status => 'waiting' | 'draft')` (062) for takes and
  voice-feedback drafts;
- `review_final_comments()` (062) for final-comment drafts;
- `course_calls(course)` (058) for calls.

So no migration. `getWaitingRows()` (`app/(studio)/studio/inboxData.ts`)
is the one source for both the badge (layout) and the waiting list (page).
It is wrapped in React `cache()`, so on `/studio` the two read a single
call per request. `lib/studio/inbox.ts` counts and groups those rows; a
vitest case asserts that the group counts sum to the badge's count.

Rejected: a dedicated `studio_inbox()` function. It would be a schema
change for no new data, and a second SQL path that could drift from the
review queue's statuses.

## Decision 2 — the badge degrades, the page doesn't

The layout renders on every Studio page, including course editing. If
`review_queue` fails (for example, 062 not yet applied on a database),
the badge is hidden and the error is logged, rather than every Studio page
throwing. The inbox page itself still throws on the same error, as
`/studio/reviews` does.

The layout is not re-rendered on a client-side navigation between Studio
pages. The badge updates on a full load or a `router.refresh()`; the
review queue's save and publish already call `router.refresh()`
(`RecordingCard.tsx`, `FinalCommentCard.tsx`).

## Decision 3 — what each section lists

- **Waiting for feedback**: one row per course × run × week, with the
  count, "Oldest sent N ago", and a link to
  `/studio/reviews?course&run&week&status=waiting`. A weekless group
  links by course and run only, since the queue's week filter has no
  "no week" value. Rows are sorted oldest first.
- **Unpublished drafts**: both kinds of human feedback (0109 Decision 6).
  Voice-feedback drafts are grouped like waiting takes and link with
  `status=draft`. Final-comment drafts (a saved, unpublished
  `run_final_comments` row) are grouped per course × run and link to the
  queue's final-comments section (`#final-comments`, an anchor added to
  `/studio/reviews`).
- **Calls in the next 7 days**: `[now, now + 7 days)`, soonest first,
  linking to the course's runs page. Runs are read with an explicit
  course filter, because `course_runs`' "published read" policy also
  returns other courses' runs to an editor (measured: edA could SELECT
  course B's run on the local stack; `course_calls` itself still returned
  0 rows for B).
- An untitled run is named "run from <start date>". Two untitled runs of
  one course otherwise rendered as identical rows (seen at 1280px on the
  local stack).
- Ages round down ("15 hours", "2 days"), so a group never reads older
  than it is.
- One empty state when all three sections are empty; otherwise each empty
  section says so in place.

## Decision 4 — the nav

"Inbox" (`/studio`, the `Inbox` icon) is the first work item, active on
the exact path only. Its badge uses AppSidebar's duels-badge classes and
shows only when the count is greater than 0.

## What would make us revisit this

- The partner misses recordings because she doesn't open Studio (0109's
  own trigger for push alerts).
- The waiting read becomes slow enough to matter on every Studio page:
  move the badge into a streamed slot (AppSidebar's `sidebarPromise`
  pattern) instead of awaiting it in the layout.
- A "no week" value is added to the review queue's week filter: then
  weekless groups can link to exactly their rows.
