# 0212 — Studio inbox: homework due and done (TCH-017)

## Context
The inbox listed recordings, questions, drafts and calls, but not homework, though assigning and checking it is the
teacher's core loop (0141). `teacher_homework_list` and `teacher_homework_progress` (080) already return what is needed.

## Decisions
1. **No migration.** Recipients are the progress rows (SQL's, 080); "done" is `done`. The page reads the list and the
   progress and joins them with `buildHomeworkViews` (targets are not needed, so none are read).
2. **"Due" section rows:** an assignment with at least one recipient not done and a due date that is past or within the
   next 7 days (`CALL_WINDOW_DAYS`). Past first, then soonest. An unfinished assignment with no due date is not listed
   (the Homework page has it); it appears only once finished.
3. **"Finished" rows:** every recipient done and the latest recipient `last_activity_at` within the last 7 days. The RPCs
   store no completion time, so the latest activity stands in for it. This is an approximation and the row says "last
   activity", not "finished". A done assignment with no activity time is not listed.
4. **Fail-soft:** a failed read shows "Couldn't load your homework" and the page is not "Nothing needs your
   attention" (as for questions). A lapsed seat still sees the section: reading is not frozen (0155).
5. **No destructive colour** for a past due date (0152): "Was due …" is muted text; the count pill uses the existing
   warning tokens like the other inbox pills.

## Revisit if
Teachers want finish time to be exact (then a migration adds a completion timestamp), or a "no due date" nudge is wanted.
