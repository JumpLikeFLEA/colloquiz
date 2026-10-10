# 0106 — AUTH-010: cohort authoring UI

Status: **decided unattended** (AUTH-010 ran `--no-approval`).

## Context

AUTH-010 is the editor UI over COH-002's functions (migration 058,
docs/decisions/0105): course format, lesson weeks, runs and calls. Every
rule (gating, the no-re-lock rule, run lengths) lives in those RPCs. The UI
calls them through thin routes (`app/api/admin/courses/cohortRpc.ts`) and
toasts their refusals, mapped in `lib/courseAuthoringErrors.ts`.

Where things are:

- The course page (`/app/admin/courses/[id]`) gets a Format section (format,
  "how to join" link, a notice while a run is in progress, a link to runs) and
  a week Select on each lesson row of a cohort course.
- The new page `/app/admin/courses/[id]/runs` lists runs and their calls.

Both pages are gated on `canEditCourse(id)`.

## Decision 1 — the week is a Select, weeks 1–8

The options are "No week" and Weeks 1–8. A week already stored above 8 is
listed too. A cohort runs four weeks (docs/handoff.md). 8 leaves room for a
longer course, and a Select matches the access-level control next to it
(AUTH-009). A free number field was the alternative; it adds parsing and
validation for weeks nobody has asked for.

An entitled lesson with no week gets a "Needs a week" pill, because
`publish_lesson` refuses it (`week_required`).

## Decision 2 — the run phase is computed in TypeScript, for display only

`lib/cohortSchedule.ts` `runPhase` mirrors 058's "in progress = starts_at <=
now() < ends_at". It decides only what each run shows:

- a locked start field;
- "Close run now" for a started run;
- Delete for an upcoming run;
- the course page's "a run is in progress" notice.

It never decides access, and every RPC re-checks the same condition, so a
stale or wrong phase gets a refusal back, never a wrong write. The phase is
computed once on the server (page.tsx), so the server and client renders agree.

## Decision 3 — times are in the editor's browser timezone

Runs and calls are entered with `datetime-local` in the editor's own zone,
converted to an instant in the browser, and shown in that zone, with the
zone named on the runs page. The server renders in UTC (Vercel), so
formatting there would disagree with the browser. `LocalTime.tsx` therefore
renders a placeholder on the server and the local value on the client, through
`useSyncExternalStore`, with no effect and no setState. Dialogs mount only
while open, so their initial wall-clock values are computed in the browser.

Revisit if a second editor in another zone shares a course: the stored
instants are right either way, only the display differs.

## Decision 4 — "repeat weekly ×N"

The client steps the CALENDAR date (`weeklyRepeats`), so a 19:00 call stays
at 19:00 across a daylight-saving change, instead of adding 7×24h. The test
pins Europe/Belgrade across 2026-10-25. The client sends N instants (N ≤ 12).
The route calls `create_call` once per instant. A batch RPC would be a schema
change, so there isn't one.

It stops at the first refusal and reports "Created k of N calls." Every call
shares one URL and title, so a URL refusal comes on the first call and creates
nothing. The route has no other per-call failure in 058.

## Decision 5 — the "how to join" link is edited here

The acceptance doesn't name `courses.how_to_join_url`, but COH-002 wrote its
editor RPC "for AUTH-010", no other card owns the field, and COH-004 renders
it. It is one input in the Format section. This was taken as part of "set a
course's format", not as new scope.

## Decision 6 — "close" means close now

`close_run` takes an optional earlier end. The UI offers only "Close run
now", behind a confirm, because 0093's use case is ending a run early.
Choosing a past end adds a date picker for a case no one has described.
Delete is offered for upcoming runs only. The RPC still refuses a run with
enrolments (`run_has_enrolments`), which the editor can't see, so that refusal
is toasted.

## Decision 7 — no optimistic state on the week Select

The Select shows the server's value, which changes after `router.refresh()`,
the same as the access-level Select. A refused change (the re-lock rule)
therefore never shows the new week, even briefly.

## Decision 8 — "Open to anyone: none." on a cohort course

The course-level summary no longer says a cohort course "needs at least one
[lesson open to anyone] before it can be published": 058 applies that rule
to self-paced courses only (0094 Decision 2). This settles 0103's "revisit
if COH-002 adds cohort courses" line.

## Revisit if

- The partner asks for weeks above 8, or for a specific past end date when
  closing a run.
- A batch "create calls" RPC is added for other reasons: the route's loop
  can become one call.
