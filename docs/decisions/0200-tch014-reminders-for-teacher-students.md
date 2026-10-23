# 0200 — TCH-014: the Telegram reminders panel for a learner tied to a teacher

Status: built. No migration. Decided unattended under `--no-approval`.

## Context

COH-010 (0173 Decision 3) showed the `/my` panel to an enrolee only (`hasEnrolment`). A student whose
only tie is a teacher could never link the bot, so the message pings (0177) and homework pings (0199)
never reached them. Both decisions flagged it. `create_telegram_link_token` is open to any signed-in
user (0173 Decision 3), so nothing server-side changes.

## Decisions

1. **The condition is `hasEnrolment || hasTeacherTie`.** `hasTeacherTie` is
   `teachers.length > 0 || threads.length > 0 || homework.length > 0`, three reads `/my` already makes
   for its own sections (active link, conversation, assigned homework). No new query, so the panel
   appears exactly when "Your teachers", "Messages" or "Homework" does. A learner with none of them
   still sees nothing.
2. **An enrolee keeps the course text; anyone else gets `leadOffStudent`.** It names only teacher
   replies and homework (with the day-before reminder) and not weeks, feedback or calls they do not
   have. A learner who is both gets the enrolee text, which already mentions homework (0199). The
   on/pending/off-again strings are neutral and shared.
3. **Wording is pending partner review**, like the rest of the panel.

## Not done here

The course page's panel stays enrolee-only (it is a cohort-course affordance).

## Revisit if

A learner can have a teacher tie that `/my` does not load (the reads change), or the bot sends a
third kind of message a teacher-only student should hear about.
