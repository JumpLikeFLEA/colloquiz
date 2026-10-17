# 0158 — COH-014: a teacher adds dated events to a run or a group

Status: built; migration 084 written and applied to the local stack twice,
where `supabase/verify/084_calendar_events.sql` prints `COH-014 PASS` after 86
asserted cells. **Not applied to the hosted project**, as the card asks
("Written, not applied; print rule"). Decided unattended under `--no-approval`;
each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 15 puts "custom events a teacher adds to a run or
a group ("Test day", "No call this week")" on the calendar. COH-015 draws the
calendar and COH-016 the `.ics` feed; this card is the data, the writes, the
one reader and the Studio forms. No learner page shows an event yet, so the
learner-side reading is exercised in SQL only (the verify script) until COH-015.

## Decisions

1. **One table, scope a run XOR a group.** `calendar_events (run_id | group_id +
   teacher_id, title, starts_at, ends_at?, link?)`. A CHECK makes "exactly one
   scope" a constraint; a composite FK `(group_id, teacher_id) ->
   teacher_groups(id, teacher_id)` makes "a group event belongs to the group's
   own teacher" a constraint, the shape 077 used for memberships. Rejected: two
   tables (the reader would be a union of two almost identical tables and
   COH-015 would read both). No grants, no policy: SECURITY DEFINER functions
   only, as 077 does.
2. **One private check decides who may write, `_calendar_scope_check`.** A run
   needs `can_edit_course` on its course; a group needs its teacher; then
   `_studio_can_write` (docs/decisions/0155: "a new write RPC must call it"). The
   three writes share it, so the order of answers is the same everywhere:
   `forbidden` / `group_not_found` for a caller who may not act at all,
   `seat_lapsed` only for an authorised but frozen one. A group that is not the
   caller's answers like one that doesn't exist (077's rule); update and delete
   of a group event that is not the caller's answer `event_not_found`. The
   field rules are one function too (`_calendar_event_fields_check`). Side
   effect: 083's verify script pins the number of functions that call
   `_studio_can_write` (37, now 38) and lists the functions that use an editor
   gate without it; I raised the count and added `calendar_events` (a read) to
   that list, with a comment. That edit is the only change to an earlier verify
   script, and it is the check doing its job.
3. **One reader, `calendar_events()`, for the author and the learner.** A run's
   events go to its live enrolees (`revoked_at IS NULL`, either tier) and to
   anyone who can edit the run's course; a group's events go to its members and
   to its teacher. `can_manage` comes from the database, so the page never
   decides it. A member's rows carry `group_id = NULL`: docs/decisions/0149 says
   no learner-facing page shows a group, and the reader does not hand the id to
   one either. Either tier sees run events (calls stay extended-only, in
   `course_calls`): an event such as "Test day" concerns the whole run.
   Rejected: separate Studio and learner readers (two places to get "who sees
   what" wrong). Anonymous callers have no EXECUTE.
4. **A revoked enrolee, another run's enrolee and a non-member see nothing.**
   Membership of a group already ends with the link (077's trigger), so a
   student whose link ended stops seeing the group's events with no code of
   its own here (verify section 7). A seat that lapses stops the teacher's
   writes and nothing else: events stay visible to students (083, "nobody loses
   access they have").
5. **No user-keyed table, so `delete_my_account` is not re-emitted.** A group's
   events cascade with the group, which `delete_my_account` already deletes
   (077); a run's events cascade with the run, which belongs to a course. The
   verify script deletes a teacher's account and counts 0 events and 0 groups
   left. Print rule (migration header): latest before = 083; latest
   `delete_my_account` body = 082.
6. **Fields.** Title 1–120 characters (trimmed), start required, optional end
   strictly after the start, optional `https://` link up to 2,000 characters (a
   blank link is no link). No all-day flag and no repeat: "repeat weekly" exists
   for calls because they recur; an event is one date. Add it when a teacher
   asks. An event on an ended run is allowed (nothing in the card forbids it and
   a "see you at the final call" note after the end is plausible).
7. **Studio.** An "Events" section on every run card (between Calls and Invites)
   and on the group page (above the roster), both mounted in `WriteArea` so a
   frozen seat disables them. One dialog for add and edit, one AlertDialog for
   delete. Writes go through `POST /api/studio/calendar-events`, a thin relay
   over `callCohortRpc` and the shared error table. Times are in the editor's
   zone, like calls.
8. **The runs and group pages need 084 applied.** They call `calendar_events()`
   and throw if it is missing, the same as the export route did before 077
   (0149, "Surprises"). Apply 084 before deploying; a push closes the card but
   the migration is the owner's step here.
9. **Legal.** An event holds a teacher's text, no personal data about a
   student, and the group's name never reaches a student; I did not find a place
   in `docs/release/legal/` that needs a change, but I did not re-read the whole
   policy for it. Labelled as an assumption; OPS-025 (teacher terms) is the
   place to settle it.

## What would make us revisit it

- A teacher wants a recurring event or an all-day one (Decision 6).
- COH-015 finds it needs the run's title or the course title in the reader's
  row (today it joins `course_runs` itself).
- A learner should see which group an event is for (it would contradict 0149).
