# 0145 — AUTH-019: Studio labels a Telegram learner by @username

Status: **decided unattended** (AUTH-019 ran `--no-approval`). Open to
correction.

## Context

A learner who signs in with Telegram has no email (0098), so the Studio RPCs
that return `auth.users.email` gave an empty label. `privacy-policy.md`
section 5 already says an author sees "your email or Telegram username";
AUTH-011 deferred this to after ANON-012 (0116 D6). Rows that return the
email, found with `rg "u\.email" supabase/migrations`: 062 `review_queue`,
062 `review_final_comments`, 063 `learner_roster`. 064 (learner page) and the
inbox read these, not `auth.users`.

## Decision 1 — one helper, the column keeps its name (*unattended*)

Migration 073 adds `learner_contact_label(uuid)`: the email if non-empty,
else `'@' || identity_data->>'preferred_username'` of the account's
`custom:telegram` identity, else `''`. The three RPCs are re-emitted with it
in place of `u.email::TEXT` (and in their ORDER BY). `learner_email` keeps
its name and type, so `lib/reviews/queue.ts`, `lib/learners/roster.ts` and
every Studio component are unchanged and the label order (invite name, email,
@username) falls out of `learnerLabel`. Options rejected: a new
`learner_username` column (every reader and the `label !== email` checks
would change for no gain).

## Decision 2 — the helper is not callable

SECURITY DEFINER, `EXECUTE` revoked from public, anon and authenticated:
only the definer RPCs call it, so it cannot become an email/username lookup
for an arbitrary id. The RPCs' own `can_edit_course` filter is untouched.

## Verification state

Re-emitted bodies were diffed against 062/063: only the email expression and
the ORDER BY tail differ (printed in the card comment). The migration is NOT
applied, so the full protocol (editor of A sees a Telegram learner of A and
not one who only touched B; non-editor gets zero rows; 360px) is not run.

## Revisit if

A privacy-policy change widens or narrows what an author sees.
