# 0069 — OPS-008: minimal funnel events

## Context

`docs/handoff.md`'s "settled input 3" calls for minimal funnel analytics in
M2: four events (landing view, lesson start, lesson complete, signup), each
tagged with a coarse acquisition channel (instagram / telegram / direct), so
the owner can compare which promotion channel actually converts.

## Decision 1 — write path: first-party table, not Vercel custom events

Vercel Web Analytics custom events (`track()`) require a Pro or Enterprise
plan (confirmed against Vercel's own docs, 2026-09-27: the Hobby plan gets
page views only, custom events are gated to Pro/Enterprise). colloquiz.app is
on Hobby and staying there for now (owner, 2026-09-27). So this ships as a
first-party `funnel_events` table (migration 051) written through
`app/api/events/route.ts`.

**What would make us revisit this:** moving to a Pro plan for an unrelated
reason. Even then, the first-party table costs nothing extra to keep running
and already has better retention/privacy properties than Vercel's own event
store (see Decision 3), so revisiting only means "could we stop maintaining
this," not "must we."

## Decision 2 — `landing_view` is page-independent

There is no English landing page yet — `app/(english)/` has no root
`page.tsx`, and `/` still 307-redirects to `/app` (SHELL-013's temporary
redirect, removed only once SHELL-010 ships real content). `docs/handoff.md`
forbids building a placeholder landing page to give this event somewhere to
fire from.

**Definition:** `landing_view` = fired once per browser tab, on the first
English-surface page a visitor actually lands on — not tied to a specific
route. Implemented as `EntryViewBeacon` (`app/(english)/EntryViewBeacon.tsx`),
mounted once at the shared `app/(english)/layout.tsx`, guarded by a
sessionStorage flag so it fires exactly once per visit regardless of which
page under the group is entered first. Today that's almost always the course
page (`app/(english)/courses/[courseSlug]/page.tsx`), reachable directly from
a Telegram post per `docs/handoff.md`'s "Audience and language" section, or
occasionally a lesson page for a visitor with a direct lesson link.

**Known undercount:** an Instagram bio-link visitor today lands on `/`, which
still redirects to `/app` — Colloquiz, not the English surface — so that
visit never reaches `EntryViewBeacon` at all and `landing_view` never fires
for it. This is a pre-existing gap tracked by SHELL-010, not something this
card introduces or should paper over.

**What SHELL-010 needs to do:** nothing. Once `/` serves real content under
`app/(english)/`, it inherits `EntryViewBeacon` from the shared layout
automatically, and starts contributing `landing_view` events immediately —
the definition was chosen specifically so this is true.

## Decision 3 — source attribution: sessionStorage-only, no identifier

**The design:** `lib/funnelSource.ts` classifies a visitor into
`instagram | telegram | direct` once per tab (from `utm_source`, falling back
to `document.referrer`), caches ONLY that three-value classification in
`sessionStorage` for the tab's lifetime, and attaches it to all four events.
No raw referrer, no UTM string, no visitor identifier of any kind is ever
stored — the cache holds one of three words, nothing else, and it is gone
the moment the tab closes.

**Why this, not simpler:** a channel-comparison report ("did the Instagram
push or the Telegram post convert better this week") needs every event in a
learner's session — landing, lesson start, lesson complete, and eventually
signup — attributed to the SAME channel they arrived through, not
re-derived per event from whatever `document.referrer` happens to be at that
moment (which, after the first internal navigation, is just this site's own
URL and would misclassify everything as "direct"). The classification has to
be captured once, at entry, and carried forward. It can't be reconstructed
after the fact — there is no server-side log of `document.referrer` to
backfill it from — so it has to be captured this way or not captured at all.
Removal is cheap specifically because sessionStorage already discards itself
at tab-close; there's no separate deletion path to build or forget to run.

**GPC / DNT honored:** `resolveFunnelSource` returns `null`, and touches no
storage at all, when `navigator.globalPrivacyControl === true` or
`navigator.doNotTrack === '1'`. An opted-out visitor leaves no trace of the
check itself, not even a cached "you opted out" flag.

**CNIL-style audience-measurement exemption (owner's own non-lawyer reading,
NOT legal advice — flag for a real review before this is relied on for
anything beyond "we tried to do this carefully"):** the CNIL (France's data
authority) publishes conditions under which first-party audience-measurement
tools can run WITHOUT cookie-consent-banner consent, similar in spirit to
this project's existing "strictly necessary, no banner" posture for
Vercel Analytics (`docs/release/legal/privacy-policy.md` §3.4). The
conditions this design is aimed at:
- Data stays with the site operator (first-party — `funnel_events` is our
  own Supabase table, no third-party analytics vendor receives it).
- No cross-site tracking (sessionStorage is per-origin and per-tab; nothing
  here follows a visitor to another site or correlates across sites).
- No individual profiling — the three-value classification plus which of
  four coarse events fired is not enough to build a behavioral profile of a
  specific person, and no identifier (IP, cookie, fingerprint) is stored
  alongside it in `funnel_events` itself (the IP that DOES briefly exist, for
  rate-limiting, lives in a separate table and is deleted within the hour —
  see the migration 051 header's "RETENTION" note).
- Purpose limited to measuring aggregate audience/conversion, not ads or
  resale.
- An opt-out signal (GPC/DNT) is honored.

This is the owner's own reading of publicly available guidance, recorded so
the reasoning is visible, not a substitute for counsel reviewing the actual
implementation before this is treated as settled.

**Utm_source is the reliable signal.** Referrer-based classification is a
fallback for organic taps, not the primary mechanism — the promoted links
Alliengll posts (Instagram bio link, Telegram channel posts) should always
carry `?utm_source=instagram` / `?utm_source=telegram` themselves, since
in-app browsers (Instagram's, Telegram's) are known to strip or rewrite the
`Referer` header inconsistently.

## Decision 4 — write path follows the ANON-006 pattern, not feedback's

`funnel_events` has RLS ON, NO policies, and an explicit `REVOKE ALL` from
`anon`/`authenticated` — the same shape as `pending_claims` (migration 049),
not `feedback`'s own-row insert policy (026). Reason: every one of these four
events can fire for a visitor with no session at all (anonymous landing/
lesson play), so there is no `auth.uid()` to hang an owner-insert policy on.
The only writer is `record_funnel_event()`, a `SECURITY DEFINER` function
granted to `service_role` only, called from `app/api/events/route.ts` (client
events) and `lib/funnelEventServer.ts` (server-fired `signup`) via
`lib/supabase/admin.ts`.

An admin-read RLS `SELECT` policy was considered and dropped: with `REVOKE
ALL` in place, `authenticated` fails the table-level GRANT check before RLS
is ever consulted (same mechanism as the `profiles` column-GRANT rule,
`CLAUDE.md` "Standing rules"), so the policy would be dead code. Reading this
table today is via the Supabase SQL editor (service_role, bypasses both the
grant and RLS); a real `GRANT SELECT ON TABLE funnel_events TO authenticated`
plus an admin policy is deferred until an actual admin-dashboard card needs
it.

**Two abuse-control layers, both DB-enforced**, per migration 051's own
header:
1. Per-IP hourly cap (300/hour) via `funnel_events_creation_log` + a
   `BEFORE INSERT` trigger, same IP source as 049
   (`lib/pendingClaims.ts`'s `extractClientIp` — `x-forwarded-for` then
   `x-real-ip`, `"127.0.0.1"` fallback when neither header is present, same
   fallback `/api/pending-claims/route.ts` already uses). More generous than
   049's 20/hour because real funnel traffic (multiple people behind one
   NAT'd IP, each generating landing/start/complete events) is much higher-
   volume than a rare signup-stash action.
2. A global daily backstop directly on `funnel_events` (20,000/day, owner's
   number) — a storage/cost ceiling, not a real abuse defense.

**IP retention:** `record_funnel_event()` prunes `funnel_events_creation_log`
rows older than the 1-hour rate-limit window on every call. The raw IP is
the one identifier this design touches at all, and it must not outlive the
window it exists to serve — a longer-lived IP log could be joined back to
`funnel_events` by timestamp and defeat the whole no-identifier point of
Decision 3. No cron (same "lazy sweep on next write" choice 049 made, per
0048 Decision 7): traffic through this function is frequent enough that a
row is never far from being pruned. Verified against the local stack
(2026-09-27): 302 rows backdated to 2 hours old, one more RPC call, 301 of
them gone — only the fresh row from that call remained.

Widened OPS-015 ("Scheduled cleanup for insert-only rate-limit log tables",
not yet filed as a GitHub issue) to also report on
`funnel_events_creation_log`, even though — unlike the three tables that
card exists for — it already has its own inline prune and needs no
scheduled deletion step; the report is there to catch a regression in that
prune (a steady nonzero count), not to add a missing one.

**created_at precision:** `funnel_events.created_at` is stored
HOUR-TRUNCATED (`date_trunc('hour', NOW())`, overriding the column's own
`DEFAULT NOW()`), not full timestamp precision. A minute/second-precision
`created_at` on a `signup` row would be joinable back to
`auth.users.created_at` by timestamp for anyone with table access (the
owner, via the SQL editor) and would re-identify which learner it was — the
privacy-policy language ("These events are not linked to your account")
would be false otherwise, since `auth.users.created_at` IS visible to admin
tooling. Hour precision is still enough for the channel-comparison reporting
this table exists for. Verified against the local stack: fired an event at
real wall-clock time `13:42:07.968Z`, the stored `created_at` read
`13:00:00Z` — minute and second both zero.

**Opted-out visitors leave no sessionStorage trace at all, not just no
recorded channel.** `EntryViewBeacon.tsx`'s own "landing already fired this
visit" flag (`colloquiz_funnel_landing_fired`, separate from
`funnelSource.ts`'s source cache) originally wrote unconditionally,
regardless of GPC/DNT. Fixed to check `isFunnelOptedOut(navigator)`
(exported from `lib/funnelSource.ts`, the same check `resolveFunnelSource`
already used internally) before writing that flag. The accepted trade: an
opted-out visitor can cause `landing_view` to fire more than once in a
single visit (nothing persists across this component's remounts to prevent
it) — over-counting, never under-counting, and never a stored identifier
either way.

## Decision 5 — `lesson_start` = player opened, not first answer

Fires from its own `useEffect` in `LessonPlayer.tsx`, keyed on `attemptId`,
for every learner including a fully anonymous one. Deliberately NOT folded
into the existing sign-in-gated recording effect (`if (!isSignedIn ||
!lessonVersionId) return`) — that effect exists to record an ATTEMPT for a
signed-in learner's history, an entirely different concern from "did someone
open this lesson," and folding the two together would silently drop every
anonymous `lesson_start`, which is most of this surface's traffic.

## Decision 6 — `signup` fires server-side only

`RegistrationOffer.tsx` has no "the account actually got created" signal of
its own — only "did the `signUp`/`signInWithOAuth` request succeed," which
for the email path is still one confirmation click away from a real account.
So `signup` fires from:
- `/auth/confirm`, after a successful `verifyOtp` (the `token_hash`+`type`
  branch only). Confirmed this branch is reached exclusively via this
  project's own custom `confirmation.html` template (`type=email`), issued
  only for new-account signup confirmation — the `code`-exchange branch
  above it is default-template recovery / cross-device confirmation and is a
  different flow that must not fire this.
- `/auth/callback`, after a successful `exchangeCodeForSession`, only when
  `supabase.auth.getUser()`'s `created_at` is within the last 60 seconds.
  GoTrue's OAuth exchange gives no separate "new user" flag, so recency of
  account creation is the only available heuristic for telling a fresh OAuth
  signup apart from an existing user re-authenticating through the same
  offer.

The classified source can't reach these server routes from sessionStorage,
so it travels through the redirect URL the same way the existing `claim`
token already does — `buildEmailRedirectTo`/`handleOAuth` append
`&source=<value>` (omitted when `null`), and `unwrapNext` recovers it from
either the top-level query string or the nested wrapped URL, same precedence
rule (outer wins) already established for `claim`.
