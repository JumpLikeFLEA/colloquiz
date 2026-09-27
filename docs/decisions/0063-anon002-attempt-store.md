# 0063 — ANON-002: local attempt store shape and the record RPC contract

## Context

ANON-002 (issue #99) is the client-side half of whatever 0048 decided. 0048
settled the migration *mechanism* (claim token, upload paths, idempotency by
client UUID) but left two things unsettled that this card's implementation
had to pick, since neither is decided anywhere else and ANON-003 (not yet
built — `lesson_attempts` table + record RPC) has to match whatever is
chosen here:

1. Whether the local store keeps every attempt or overwrites down to just the
   best per block.
2. The record RPC's name and payload shape.

## Decisions

**1. The store keeps every attempt, never overwrites.** `docs/handoff.md`,
"Scoring and progress": *"Display the best score, always. Every attempt is
stored; the best is what is shown."* That line is written about the system
as a whole, and the local store is where an anonymous learner's attempts
live before an account exists — so it is a store of record for at least some
of a learner's attempts, not merely a staging buffer, and "every attempt is
stored" applies to it directly. `bestForBlock` (`lib/lessonPlayer/
attemptStore.ts`) is a derived read (`max` over `earned/possible`) rather
than a value maintained at write time, which is what makes "never lowers a
visible number" (ANON-002 acceptance line 2) true by construction: appending
a worse attempt cannot change what `bestForBlock` returns.

**2. The record RPC is `record_lesson_attempts(p_attempts jsonb)`, batched,
not one call per attempt.** ANON-003's own acceptance line reads "checks
`can_read_lesson` for each attempt" (plural, one RPC call), and a batch call
is the natural shape for "empty the whole local store in one round trip" —
the upload path (`uploadPendingAttempts`) has no reason to serialize N
network calls when the RPC can loop over an array server-side. Payload per
element: `{ attempt_id: uuid, lesson_version_id: uuid, block_id: text,
earned: numeric, possible: numeric }` — `attempt_id` is what ANON-003's
uniqueness check (its own acceptance line) keys on for idempotency (0048
Decision 3). This is a naming/shape choice for a function that does not
exist yet; ANON-003 must implement `record_lesson_attempts` with this exact
name and parameter to match, or this decision must be revisited alongside
it.

**3. `uploadPendingAttempts` takes an explicit `AttemptStore` and
`SupabaseClient` rather than owning its own timer or effect.** Matches the
existing `lib/duels.ts`/`lib/groups.ts` convention of taking a client
parameter for testability, and keeps the question of *when* to attempt an
upload (mount of an authenticated route, right after sign-in, …) a caller
decision — no wiring exists yet for that caller, since it depends on
ANON-003 actually existing server-side.

**4. Storage failure handling is per-call, not a permanent "give up" flag.**
Every `getItem`/`setItem` call is individually wrapped in `try/catch`; there
is no persistent "storage is broken, stop trying" state. A backend that
always throws degrades to the in-memory `attempts` array serving every read
for the rest of the page's life, functionally identical to a flag-based
short-circuit, without the extra state to get wrong.

## What would make us revisit this

- If ANON-003 lands with a different RPC name, parameter shape, or a
  one-call-per-attempt design, this file and `attemptStore.ts`'s JSDoc need
  updating together — the contract is currently asserted by this card alone,
  unverified against real server code.
- If a future card needs cross-device visibility of "every attempt" (a
  review-of-mistakes UI, say) rather than just the best, the local store
  already has the data; only a new read function would be needed, not a
  schema change.
