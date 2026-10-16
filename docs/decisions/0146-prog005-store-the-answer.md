# 0146 — PROG-005: store each signed-in answer

Context: 0141 Decision 7 chose to store every signed-in attempt's answer in a
nullable `response` column. This records the choices that decision left open.
Migration 074 is written, not applied.

## Decisions

1. **What is stored.** The item type's own response object, exactly what the
   renderer passed to `score()` (`buildSelectionResponse`, `buildSlotsResponse`,
   ...). The renderers now call `onScore(result, response)`; nothing is
   re-derived from the result.
2. **Size cap: 4096 bytes of `response::text`, in
   `lesson_attempt_response_max_bytes()`.** An over-cap answer is dropped to
   NULL and the score row is kept. 4096 is an assumption, not measured against
   the published lessons; the cost of being wrong is a missing answer, not a
   missing score.
3. **Older local entries.** `StoredAttempt.response` is optional; an entry
   without one uploads `response: null`. No local-store version bump.
4. **Cross-browser stash.** `pending_claims.payload` is capped at 16384 bytes
   (049). Answers make the payload bigger, so `withinByteCap` nulls every
   response when the payload would exceed the cap, rather than losing the whole
   stash. The constant moved to `attemptStore.ts` (pendingClaims.ts re-exports
   it; the client cannot import pendingClaims.ts, it uses `crypto`).
5. **Read access unchanged.** Owner-read policy only. Teacher reads are TCH-003.
6. **Export** includes `response`. `delete_my_account` (latest body: 061, line
   212) already deletes the rows.

Revisit: if a published lesson's answer exceeds the cap (check the NULL rate
of `response` where `earned > 0` after applying); if PROG-003 needs answers for
a block whose attempt was never recorded.

## Verification (074 applied by the owner, 2026-10-16)

Run against the hosted project with two temporary users, deleted after
(cleanup printed: both deleted, 0 leftover attempts). One RPC call by user A
with four elements on a free lesson version: a response, no response, an
earned 9 / possible 3 with a 5000-character response, and an explicit null.
Result: `inserted: 4`; A read back all four rows (response kept on the first;
NULL on the other three, the third also capped to earned 3 of 3); B read `[]`;
anon got "permission denied for table lesson_attempts"; A's direct UPDATE got
"permission denied for table lesson_attempts"; the service role saw 4 rows
(so B's `[]` is not an empty table).
