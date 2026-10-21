# 0185 — VOICE-011: the analysis table, the send ledger and the caps

Status: written 2026-10-21 (VOICE-011, #233). Migration 096 is applied to the local stack
and, at the owner's instruction, to hosted on 2026-10-21 (see "Hosted").

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

Applied 2026-10-21 through the hosted-apply gate, at the owner's instruction after the card
was committed (the card said "Written, not applied"; the owner then asked for the apply and
the verify script).

- Print rule right before applying: latest migration 095, latest `delete_my_account` body
  090, working tree clean.
- Probe before (read-only, `db query --linked`): history matched through 095 with 096
  pending; the 6 required functions and 6 required tables present; `enrolment_id` nullable;
  `voice_analyses`, `voice_analysis_sends` and the 6 new functions absent; `submit_voice_recording`
  and `delete_my_account` without `voice_analysis`; `delete_my_account` is 090's (it names
  `calendar_feed_tokens` and `telegram_links`); 0 `voice_submissions`.
- Not destructive: `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, and `DROP POLICY / TRIGGER
  IF EXISTS` of the migration's own new objects. Applied by `db query --linked -f`, exit 0,
  then `migration repair --status applied 096` (`migration list --linked`: 095 and 096 both
  matched).
- Probe after: 2 tables, 6 functions, the trigger, RLS on both tables; `submit_voice_recording`
  and `delete_my_account` now name `voice_analysis_sends`; authenticated cannot SELECT the
  ledger or execute `voice_analysis_finish`, service_role can.
- `supabase/verify/096` on hosted: the CLI does not print NOTICE, so the plain run exits 0 with
  no output (every assertion RAISEs on failure). To print the PASS line, a scratch copy with
  only the final `RAISE NOTICE` turned into `RAISE EXCEPTION` was run:
  `VOICE-011 PASS: 096 full protocol (100 asserted cells)`.
- Afterwards, read-only: 0 seeded users, courses and seats, and 0 rows in `voice_analysis_sends`,
  `voice_analyses`, `voice_submissions`, the voice bucket and `voice_object_deletions`.

`VOICE_ANALYSIS_MODE` in production was not inspected (unset means `off` in code, 0183
Decision 10). With 096 applied nothing in the app writes an analysis yet (VOICE-012).

## Revisit when

- A learner returning after six months should get a fresh allowance (Decision 5).
- The cohort daily-cap rule (Decision 4) hides a take from the analysis for a reason the
  partner would want to see; Studio would then show "not analysed".
- VOICE-012's measured cost per analysis changes either cap (0156 "Revisit when").
