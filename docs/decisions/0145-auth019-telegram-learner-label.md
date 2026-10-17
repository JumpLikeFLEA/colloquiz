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

073 is applied to hosted (probe 2026-10-17: `learner_contact_label` exists;
`review_queue` and `learner_roster` call it; the live `learner_roster` also
has 075's `lesson_completion` body). `supabase/verify/073_telegram_learner_label.sql`
seeds a Telegram-only learner, an email learner, one with both, one with a
Telegram identity and no username, one with neither, and a learner who only
touched course B. It asserts, for all three RPCs: `@username` for the
Telegram learner (positive control: the editor of B sees the B learner's
username); the email wins when both exist; an empty label for the last two;
no row of the other course's learner; zero rows for a non-editor beside a
non-empty editor result; `authenticated` and `anon` cannot call the helper.
Local: PASS. Hosted: the CLI does not print NOTICEs, so a copy of the script
that raises at its PASS line surfaced "AUTH-019 PASS reached" (every earlier
assertion held); user, identity, course and enrolment counts were identical
before and after (20 / 22 / 0 / 4). Measured at 360px, see ui-decisions.

**Re-applying 073 alone undoes 075.** 075 re-emits `learner_roster` from
073's body, so applying 073 again on a database that has 075 restores the
pre-075 `lessons_completed` (attempts, not completion). The verify script
checks for it. Re-apply 075 after 073 (shown locally: 073 re-applied, check
failed; 075 re-applied, PASS, and 075 again, PASS).

## Revisit if

A privacy-policy change widens or narrows what an author sees.
