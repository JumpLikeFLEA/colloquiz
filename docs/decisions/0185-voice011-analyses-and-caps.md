# 0185 — VOICE-011: the analysis table, the send ledger and the caps

Status: written 2026-10-21 (VOICE-011, #233). Migration 096 is applied to the local stack
only. It is NOT applied to hosted (the card says "Written, not applied"; see "Hosted").

## Context

0156 Decision 6 bounds the AI voice analysis: self-paced learners get 3 analysed sends per
voice task, cohort learners send without limit and the first 3 are analysed, everyone gets 10
analyses per rolling day, and a hidden analysis gives its send back. A replace deletes the
take (060 `submit_voice_recording`), so the count cannot live on the takes. VOICE-012 builds
the pipeline on top of what this card stores.

## Decisions

1. **Migration number 096, and `delete_my_account` from 090.** The card says 085 and 082;
   085 through 095 exist and the latest definition of `delete_my_account` is 090
   (`grep` over `supabase/migrations`: 091 to 095 do not define it). Re-emitted verbatim from
   090 with one added DELETE (the ledger); `diff` of the two bodies prints only those lines.
2. **The ledger has no foreign key to the take.** `voice_analysis_sends` is keyed by
   (user, lesson, block) and outlives a replaced take. It has no grant and no policy: only
   the trigger and the definer functions read it. Account deletion deletes it explicitly,
   because the profile row stays and its `ON DELETE CASCADE` never fires.
3. **Both caps count `analysed AND counted`.** A cohort send past a cap is stored with
   `analysed = FALSE`, so it does not count; hiding or failing an analysis sets
   `counted = FALSE`. So "a hidden analysis gives its send back" is the same rule for
   self-paced and cohort learners, and a run of unanalysed cohort re-sends never uses up
   anyone's allowance.
4. **A cohort send over the DAILY cap is accepted without an analysis, not refused**
   (owner, 2026-10-21, on the plan). The card says "refused". 0156 Decision 6 says cohort
   re-sends stay unlimited, and an AI cap must not stop a take the partner reads. A
   self-paced send over either cap is refused. Verified: `en3` (10 of 10 today) is accepted
   with no analysis row, `en4` (9 of 10) is analysed, and a self-paced learner at 10 is
   refused (supabase/verify/096).
5. **The per-task cap is lifetime** (owner, 2026-10-21, on the plan). The ledger outlives the
   6-month purge, so a purged self-paced task stays capped at 3. 0156 gives no window.
   Revisit if a learner who returns after six months should get a fresh allowance: the
   change is an age filter in `voice_analysis_enforce_caps` and the two partial indexes.
6. **The trigger decides `analysed`; the caller never does.** `submit_voice_recording`
   inserts the ledger row first, inside the existing subtransaction, and reads `analysed`
   back. The PT429 of a refusal leaves the function before the previous take is touched, and a
   `duplicate_submission` rolls the ledger row back with the subtransaction, so a duplicate
   consumes nothing (verified, `dup`). A per-user advisory lock serialises concurrent sends so
   two requests cannot both read "2 of 3".
7. **How a cap is told apart.** Both caps are PT429. DETAIL is `task_cap` or `daily_cap`;
   HINT is the time the oldest of the ten leaves the window (ISO 8601 UTC) for the daily cap.
   PostgREST passes them as `details` and `hint` with HTTP 429; measured on the local stack
   with a throwaway function raising the same error (dropped afterwards):
   `HTTP/1.1 429 cap`, `{"code":"PT429","details":"daily_cap","hint":"2026-10-21T18:07:26.342170Z",...}`.
   `lib/voice/analysisCaps.ts` parses it (vitest); `app/api/voice/submissions/route.ts`
   answers `{ ok: false, error: "voice_cap", kind, retryAt }` with 429.
8. **`voice_analyses` columns and reads.** One row per take, `ON DELETE CASCADE` from
   `voice_submissions`. SELECT is column-level: `usage`, `lease_until`, `failure`,
   `hidden_by`, `baseline_submission_id` and `send_id` are not granted to any app role, so a
   `select *` from a user session fails by design and callers name their columns (the 006
   allow-list rule, applied to a read). The owner reads their own non-hidden rows; an editor
   reads rows on courses they edit, hidden ones too (0156 Decision 9). No app role writes.
9. **Writes go through three functions.** `hide_voice_analysis` (authenticated; `forbidden`
   for a non-editor and for an absent row, then `seat_lapsed` from `_studio_can_write`, then
   only a `done` analysis can be hidden). `voice_analysis_finish` and `voice_analysis_fail`
   (service_role only) are UPDATE-only on a non-terminal row, so a late result for a replaced
   take, whose row cascaded away, matches nothing and returns FALSE. This is the minimum the
   card's "a late result writes nothing" needs; the lease claim and re-claim, the pipeline
   and the status route stay in VOICE-012.
10. **The analysis row is created at send time, whatever `VOICE_ANALYSIS_MODE` says.** SQL
    cannot see the environment variable (0183 Decision 10). A `paused` send therefore counts
    until VOICE-012 gives it back. `uncounted_reason` already allows `'paused'` for that; nothing
    writes it yet. **VOICE-012 requirement:** under `paused`, call a function that un-counts the
    send with reason `paused` (it needs one more service_role function; not added here because
    nothing could call it).
11. **083's verify script counts the guarded functions** and now reads 41: `hide_voice_analysis`
    calls `_studio_can_write` (the comment there lists each addition, as 084 and 087 did).

## Surprises

- **A cohort learner's 4th send leaves them with no analysis at all.** Sending replaces the
  previous take, whose analysis cascades away, and the new take gets none (0156 Decision 6:
  "only the first 3 sends per task get an analysis"). Verified: after the 4th and
  5th sends `en` holds one take and no analysis row. VOICE-014's view must say so ("analysis
  limit reached") rather than show nothing. Proposed as a requirement on VOICE-014, not
  absorbed here.
- **A hidden analysis disappears from the owner's reads** (the card's RLS: the owner reads
  non-hidden rows). 0156 Decision 9 wants the learner to see "Feedback withdrawn — send
  again". VOICE-014 needs a definer function that returns a "withdrawn" state for the
  owner's own take without exposing the row. Requirement on VOICE-014.
- **The recorder still shows its generic "Try again" for a cap** (`submitOutcome`'s default
  for an unknown code). Cap wording belongs to VOICE-014 with the rest of the feedback copy;
  with the mode off in production nobody meets it before then. No UI changed here, so no
  `docs/ui-decisions.md` entry and no 360px measure.

## Not here (other cards)

- Deleting the transcript and analysis at the 6-month purge, export and erasure of
  transcripts: VOICE-016. (Erasure already removes the rows: Decision 1, verified on `x`.)
- The pipeline, the providers, the lease and the status route: VOICE-012.

## Hosted

Not applied. 096 changes `submit_voice_recording`, `delete_my_account` and adds two tables,
none destructive, so the hosted-apply gate could pass, but the card says "Written, not
applied". When it is applied: the gate's probes first (the re-emitted bodies are 094's
`submit_voice_recording` and 090's `delete_my_account`), then
`supabase/verify/096_voice_analyses.sql`, with the earlier scripts re-run (list in the
card's evidence comment).

## Revisit when

- A learner returning after six months should get a fresh allowance (Decision 5).
- The cohort daily-cap rule (Decision 4) hides a take from the analysis for a reason the
  partner would want to see; Studio would then show "not analysed".
- VOICE-012's measured cost per analysis changes either cap (0156 "Revisit when").
