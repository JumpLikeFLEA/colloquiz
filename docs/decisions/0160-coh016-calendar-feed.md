# 0160 — COH-016: a private .ics calendar feed

Status: built; migration 086 written and applied to the local stack twice, where
`supabase/verify/086_calendar_feed.sql` prints `COH-016 PASS` after 33 asserted
cells. **Not applied to the hosted project**, as the card asks ("Written, not
applied; print rule"). Decided unattended under `--no-approval`; each call below is
one the owner can overturn.

## Context

docs/decisions/0141 Decision 16 adds a private `.ics` subscription feed to the
calendar of 0159, so a learner's or teacher's dates show in Google or Apple
Calendar. A calendar app cannot sign in, so the address itself is the credential.
The live privacy policy (`docs/release/legal/privacy-policy.md`: §3.2 data table, §4 legal
basis, §5 "Dates and the calendar feed", §7 retention, §8 export, §9 deletion)
already describes this feature: a hashed token, turning the feed off or replacing
the address stops it, retention "until you replace it or close your account", the
export says whether one exists and never the token, closing the account deletes it.
So the card's stop condition ("if it doesn't, stop and ask") did not fire.

## Decisions

1. **The token is a credential stored only as a hash.** `calendar_feed_tokens
   (user_id PK, token_hash, created_at)`; the token is 64 hex characters from two
   `gen_random_uuid()` values (about 244 bits), shown once by
   `rotate_calendar_feed_token()` and stored as `sha256(token)`. One row per user,
   so replacing is an UPSERT and the old address dies in the same statement.
   Rejected: encrypting the token so it can be shown again (a second secret to
   guard, and the policy promises only a hash is kept).
2. **"Turn off" is built, though the card names only create and rotate.** The
   policy (§5: "turning it off, or replacing the address, stops it") promises it.
   `revoke_calendar_feed_token()` deletes the row.
3. **One reader, reached with the token by borrowing the identity.**
   `calendar_feed(token)` (granted to anon) hashes the argument, finds the user and
   returns that user's rows from `my_calendar('learner')` and `my_calendar('teacher')`,
   by setting the transaction's `request.jwt.claims` to that user for the call and
   restoring it before returning (and on an exception). Rejected: parameterised copies
   of `my_calendar`, `calendar_events`, `my_homework` and `teacher_homework_list` (four
   places to restate who sees what, which 0158 and 0159 refused). The cost is a
   SECURITY DEFINER function that impersonates inside its own body; verify section 5
   prints that the caller's claims are put back, and sections 3 to 4 that one user's
   token returns only that user's rows, each beside a positive control. It is VOLATILE
   for `set_config`.
4. **Both roles in one feed.** The rows keep their role (`learner` / `teacher`) and
   the UID carries it (`learner-run_start:<id>@colloquiz.app`), so an admin who is also
   enrolled gets two events, not one clobbering the other. UIDs are stable: the row's
   own key from `my_calendar`, never derived from the time of the fetch.
5. **404 for anything that is not a live token.** Malformed, unknown, replaced and
   revoked all answer the same `404 Not found`; a valid token with no dates answers
   200 with an empty calendar (verify: `x` has a token and no dates). The route path
   `/api/calendar/<token>.ics` is public because `proxy.ts`'s matcher excludes `/api`
   (its own comment, bottom of the file), so no `publicRoutes` entry is needed or added:
   the card's wording ("in proxy.ts publicRoutes") describes a mechanism that does not
   apply here. The route uses a session-less anon client, so a signed-in browser's
   cookies change nothing, and sends `Cache-Control: private, no-store`, `X-Robots-Tag:
   noindex` and `Referrer-Policy: no-referrer`. There is no rate limit of its own: 244
   bits is not guessable, and the read costs what a page load of `/my` costs. A leaked
   address is replaced from the same panel. The address is part of the request URL, so
   it will appear in whatever request logs the host keeps; that is an assumption, not
   something I checked, and the policy's §5 already warns that anyone with the address
   can read the dates.
6. **The feed's language is chosen when the address is made.** An anonymous request
   knows no cookie, so the panel appends `?lang=ru` when it was shown in Russian
   (`/my` follows the saved choice) and the labels follow it; everything else is
   English. `lib/calendar/labels.ts` holds the kind labels so the page and the feed
   cannot drift.
7. **What an event carries.** Instants as UTC (`DTSTART:...Z`), so the subscribing
   calendar places them in its own zone; a homework due date as an all-day
   `VALUE=DATE` event with an exclusive `DTEND` (0159 Decision 6). A call has no
   stored duration, so it has no `DTEND` and shows as a point in time; inventing one
   would mislead. `SUMMARY` is the label (with the title where there is one, plus the
   course for run and week dates), `DESCRIPTION` the course title, `URL` the Meet or
   event link when it is an https link. `DTSTAMP` is the fetch time (required, and the
   only thing in the output that depends on it). `REFRESH-INTERVAL` and
   `X-PUBLISHED-TTL` suggest six hours; clients may ignore them. The calendar is named
   "Alliengll", the English surface's live name (0137).
8. **The panel.** "Subscribe in your calendar" on `/my`'s calendar (EN/RU with the
   saved choice) and `/studio/calendar` (English): Create, then the address with Copy,
   Replace (behind an in-place confirm that says the old link stops working) and Turn
   off. A plain `fetch` to `POST /api/calendar-feed`, not a Server Action (0086 on
   re-rendering). The panel is a small client component, +2.5 KB on `/my`.
9. **Account export and deletion.** `calendar_feed_status()` feeds
   `calendar_feed: { enabled, created_at }` in the export (format version 13 to 14);
   neither the address nor its hash is exported. `delete_my_account` is re-emitted from
   082 with one DELETE, because an account is anonymised, not deleted, so the
   `ON DELETE CASCADE` never fires. Verify section 8 deletes an account and counts the
   token gone and its address answering null.
10. **Deploy order.** `/api/account/export` calls `calendar_feed_status()` and fails
    without 086, as it did before 077, 080 and 082 (0149 "Surprises"). Apply 086 before
    deploying. `/my` and `/studio/calendar` leave the panel out, with the error logged,
    if the status read fails.

## Not done by a session

The card's positive control, "the owner subscribes from a phone calendar on
production and sees a call", needs production and a phone. It is left to the owner;
the local equivalent (an anonymous GET of the address returns the learner's call as a
VEVENT) is in the card's evidence comment.

## What would make us revisit it

- A client mishandles the feed (a missing `DTEND` on calls, `REFRESH-INTERVAL`, a long
  `UID`): fix the builder, the unit tests pin the format.
- The address is found in logs or a referrer: add a short-lived signed alternative.
- Calls get a duration: emit `DTEND`.
- Anyone wants the feed in a different language from the page they made it on: store
  the language with the token.
