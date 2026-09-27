# 0066 — ANON-006: pending_claims token format, rate limit, payload cap

## Context

0048 (Decision, §2) settled the mechanism shape — a hashed token, ~7-day
expiry, a payload size cap, a per-IP rate limit on creation — and split the
cross-browser half into its own card, ANON-006, deferring the exact numbers
and a few implementation choices to it. This decision records those.

## Decisions

**Token format:** 128-bit random token, generated server-side (in the Next.js
route, not by the client) via `crypto.randomBytes(16)`, hex-encoded (32
chars). Stored at rest as its SHA-256 hex digest (64 chars) — the raw token
is never written to the database, only returned once to the caller for
`emailRedirectTo`. Generating it server-side (rather than trusting a
client-supplied token) means its randomness quality is under our control and
the create RPC doesn't have to validate entropy, only shape.

**Rate limit: 20 creates per IP per rolling hour.** Chosen as generous next
to the existing per-user precedents (feedback: 026; account export: 5/hour,
038) because this limit is per-IP, not per-user — shared NAT (a school
computer lab, a household, corporate wifi) can put many genuine signups
behind one address. Revisit if abuse is observed at this level, or if it
turns out to block a legitimate high-density signup event (e.g. the partner
running a live session with a group of students on the same network).

**Payload cap: 16 KiB**, enforced twice — a `CHECK` on `pending_claims.payload`
(migration 049, the hard backstop) and a pre-flight check in the Next.js
route (`lib/pendingClaims.ts`'s `isWithinPayloadSizeCap`, so an oversized body
gets a clean 400 instead of a raw Postgres constraint-violation round trip).
A single lesson's worth of attempts (one row per practice block, a handful of
fields each) is on the order of hundreds of bytes; 16 KiB comfortably covers
an anonymous learner who finished several lessons before registering, with
headroom before it needs revisiting.

**`create_pending_claim` is granted to `service_role` only — never `anon` or
`authenticated`.** The function takes the caller's IP as a parameter (Postgres
functions have no reliable way to see the actual browser's IP themselves —
`inet_client_addr()` would report the PostgREST/pooler connection, not the
request's origin), and that parameter is trusted verbatim for rate-limiting.
Exposing the function to `anon` over PostgREST would let any caller supply an
arbitrary IP and bypass the limit entirely. Restricting it to `service_role`
means the only path to it is the trusted Next.js route (`app/api/pending-
claims/route.ts`, via `lib/supabase/admin.ts`), which extracts the IP itself
from `x-forwarded-for` before calling in. The route is "unauthenticated" from
the *browser's* perspective (no session required) while still being a
privileged, trusted caller from Postgres's perspective — these are different
axes and this decision is explicit about not conflating them.

**IP extraction: `x-forwarded-for`, first entry, with an `x-real-ip` fallback
and a `127.0.0.1` last resort.** Not a hypothesis: per Vercel's docs
(https://vercel.com/docs/headers/request-headers, "x-forwarded-for"), *"we
currently overwrite the X-Forwarded-For header and do not forward external
IPs. This restriction is in place to prevent IP spoofing"* — the header is
Vercel-set, not client-suppliable, on this deployment. `x-real-ip` is
documented there as identical to `x-forwarded-for`. The `127.0.0.1` fallback
only fires for a request with no proxy in front of it at all (local `next
dev`), which pools all such local requests into one rate-limit bucket —
acceptable for a single developer's machine, never reachable in production.
If a proxy is ever added in front of Vercel, `x-vercel-forwarded-for` (which
Vercel documents as staying reliable specifically in that case, unlike
`x-forwarded-for`) is the header to switch to — not applicable today, since
nothing sits in front of Vercel for this project.

**Claim consumption: delete-on-lookup, not a separate `claimed_at` flag.**
`claim_pending_claim` deletes the row as part of the same statement that reads
its payload (`DELETE … RETURNING …`). A replayed token therefore finds no row
at all — `not_found` — rather than a row that has to be checked for a
claimed flag first. This also means a genuinely expired-but-unswept row is
consumed (and reported `expired`) the moment anyone tries it, which is fine:
0048 Decision 7 already treats an unclaimed expired row as inert regardless
of whether it's swept immediately or on the next create call.

**The token is spent even when its content is rejected on entitlement
grounds.** `claim_pending_claim` deletes the row (migration 049, lines
189–191) *before* handing the payload to `record_lesson_attempts`, which is
where the actual `can_read_lesson` check happens (048:117–121). So: entitlement
is re-validated on every claim (nothing about the stored payload is trusted),
but the check runs after the token is already gone. If a claimed payload
contains an attempt for a lesson the account isn't entitled to, that element
is silently dropped (same as any direct-upload rejection — 048's own
"malformed or not-yet-entitled elements are silently dropped" comment) and
the token cannot be retried to recover it — there is nothing to retry: the
account still wouldn't be entitled. This is intentional, not an oversight,
and matches the "attempt for a lesson the account cannot read is rejected by
the record RPC, not silently accepted" acceptance line — "rejected" here
means "never written to `lesson_attempts`", not "the claim fails outright".

**`pending_claims_creation_log` has no cleanup — it grows forever.** Every
create attempt inserts a row (migration 049, line 152) and nothing ever
deletes one; `pending_claims` itself is at least lazily swept (Decision 7
above), but its own rate-limit log is not. This matches the existing,
already-accepted shape of `account_export_log` (038) and the feedback
rate-limit log (026) — neither of those has a sweep either — so it is not a
new pattern, but a genuine gap all three share. Deliberately not fixed here
with an ad-hoc `pg_cron` job; see the proposed card below.

## What would make us revisit this

- The 20/hour per-IP figure proves too tight (legitimate shared-network
  signups getting rate-limited) or too loose (observed abuse).
- The 16 KiB payload cap proves too small for a real anonymous session (would
  show up as `payload_too_large` errors in production once ANON-004 wires
  this up and ships).
- A future need to call `create_pending_claim` from somewhere that isn't the
  Next.js server itself (e.g. a different trusted service) — would need its
  own `service_role`-equivalent trust boundary, not a loosening of the
  existing grant.
