# 0068 — ANON-004: registration offer and progress migration

## Context

0048/0066 (ANON-001/ANON-006) built the cross-browser claim mechanism
(`pending_claims`, the create/claim endpoints) but deliberately left the UI —
the offer itself, the signup form, and wiring the two endpoints into the real
confirmation round trip — to this card. Several implementation choices were
not settled by either prior decision and are recorded here.

## Decisions

**1. Inline offer, not a separate route.** The offer lives inside
`LessonCompletion` (replacing the `RegistrationOfferSlot` stub PLAY-007 left),
not a `/register` page. The acceptance line "shown after a completed lesson,
never before one" is naturally satisfied by mounting it exactly where
PLAY-007 already gates the score box — `lessonScore.status === "scored"`
(same signal, no new one) — and it needs no route of its own since it must
appear on the lesson page itself. It only renders when `!isSignedIn`, so a
returning signed-in learner never sees it.

**2. "Completed lesson" = `status === "scored"`, i.e. at least one item
attempted.** `LessonScoreResult` (lib/items/lessonScore.ts) has only two
states, `"scored"` / `"unscored"` — there is no "every item attempted" signal
anywhere in the player (docs/handoff.md: no locks, no forced order, no
passing score), so this is the only available "a lesson has actually
happened" signal and is the same one the progress banner already uses.

**3. Where the claim token travels: `next` AND `claim` both live inside the
single `emailRedirectTo` string, and `/auth/confirm` unwraps it.** This was
tested empirically against a real local Supabase stack (Docker + `npx
supabase start`, Mailpit), not assumed. First finding: GoTrue's mail
templates always render `{{ .RedirectTo }}` as the **entire**
`emailRedirectTo` string, correctly percent-encoded as one opaque value —
there is no way to add a second, sibling top-level query param on the link
the template constructs; whatever `emailRedirectTo` was, that whole string
becomes the value of the template's own `next=`. Confirmed with Mailpit: a
signup with `emailRedirectTo:
"http://localhost:3000/auth/confirm?next=%2Fcourses%2Fc%2Fl&claim=TOKEN"`
against this project's own custom `confirmation.html` template (which reads
`next={{ .RedirectTo }}`) produced a link whose `next=` value was that
*entire* string, itself percent-encoded one level deeper. So `RegistrationOffer`
builds `emailRedirectTo` as one URL carrying both `next` and `claim` as its
own query params, and `/auth/confirm/route.ts`'s new `unwrapNext()` tells
apart the two shapes `next` can arrive in when the route reads *its own*
incoming request: a bare path (`"/reset-password"` — the existing recovery/
default-signup case, where GoTrue's own `/verify` already did one redirect
hop and handed `/auth/confirm` a clean `next=`/`code=` pair) vs. a whole
absolute URL (this card's new case, where the confirmation link points
directly at `/auth/confirm` with no GoTrue-side hop in between) — `new URL()`
throws on the former and succeeds on the latter, which is the signal used to
pick the path apart with no added flag. Verified end-to-end: a `pending_claims`
row created for a real (seeded) free lesson was correctly claimed and its
attempt landed in `lesson_attempts` under the confirming user, via a plain
`curl` GET of the real link with its own fresh cookie jar (standing in for
"browser B") against the actual running route.

**4. The claim happens server-side, inside `/auth/confirm`, not a separate
client page.** After either successful branch (`code` exchange or
`token_hash`/`verifyOtp`) establishes a session, the route reads `claim` and,
if present, calls `claim_pending_claim` directly through the same
session-bound `supabase` client before redirecting to `next`. This avoids a
second network round trip after the redirect and avoids any question of
whether the just-set session cookie is visible to a subsequent client-side
call on first paint. A claim failure (expired/already-claimed/not-found) is
logged and does not block the redirect — the account is still confirmed and
signed in either way; only the attempt migration is lost, which matches
0066's own "the token is spent even when its content is rejected" stance
(an inert failure, not a hard error).

**5. `code`-flow signups are a known gap for the cross-browser case, and are
avoided by using the `token_hash` template — confirmed both hosted and
locally.** If a given confirmation link uses PKCE (`?code=...`) rather than
`token_hash`, `exchangeCodeForSession` only succeeds in the browser that
initiated signup (existing comment in `app/auth/confirm/route.ts`), so a
genuinely cross-device confirmation on that flow lands on `/login` with no
session and the claim never runs — this is pre-existing, documented behavior
for password recovery on this exact route, not a new limitation. The verify
skill records that this project's actual hosted confirmation emails already
use `token_hash`+`type=email` (not `.ConfirmationURL`/PKCE) for the standard
signup flow, which is the flow that matters for ANON-004's cross-browser
acceptance line. This card adds the matching **local** template
(`supabase/config.toml`'s `[auth.email.template.confirmation]` +
`supabase/templates/confirmation.html`) so a local `enable_confirmations =
true` run exercises the identical path — this was the template used for the
Decision 3 verification above. **Owner action required for the hosted
project**: the Supabase Dashboard's "Confirm signup" email template must
contain `next={{ .RedirectTo }}` (not merely `type=email`, which the verify
skill already confirmed) for `RegistrationOffer`'s claim token to survive the
round trip on production — this could not be inspected from this
environment, only inferred from the verify skill's `type=email` observation
and confirmed to be *sufficient* by the local template built to match. If the
hosted template's `next=` is hardcoded rather than derived from
`{{ .RedirectTo }}`, the claim token will not reach `/auth/confirm` on
production even though every code path here is correct — this is the single
highest-priority item to confirm before relying on this in production, flagged
again in "What would make us revisit this" below.

**6. Progress migration also covers the same-browser case, proactively.**
`uploadPendingAttempts` (ANON-002/005) was previously only triggered from
`handleScore` — a learner who finishes an entire lesson anonymously and only
*then* signs in (OAuth completing in the same browser, or a same-browser
email click) would have local attempts sitting unsynced with nothing to
trigger their upload. `LessonPlayer` now also flushes once on mount whenever
`isSignedIn && lessonVersionId`, reusing the exact same
`recordSignedInAttempt` path `handleScore` already calls — no new upload
logic, just an additional trigger point. Idempotent on `attemptId` either
way (0048 Decision 3), so a mount-time flush racing a `handleScore` flush is
harmless.

**7. OAuth is hidden (not merely warned) inside a detected in-app browser,**
with an explanatory line replacing the buttons rather than disabling them in
place. `lib/inAppBrowser.ts` is a pure user-agent substring check
(`Instagram`, `Telegram`) — the two channels docs/handoff.md names as how
learners arrive. This satisfies ANON-004's acceptance line ("hidden, or come
with a warning") without waiting on OPS-007's on-device pass, which this
card's own acceptance text says verifies the underlying Google-webview
rejection on a device, not whether ANON-004 needs to react to it — Google's
policy itself is already public/documented, not something this card is
guessing at. If OPS-007 later finds additional in-app browsers relevant to
this audience (or that Telegram's webview UA doesn't actually contain
"Telegram" on some platform), `lib/inAppBrowser.ts` is the one place to
extend — see its own "what would make us revisit this" note.

**8. No new Colloquiz component is imported.** The offer's form (email/
password fields, OAuth buttons) is a new, small component
(`app/components/lesson-player/RegistrationOffer.tsx`) written against the
same primitives already used elsewhere on this surface, not a reuse of
`AuthScreen`/`Field` — those live under `app/(colloquiz)/(auth)/` and import
`framer-motion`, forbidden in an English-route bundle
(docs/handoff.md, performance boundary). `ProviderIcons` (already extracted
for `Settings`, no heavy deps) is reused as-is. `@supabase/ssr` is imported
dynamically inside the submit handler only, mirroring `LessonPlayer`'s own
`recordSignedInAttempt` — an anonymous visitor who never opens the offer
form never downloads that chunk.

**9. Consent checkbox included, mirrored from `AuthScreen`, copy
translated.** The 13+/Terms/Privacy clickwrap (migration 036,
`docs/ui-decisions.md`'s 2026-08-29 entry) is a legal requirement on every
account-creation path on this domain, not a Colloquiz-specific one — the
Terms/Privacy pages themselves stay English (0018 Decision 5 exempts legal
chrome), but the surrounding consent copy is Russian like the rest of this
surface's chrome.

**10. Open redirect at `/auth/confirm` and `/auth/callback`, found in
pre-push review, fixed with `safeNext()` (`lib/safeNext.ts`), not a
pattern-match sanitiser.** Both routes built their post-auth redirect as
`` `${origin}${next}` `` with `next` read straight off the request (or, after
this card, unwrapped from inside `emailRedirectTo` — Decision 3). This is
exploitable: `next = "@evil.com"` turns that concatenation into
`"http://site.com@evil.com"`, which the WHATWG URL parser reads as userinfo
`site.com` followed by host **`evil.com`** — confirmed by actually parsing
the resulting string, not asserted from reading the code. The direct case
(a bare `next` query param with no validation) predates this card entirely —
the original `/auth/confirm` and `/auth/callback` already did this before
ANON-004 touched either file. This card's own `unwrapNext()` (Decision 3)
added a *second* route to the same unvalidated sink: an attacker's own
`emailRedirectTo` can carry `next=%40evil.com` as ITS embedded `next=`,
which passes Supabase's `additional_redirect_urls` allow-list (that check
only matches the outer origin+path pattern, never the query content) and
comes out the other end of `unwrapNext()` unchanged.

The fix, `lib/safeNext.ts`, resolves with `new URL(next, origin)` and keeps
only `pathname + search + hash` when the resolved `.origin` matches, falling
back to `/` otherwise (parse failure included). This was chosen over
pattern-matching the string for `//`, `@`, backslashes, control characters,
etc. because a blocklist of shapes is always incomplete — that incompleteness
*is* the bug being fixed. Handing the string to the same parser a browser
uses and checking what it actually resolves to answers "where would this
navigate," not "does this string look suspicious." Applied at all three
`` `${origin}${next}` `` sinks the codebase has (confirmed by `rg -n
'\$\{origin\}\$\{' app lib`): both branches of `/auth/confirm` (after
`unwrapNext`) and `/auth/callback`.

## What would make us revisit this

- **Owner confirmation (or update) of the hosted project's actual "Confirm
  signup" email template** — this card's mechanism was verified end-to-end
  against a local Supabase stack running the matching custom template added
  here (`supabase/templates/confirmation.html`), not against the hosted
  project's real template content, which is dashboard-only and not visible
  from this environment. If the hosted template's `next=` is static rather
  than `{{ .RedirectTo }}`, the owner needs to update it to match the local
  one (same category of action as applying a migration — done by the owner
  against the hosted project, not by a session). Until then, the offer's
  same-browser path (default upload, Decision 6) and the OAuth path both work
  regardless, since neither depends on the email template at all — only the
  cross-browser `claim` migration is at risk.
- OPS-007's device pass finding a relevant in-app browser this UA check
  misses, or finding Google's OAuth rejection behaves differently than
  assumed.
- If a course's free sample grows large enough that a single lesson's worth
  of local attempts approaches 0066's 16 KiB payload cap before the learner
  ever sees the offer (payload growth was sized for "several lessons," not
  bounded by when the offer appears).
