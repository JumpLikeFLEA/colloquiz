# 0107 — COH-003: invite links (create, claim, revoke)

Status: **decided unattended** (COH-003 ran `--no-approval`). Each decision
fills a gap that 0093 (COH-001), 0095 (OPS-019) or 0066 (the token format
this card was told to follow) leaves open. None of them changes a rule
those files state.

## Context

The partner is paid outside the app and enrols each paying learner by
sending an invite link for a run and a tier (docs/handoff.md "Payments").
0093 Decision 2 (option c) fixes what a claim writes: ONE `run_enrolments`
row; a revoke sets that row's `revoked_at`. 0095 fixes the label rules:
the name and contact the author types are personal data, editors only,
exported and erased with the account once claimed, purged 30 days after an
unclaimed invite expires or is revoked. Built in
`supabase/migrations/059_run_invites.sql`; the protocol is in #156's
closing comment.

## Decision 1 — the token is generated in SQL, hashed at rest

0066's format, unchanged: 128 random bits, 32 hex chars raw, SHA-256 hex at
rest. 0066 generated it in the Next.js route because its create function was
service-role only and took a caller-supplied IP. Here the creator is a
signed-in editor calling an RPC under their own session, so
`create_run_invite` generates the token itself (`extensions.gen_random_bytes`,
pgcrypto, present on Supabase) and returns it once. Nothing outside the
database ever chooses a token, and there is no client-supplied hash to
validate.

Consequence: a link can't be shown twice. A lost link is revoked and
replaced. The dialog says so.

## Decision 2 — rate limit: 100 creates per editor per rolling hour

049's log + `BEFORE INSERT` trigger shape, keyed by the editor's user id
(there is a session, so no IP is needed), swept inline on each create (051 /
052). A cohort is tens of learners and the partner creates them in one
sitting after payments arrive; 100 leaves room for that while still capping
a runaway script. Claims are not separately rate-limited: a guess has to hit
one of 2^128 tokens, and every claim already requires a session.

## Decision 3 — a learner already in the run is refused, and the invite stays unspent

If the claiming account already has an active enrolment in that run,
`claim_run_invite` returns `already_enrolled` and does not consume the
invite. The alternative (consume it, or update the tier) would turn a
duplicate link into a silent tier change, which 0093 leaves to an editor
("Tier change … updates `tier` in place … flagged, not decided further").
The claim page says the account is already in the run, before the Join
button is ever shown (the preview carries `already_enrolled`).

## Decision 4 — Join is a button, not a claim on GET

The page never writes on load. A signed-in learner sees "You'll join as
<email>" and a Join button, a plain form POST to `/api/invites/claim` that
303s to the course page (the `/auth/sign-out` precedent, 0086: no client
JS). Two reasons: link previewers (Telegram, Instagram in-app browsers)
fetch URLs, and a learner signed in to the wrong account must be able to
see that before the link is spent. This costs one tap after sign-in.

## Decision 5 — expiry: 30 days, or the run's end, whichever is first

The invite stores `created_at + 30 days`. The run's end is read at claim
time rather than copied, because an unstarted run's `ends_at` is recomputed
by 058's trigger. A claim into an ended run is reported as `expired`, which
is what the learner needs to hear, instead of 058's enrolment guard raising
`run_ended`. The purge window (Decision 6) counts from the same moment.

## Decision 6 — purge: daily pg_cron job, unclaimed rows deleted outright

`purge_unclaimed_run_invites()` deletes every unclaimed invite whose end
(the earliest of `revoked_at`, `expires_at` and its run's `ends_at`) is 30
days or more in the past. It runs daily at 03:23 UTC through pg_cron (033's
precedent; the extension is already on the hosted project). So a label
outlives its 30 days by under a day. Deleting the row rather than nulling
the label leaves nothing to reason about later; after 30 days the editor has
no use for an expired, unclaimed row. A lazy sweep on create (049's
approach) was rejected: the promise in privacy-policy.md §7 has to hold even
if the partner stops creating invites.

Claimed invites are kept. Their label belongs with the enrolment (0095), and
`delete_my_account` deletes them (re-emitted from 058, one added line).

## Decision 7 — labels are read only through functions

`run_invites` has no grants at all (the `run_calls` pattern, 058). Editors
read through `course_run_invites(course)`, which returns zero rows to anyone
who doesn't edit that course. The learner who claimed an invite reads their
own label only through `my_claimed_run_invites()`, for the export
(privacy-policy.md §8). `run_invite_preview(token)` never returns the label.
That is how "readable by editors only" and "included in your export once
claimed" both hold.

## Decision 8 — `/invite/*` leaves the legacy redirect list

`next.config.ts` 308'd every `/invite/:path*` to `/app/invite/:path*`
(SHELL-001's moved-segments list), which made the claim page unreachable
(found in this card's browser run: `/invite/<token>` → 308). `invite` is
removed from that list. The legacy tutor invite (`tutor_invites.token`, a
UUID since 006) keeps its redirect through a UUID-shaped matcher, so old
tutor links still land on `/app/invite/...`, and the two token shapes can't
reach each other's page. `StudentsView` now builds the `/app/invite/` URL
directly instead of relying on the redirect.

## Decision 9 — the claim page is English with no toggle

As the card says. `pageLangForPath` returns `en` for `/invite/<token>`, so
`<html lang>` and the footer match. Its strings live in `inviteCopy.ts`,
imported only by the Server Component page.

## What would make us revisit this

- Self-serve sales: a claim would then follow a payment, and the invite
  might carry a payment reference (0093 "Revisit if").
- The partner loses links often enough that "show it once" hurts. Storing
  the raw token would need its own decision; it makes the table a list of
  live credentials.
- Abuse of the claim endpoint (Decision 2 has no claim limit).
- A request to change a learner's tier: a separate editor action, not a
  second invite.
