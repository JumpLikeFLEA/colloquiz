# 0232 — Remove the Discord feedback webhook (OPS-040)

Owner, 2026-11-14 (while planning MIG-001, #294). Implemented 2026-11-20.

## Context

Discord sign-in is gone (0221). The feedback webhook was the last Discord
dependency: `app/api/feedback/route.ts` called `notifyNewFeedback` from
`after()`, which POSTed the feedback text to `FEEDBACK_DISCORD_WEBHOOK_URL`.
That message was the only way the owner learned new feedback had arrived
(no in-app notification, no sidebar badge, no email: the app sends none).

## Decision

1. Delete `lib/feedbackNotify.ts` and its one call site. The route still
   inserts the row and answers `{ ok: true }`; nothing else changes. No test
   file existed for the module.
2. Drop `FEEDBACK_DISCORD_WEBHOOK_URL` from `.env.example` (`.env.local.example`
   was deleted by MIG-001; `docs/setup.md` never listed the variable).
3. Drop the Discord row from `subprocessors.md`: version 1.9, change-log line.
   The privacy policy never named the webhook, so it is unchanged. Removing a
   recipient is not material (0095; the 1.7 precedent).
4. New feedback is now seen only by opening `/app/admin/feedback`. A
   replacement is the owner's call and a separate card.

5. Renumber: this took subprocessors 1.9, which 0201 had assigned to the OPS-029 drafts. 0201 and the
   maintainer note in `privacy-policy.md` now say those drafts apply as privacy 1.13 and subprocessors 1.10.
   The privacy version is unchanged.

## After the push (owner)

Delete the Vercel variable, then the webhook in Discord, in that order.

## Revisit if

The owner wants a heads-up for new feedback again (in-app badge or email).
