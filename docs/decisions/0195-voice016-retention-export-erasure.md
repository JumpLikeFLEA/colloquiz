# 0195 — VOICE-016: voice analyses in the export, the purge and erasure

Status: written 2026-10-22 (VOICE-016, #241). Migration 098 is applied to the local stack and, at the owner's
instruction on 2026-10-22, to hosted through the gate (see "Hosted").

## Context

0156 Decision 7: a self-paced take's audio, transcript and analysis are deleted together 6 months after the
take was sent; a cohort take's 6 months after the run ends; export and erasure include transcripts and
analyses; "Rejected: keeping the analysis after the audio is purged". 096 (VOICE-011) already cascades an
analysis away with its take and deletes the send ledger in `delete_my_account`; `voice_purge_due` (094)
already lists a self-paced take at `submitted_at + 6 months` and a cohort take at `ends_at + 6 months`.
What was missing was the purge's effect on the analysis, the ledger's own expiry, and the export.

## Decisions

1. **Migration 098; `delete_my_account` is not re-emitted.** The latest definition is 096 (printed at the
   top of the migration). Erasure needs no change, so it is proved, not edited (Decision 6).
2. **Purge: `voice_mark_removed` deletes the analysis.** Re-emitted from 060 (its only definition). A
   retention-purged take keeps its row with `object_name` NULL and `purged_at` set; in the same statement
   its `voice_analyses` row, and so its transcript and result, is deleted. Only takes whose `object_name`
   is in the list are touched, so a replaced take (row already gone) and an erased account behave as before.
   The analysis cannot outlive the audio: both leave in one call, after the Storage API removed the object.
3. **The ledger expires at 6 months, unless an analysis still points at it.** `voice_purge_ledger(p_now)`
   (service_role) deletes `voice_analysis_sends` rows older than 6 months with no `voice_analyses.send_id`
   referencing them. Reason: `send_id` is `ON DELETE CASCADE`, and a cohort take is purged 6 months after the
   RUN ends, up to a run's length after its send; deleting the row at 6 months would delete a live analysis
   before its audio goes, against "together". That analysis goes at its own purge and the ledger row on the
   next daily run (verified, supabase/verify/098). The card says "ledger rows older than 6 months are
   deleted"; this is that, with one stated exception (a row an analysis still needs), decided unattended.
4. **This ends 0185 Decision 5's lifetime per-task cap.** The per-task cap counted ledger rows, and the
   ledger outlived the purge so a purged self-paced task stayed capped at 3. With the ledger deleted at 6
   months, a learner gets a fresh allowance for a task 6 months after their sends. That follows from the
   card's own acceptance line; 0185 named exactly this as its revisit trigger. No change to the cap trigger.
5. **The cron calls `voice_purge_ledger` after the objects, independently.** `app/api/cron/voice-purge`
   runs it whether or not an object removal failed, so a storage outage does not keep ledger rows past
   their 6 months. A ledger error answers 500 like a removal failure.
6. **Export: `my_voice_analyses_export()`.** SECURITY DEFINER, keyed by `auth.uid()`, returns the caller's
   analyses including withdrawn ones: the owner's RLS policy hides a withdrawn row from the owner (096), so
   the export cannot read the table as the caller. Returned: submission, status, kind, transcript, result,
   prompt version, model, the take it was compared with, `hidden_at`, timestamps. Not returned: `usage` (our
   cost), `failure` (an internal string), `hidden_by` (another person), `lease_until`, `send_id`. In the
   file: `voice_analyses` (top level, keyed by `submission_id` like `voice_submissions`), `withdrawn_at`
   in place of `hidden_at`; `EXPORT_FORMAT_VERSION` 15 → 16; one line in `EXPORT_CONTENTS`. A purged take's
   analysis is absent, as its audio is.
7. **The ledger is not exported.** It records that a send happened (user, lesson, task, time) and whether
   it counted. That is the same fact `voice_submissions.submitted_at` already exports for a live take, and
   the rest is our bookkeeping. Revisit if a data-access request names it.

## Verification (supabase/verify/098, local stack)

`VOICE-016 PASS: 098 full protocol (40 asserted cells)`. Seeded learners a (take 7 months old), b (ledger
row 7 months old with a live analysis), c (withdrawn analysis), d (erased); positive control beside every
denial (a stranger exports 0; a user session calling the service-role functions gets 42501, service_role
can). Printed counts:

- before the purge (a, b): takes with audio 2, analyses 2, transcripts 2; after: 1, 1, 1 (a's gone, b's intact).
- ledger: today 0 deleted of 4; with a and b aged 7 months, 1 deleted (a's, nothing points at it), b's stays
  while its analysis lives and b's analysis is intact; after b's own purge the next run deletes b's row.
- erasure of d: before ledger 1, analyses 1, takes 1; after 0, 0, 0, and no analysis row carries d's
  transcript; c's ledger row and withdrawn analysis (1, 1) are untouched.

Earlier verify scripts for the objects 098 touches re-run and pass: 094 (83 cells), 096 (100), 097 (59),
083, 093, 068. `npm run check` exit 0; `npm test` 1854 passed. Migration applied twice locally.

## Not here

- The privacy policy's retention table had no row for the send ledger ("a count of how many recordings of
  each task you have sent" is listed in section 3.2, with no retention). Added at the owner's instruction
  (2026-10-22, no card): a row in section 7 of the draft 1.7 (still unpublished, so no version bump; "Last
  updated" moved to 2026-10-22). The owner re-reads it when publishing 1.7 (OPS-026).

## Hosted

Applied 2026-10-22 through the hosted-apply gate, at the owner's instruction.

- Print rule right before applying: latest migration 098 (the one applied), latest `delete_my_account` body
  096, `voice_mark_removed` still 060's.
- Probe before (read-only, `db query --linked`): history matched through 097 with 098 pending; the 5
  required functions and 4 required tables present; `my_voice_analyses_export` and `voice_purge_ledger`
  absent; `voice_mark_removed` without `voice_analyses`; `delete_my_account` names the ledger (096); 0 rows
  in `voice_analyses`, `voice_analysis_sends` and `voice_submissions`.
- Not destructive: `CREATE OR REPLACE` of two new functions and one re-emitted; no DROP, TRUNCATE, or
  DELETE/UPDATE of an existing row at apply time. Applied by `db query --linked -f`, exit 0, then
  `migration repair --status applied 098` (`migration list --linked`: 098 local and remote both `098`).
- Probe after: both new functions present; `voice_mark_removed` now names `voice_analyses`;
  `my_voice_analyses_export`: authenticated yes, anon no; `voice_purge_ledger` and `voice_mark_removed`:
  service_role yes, authenticated no.
- `supabase/verify/098` on hosted: the plain run exits 0 (the CLI prints no NOTICE); a scratch copy with only
  the final `RAISE NOTICE` turned into `RAISE EXCEPTION` printed `VOICE-016 PASS: 098 full protocol (40
  asserted cells)`.
- Afterwards, read-only: 0 seeded users and courses, and 0 rows in `voice_analysis_sends`, `voice_analyses`,
  `voice_submissions`, `voice_object_deletions` and the voice bucket.

Deploy this commit after this point: the export route and the purge cron now find their functions.

## Revisit when

- A learner returning after 6 months should keep their lifetime cap (Decision 4).
- A data-access request asks for the ledger (Decision 7).
- Runs become longer than a few weeks, so that Decision 3's wait for the next daily run matters.
