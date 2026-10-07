# 0081 — ANON-009: signup acquisition (course + channel per account)

## Context

The partner needs to see which free course each registered learner came from
(partner spec 2026-10-06; owner pulled it into M2 on 2026-10-07, because it is
the only part of that spec that loses data if it lands after launch). The two
genuine-signup moments already exist and already receive the signup's `next`
path and the tab's funnel `source`: `/auth/confirm`'s token_hash branch and
`/auth/callback`'s new-account branch (0069 Decision 6). `funnel_events` has
no user id by design (051), so nothing tied a channel or a course to an
account. The admin view that reads this is M3.

Settled before the card was worked (prompt series, owner 2026-10-07):
attribution is the signup moment, not the first-ever visit; `source = null`
writes no row; no backfill.

## Decision 1 — its own table, not columns on `profiles`

`profiles` rows are readable by people other than their owner: tutors
("profiles: linked read", 006), group co-members ("profiles: group co-member
read", 014) and admins (027). A column there would show a learner's
acquisition channel to their group. `signup_acquisitions` (migration 053) has
an owner-read policy only and no write grant; the only writer is
`record_signup_acquisition()`.

## Decision 2 — the course comes from `next`, resolved in SQL

`lib/acquisition.ts` extracts a slug-shaped string from the `next` path after
`safeNext()`. It resolves the path with the WHATWG parser against a throwaway
origin first, so dot segments, backslashes and `//host` forms are normalised
the way a browser would, then decodes the slug segment once (as the App Router
does for `[courseSlug]`) and checks it against the slug shape `create_course()`
enforces (044). Whether that slug is a PUBLISHED course is decided by the RPC
(`status = 'published'`); anything else — `/`, `/app/...`, an unknown or
unpublished slug — records the row with `course_id = NULL`. No client-supplied
id is ever accepted.

## Decision 3 — the RPC refuses accounts older than 24 hours (owner, 2026-10-07)

The RPC is granted to `authenticated`, so any signed-in session could call it
directly through PostgREST, not only through the two auth routes. Write-once
already stops it from changing a row; without a guard, an account created
before this shipped could still attribute itself once, after the fact. The
RPC reads `auth.users.created_at` and returns `not_a_new_account` when it is
more than 24 hours old.

24 hours is ASSUMED to cover the longest a signup-confirmation link can stay
valid (GoTrue's email OTP expiry, configurable in the dashboard, believed to
be capped at 24 hours). Not verified against the hosted project's setting.

**What would make us revisit this:** the hosted project's OTP expiry is set
longer than 24 hours, or M3's Telegram sign-in adds a signup path where the
account is created well before the first session (neither is true today).

## Decision 4 — the routes await the write (owner, 2026-10-07)

`recordServerFunnelEvent` is fire-and-forget (`void`). This write is awaited
instead: it is one RPC on a session the route already holds, and work left
running after a route returns its response is not guaranteed to complete on
Vercel. It still never blocks or alters the redirect:
`recordSignupAcquisition()` swallows errors and refusals and only logs them.

## Decision 5 — the session client, not the service role

The row is keyed on `auth.uid()`, so the helper takes the route's own session
client, the same one `verifyOtp` / `exchangeCodeForSession` just signed in.
`claimPendingAttempts` in `/auth/confirm` already relies on this (0068
Decision 4). A service-role call would have to pass a user id as a parameter,
which is exactly the client-trusted id the card rules out.

## Decision 6 — export and deletion follow `lesson_attempts`

Export reads the row directly under the owner's session, with the course's
slug and title embedded, and the export format version goes from 2 to 3 (the
ANON-003 precedent for a new section). `delete_my_account()` is re-emitted
from 048 with one added `DELETE`: deletion anonymises the profile instead of
deleting it (docs/adr/0002), so the FK cascade never fires. Hard delete, not
anonymisation: nothing else reads another learner's acquisition row.

## Known gaps (proposed as cards, not fixed here)

- AuthScreen's email and OAuth signups (`/signup`, `/login` in register mode,
  and the landing header's "Log in" link that leads there) thread no `source`,
  so a learner who registers that way is never attributed. Resolved for
  the landing link by ANON-014, see 0085.
- Anything that changes `next` on the way to the routes changes the course.
  M3's sign-in prompt on lessons the partner does not mark open (partner,
  2026-10-07) is expected to pass the lesson path as `next`, and so inherits
  this write.

## Finding — email confirmation was off on the hosted project (2026-10-07)

Post-apply check against the hosted project: a plain `signUp`, made the way
`RegistrationOffer` makes it, returned a session with `email_confirmed_at`
already set, and wrote no `signup_acquisitions` row. With confirmation off,
an email signup never reaches `/auth/confirm`, so this card records email
signups only once confirmation is on. The owner is turning it back on before
launch (launch checklist §1, the Resend sending domain). The same gap hits
OPS-008's `signup` event and `RegistrationOffer`'s "check your email" copy.

**What would make us revisit this:** a decision to launch with confirmation
off. That needs a third write path, where `signUp` returns a session, and is
a new card, not a change to this one.
