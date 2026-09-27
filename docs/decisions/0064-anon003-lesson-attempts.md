# 0064 — ANON-003: lesson_attempts table shape and deletion treatment

## Context

0048 settled the migration mechanism and 0063 (ANON-002) already committed
the client to a specific RPC name and payload shape
(`record_lesson_attempts(p_attempts jsonb)`, batched, snake_case keys). This
card had two things left to decide that neither settles: the table's own
shape (in particular, how idempotency is enforced), and how account
deletion should treat these rows.

## Decisions

**1. `attempt_id` is the table's primary key, not a separate unique
constraint.** 0048 Decision 3 requires the RPC to be idempotent on the
client-generated attempt UUID. Making that UUID the PK means `INSERT …
VALUES (v_attempt_id, …) ON CONFLICT (id) DO NOTHING` is the whole
idempotency mechanism — no separate index, no pre-check query.

**2. Malformed or not-entitled elements are dropped from the batch, not
failed as a whole.** ANON-003's own acceptance line only requires "checks
`can_read_lesson` for each attempt" and a duplicate-is-a-no-op contract;
it says nothing about all-or-nothing batch semantics. Since the RPC exists
specifically to "empty the whole local store in one round trip" (0063), one
bad element (an entitlement that lapsed between recording and uploading, a
future client sending a shape this version doesn't recognise) should not
block every other attempt in the same upload from landing. `record_lesson_
attempts` returns `{ ok: true, inserted: N }` either way; N can be less than
the batch size with no error surfaced. If a future card needs the caller to
know *which* elements were dropped and why, that is a return-shape
extension, not a re-litigation of this choice.

**3. Deletion is a hard `DELETE`, not anonymisation.** `docs/adr/0002`'s
anonymise-not-delete pattern exists because `results`, authored questions
and group content are visible to OTHER users (leaderboards, shared group
history) and six FKs to `profiles` block a hard user delete outright.
Neither reason applies here: nothing else in the app reads another user's
`lesson_attempts` (no English-course leaderboard exists — deliberately out
of scope, `docs/handoff.md`), and `lesson_attempts.user_id` is a FK the
migration itself controls, not one of the six blocking FKs the ADR
documents. Keeping the rows around unattributable would just be dead
weight with no equivalent of "the result stays intact for the person on the
other side of that shared history."

**4. Export reads the table directly (owner-scoped RLS SELECT), not
through a new RPC.** Matches the existing `results`/`user_achievements`
pattern in `app/api/account/export/route.ts` — a plain `.select()` under
the caller's own session, RLS as the actual boundary. No new RPC needed
since the export route already runs as the authenticated owner.

## What would make us revisit this

- If a future UI wants to show partial-batch upload failures to the
  learner (e.g. "3 of 5 attempts couldn't be saved"), the silent-drop
  contract in Decision 2 needs a richer return shape.
- If English-course progress ever needs to be visible to anyone other than
  the learner (a course-level leaderboard, an author-facing analytics
  view), Decision 3's "nothing else reads this" premise breaks and the
  anonymise-not-delete pattern would need reconsidering.
