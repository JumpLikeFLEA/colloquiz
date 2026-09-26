# 0048 — ANON-001: attempt storage and the anonymous→account migration

## Context

Progress from an anonymous playthrough lives in the in-app browser's
localStorage (Instagram or Telegram in-app webview). The email-confirmation
link Supabase sends typically opens in the device's *system* browser, not the
in-app webview the lesson was played in — so that browser's localStorage is
empty. "Migrate local attempts after registration" therefore has nothing to
migrate, in the common case, unless the mechanism accounts for this split
explicitly. Confirmations will be ON at launch (owner, 2026-09-24; hosted
project has them OFF today only temporarily — see the ANON-001 card notes).

## Options considered

**(a) Upload local attempts when the signup form is submitted.**
Already dropped before this decision was reached (recorded in the ANON-001
card's own acceptance line): with confirmations ON there is no live,
confirmed session at the moment the form submits, so nothing proves the
anonymous attempts belong to the not-yet-real account. Not re-evaluated here.

**(b) A claim token carried in `emailRedirectTo` — CHOSEN.**
See "Decision" below for the full mechanism.

**(c) Supabase anonymous users, created lazily at lesson end (off the
critical path) — REJECTED.**
Reasons given for rejection (owner, 2026-09-26):
- contradicts the handoff's "progress lives in localStorage until
  registration" rule (`docs/handoff.md`, Audience and language);
- an `auth.users` row and a session for every lesson-completer, not only
  registered learners;
- `auth.users` growth plus a cleanup problem for rows that never convert;
- captcha friction on the anonymous sign-in call;
- MAU billing of anonymous users on the Supabase plan.

**These five reasons are recorded as the stated rationale, not as
independently verified facts.** No prior source for them was found in this
repo (checked `docs/`, `scripts/board/backlog.mjs`, git history) before this
decision was written. In particular, whether Supabase's current plan bills
anonymous users toward MAU, and what its cleanup story for stale anonymous
rows is, should be re-verified against Supabase's current docs/pricing before
being cited as fact elsewhere. The first reason (contradicts the handoff) is
independently true by inspection of `docs/handoff.md` and stands on its own.

## Decision

**Claim token, not anonymous users.** Mechanism:

1. **Default path — same-browser or already-authenticated cases.** Whenever
   an authenticated Supabase session exists in the browser that holds local
   attempts, upload them directly through the ANON-003 record RPC, then clear
   local storage. This covers: OAuth sign-in (no email-confirm redirect
   involved), a same-browser email confirmation (rare but possible — e.g. the
   learner copies the link back into the in-app browser), and any later
   login on a browser that still has local attempts sitting unsynced.

2. **Cross-browser gap — the common case.** At signup form submission, POST
   the local attempts to an unauthenticated endpoint that writes them into
   `pending_claims` (token hashed at rest, 128-bit random, ~7-day expiry, a
   payload size cap, and a per-IP rate limit — full design and full-protocol
   verification on ANON-006). The token rides in `emailRedirectTo`. The
   confirmation callback — now running with a real authenticated session —
   claims the row and feeds its attempts through the same ANON-003 record RPC
   used by the default path (§1), which re-applies its own `can_read_lesson`
   check and the `earned ≤ possible` cap per attempt.
   **`pending_claims` never writes `lesson_attempts` directly** — the record
   RPC is the only writer, so a claimed attempt for a lesson the account
   turns out not to be entitled to is rejected the same way a direct upload
   would be.

3. **Idempotency.** Each attempt carries a client-generated UUID, unique in
   `lesson_attempts`. Both upload paths (§1 and §2) are therefore safe to
   retry — a duplicate upload of an already-recorded attempt is a no-op
   rather than a second row or an error.

4. **Attempt record shape** (settles ANON-001 acceptance line 2): keyed
   `(lesson_version_id, block_id)`, per 0018 — unchanged from the existing
   `docs/decisions/0018` shape; this decision does not revisit it.

5. **Client-computed scores** (settles ANON-001 acceptance line 3): accepted
   as-is, per 0018 (answer keys already ship to the client; there is no
   English leaderboard to protect), with the server capping `earned` at
   `possible` in the record RPC. Unchanged from 0018; restated here because
   the ANON-001 card asked this decision to settle it explicitly.

6. **Best score across republished versions** (settles ANON-001 acceptance
   line 4): the score **displayed** for a lesson is
   `max(earned / possible)` across every version the learner has attempted.
   Per-block results are stored against the specific version actually
   played (not renormalized onto whatever version is current), so a review
   of "what did I get wrong" always shows the explanation that matched what
   the learner actually saw.

7. **No scheduled sweep for expired `pending_claims` rows.** The claim
   endpoint already refuses an expired token outright, so a stale unclaimed
   row is inert — it cannot be claimed, it does not affect `lesson_attempts`,
   and it carries no lesson content, only a hashed token and a small attempts
   payload. Given that, a cron sweep buys nothing beyond table tidiness. The
   lazy alternative — the `pending_claims` create RPC (ANON-006) deletes
   already-expired rows before inserting the new one — keeps the table from
   growing unbounded without needing a scheduler, a second surface to
   monitor, or a new failure mode (a sweep job that silently stops running).

## Card split (owner, 2026-09-26)

The cross-browser mechanism (§2) is substantial enough — a migration, two
endpoints, and a full-protocol verification pass — to be its own card rather
than folding into ANON-004:

- **ANON-006** (new): the `pending_claims` migration, the unauthenticated
  create endpoint, the authenticated claim endpoint, and the lazy sweep in
  §7. Full protocol.
- **ANON-004**: keeps the UI side only — the registration offer, the Russian
  signup form, the return-to-lesson path, hiding/warning on OAuth inside
  in-app browsers, and the end-to-end cross-browser demonstration, now
  calling ANON-006's endpoints rather than owning the mechanism itself.

`scripts/board/backlog.mjs` acceptance lines for ANON-002, ANON-003, ANON-004
and the new ANON-006 are updated in the same commit as this file.

## What would make us revisit this

- Confirmation that Supabase does (or does not) bill anonymous users toward
  MAU on the plan actually in use, if that plan changes — the rejection of
  option (c) leans partly on an unverified claim.
- A future requirement for progress to be visible to an anonymous learner
  across devices before registration (today's handoff explicitly rules this
  out — localStorage until registration — so this would itself be a handoff
  change, not just an ANON-001 revisit).
- Evidence that the ~7-day `pending_claims` expiry is too short (e.g. a real
  learner takes longer than a week to check a confirmation email) or too
  long (abandoned-signup rows accumulating faster than expected even with
  the lazy sweep).
