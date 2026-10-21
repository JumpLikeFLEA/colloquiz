# 0187 — VOICE-012: transcribe, analyse and store a take

Status: written 2026-10-21 (VOICE-012, #235). Migration 097 is applied to the local stack
and, at the owner's instruction, to hosted on 2026-10-21 (see "Hosted"). `VOICE_ANALYSIS_MODE` stays `off` in
production until OPS-026 is published and OPS-027 turns it on, so nothing here runs there yet.

## Context

0156 Decisions 1, 4 and 5: a sent take becomes a stored analysis with no person in the loop.
AssemblyAI transcribes it, `claude-sonnet-5-5` analyses it with structured output, and what
Claude returns is checked before it is stored. 0182 measured the providers; 0185 built the
table, the ledger and the caps and left to this card the lease, the pipeline, the status route
and "pause" (0185 Decisions 9 and 10).

## Decisions

1. **One state machine in the database row, no webhook.** `voice_analyses.status` moves
   `pending → transcribing → analysing → done | failed`. Whoever holds the lease runs the next
   step. The send's own `after()` is the first run; `GET /api/voice/submissions/[id]/analysis`
   offers a row that has not moved for 30 s to the pipeline; the daily cron fails rows older
   than 24 h. 0182 Decision 6 (runtime logs drop lines written after the response) is why
   progress is a column and not a log line.
2. **Migration 097 (new functions plus one column, nothing re-emitted).** `stt_job_id`
   (no grant), `voice_analysis_claim`, `voice_analysis_advance`, `voice_analysis_pause`,
   `voice_analysis_sweep`, all service_role only. The card's acceptance names no migration;
   0185 Decision 10 names the pause function as a VOICE-012 requirement, and an atomic lease
   cannot be written without SQL. Treated as settled by 0185, not as a new choice; flagged
   because a schema addition is on the `--no-approval` stop list.
3. **A job id is stored the moment the job exists.** A run that dies after `create` is
   re-claimed and polls that job; it does not create a second one (a second job is a second
   charge and a second transcript to delete). The take's length in seconds is stored with the
   transcript (`usage.audioSeconds`, written by `advance`) so a re-claimed run still reports
   whether the 180 s cap cut the take.
4. **`off` and `paused` both pause.** SQL cannot read the variable, so the analysis row exists
   at send time in every mode (0183 Decision 10) and a cohort learner can send under `off`. The
   pipeline's first act under either is `voice_analysis_pause`: it deletes the still-pending row
   and un-counts the send with reason `paused`. A row a provider already touched is not paused.
   Verified under `paused`: the take and its object are stored, no analysis row, ledger
   `counted false / paused`, no provider named in the server log.
5. **The provider is never given a URL that names the learner.** A take's signed URL carries
   `{course}/{user}/{take}` in its path and in the token inside it. 0182 Decision 2 rules out
   `/v2/upload`. So the pipeline copies the audio to `<uuid>/<uuid>.<ext>` in the same bucket,
   signs that for 10 minutes, and removes the copy once the transcript is stored (an unreferenced
   object left by a crash is removed by the daily purge after 24 h). `namesNoUser` is tested
   against the take's own name as the control.
6. **Loopback exception: `/v2/upload` on a local stack only.** AssemblyAI cannot fetch a
   `127.0.0.1` URL, so on a loopback signed URL the bytes go through `/v2/upload`. A hosted
   project never has a loopback host (`isLoopbackUrl`, tested), so 0182 Decision 2 holds in
   production. It is the only way to run the pipeline against real keys on a development
   machine, which the card requires. The hosted staging path is unit-tested but has not run
   against real keys (see "Not measured").
7. **The transcript is stored, then deleted at AssemblyAI, then Claude is called.** Delete is
   checked by a GET that must read "Deleted by user." with no words (0182 Decision 3). A failed
   delete does not fail the analysis; `usage.sttDeleted` records it. On a re-claim the DELETE is
   repeated, which the provider answers the same way.
8. **What is stored is what Claude saw.** Angle brackets in the transcript (and in the task
   prompt and expressions) are replaced by a space before they go into a tag, so speech cannot
   close `</transcript>` and inject text. The stored transcript is that version, and every
   offset in `result` is into it.
9. **Validation (lib/voice/analysis/validate.ts).** A quote is kept only as an exact substring
   of the transcript it claims (edge whitespace forgiven, nothing else) and at most 200
   characters. Items of one list that overlap are resolved in the model's order; lists are not
   resolved against each other (an expression legitimately sits inside an error). At most one
   hesitation; an expression must be on the author's `listenFor` list; a correction equal to
   its quote is dropped; `main_error` is remapped, or null if its error was dropped; `then`
   must be in the baseline transcript and `now` in this one. Every count is computed from what
   was kept; the schema has no field a model could put one in. Nothing is escaped or stripped:
   quotes and notes stay text, and the view renders text.
10. **Which instruction (0156 Decision 10).** `before` → `first` with its goal; no role →
    `first` without the goal; `after` → `final` when the learner's `before` take has a
    transcript, otherwise `first` without a goal. The baseline is the learner's current take on
    the course's `before` block in the same slot, found through the published documents.
11. **`messages.parse` throws instead of returning null for a cut-off answer, a schema break and
    a refusal that came with words.** Probed on SDK 0.104.1 with canned responses: all three
    throw `AnthropicError: Failed to parse structured output…` and the stop reason is lost;
    only a refusal with no content returns (`stop_reason: refusal`, `parsed_output: null`).
    All are mapped to a non-transient failure (`llm_unparsable` / `llm_refusal`): the job is
    failed and its send given back, which is the card's "a refusal or `max_tokens` ends the job
    failed and uncounted". A connection error, a 429 and a 5xx are transient: nothing is
    recorded and the next poll tries again. The failure code stored is a short word, never a
    provider message.
12. **Model variable.** `VOICE_ANALYSIS_MODEL` (the card), then `ANTHROPIC_MODEL_VOICE` (0182
    Decision 9, already set in `.env.local`), then `claude-sonnet-5-5`. Effort `high` (0182
    Decision 4); `max_tokens` 8000 against a measured maximum of 2,501.
13. **Instructions are read from `prompts/voice-analysis/{first,final}-v0.md` at request
    time** and shipped with the routes by `outputFileTracingIncludes` (`/api/voice/**`).
    Verified in a production build: the three voice routes' `.nft.json` list both files.
    They are the VOICE-009 bench drafts; VOICE-013 owns version 1. `prompt_version` records
    `first-v0` / `final-v0`.
14. **The daily sweep also deletes the provider copies** of the rows it fails, and returns a
    non-200 if any delete fails, so Vercel's cron log shows it.

## Evidence (local stack, real keys; `scripts/voice-analysis-local-run.ts`, run 3)

Takes are the owner's A2 and A2-B1 recordings transcoded to webm/opus mono 48 kb/s (as in
0182); they are not browser recordings.

- **A, a take reaches done** through the real route under `next dev`: send 200
  `analysed true`; `transcribing` at 1.1 s, `analysing` at 9.3 s, `done` at 21.6 s. Row:
  `first` / `first-v0` / `claude-sonnet-5-5`, 63 s analysed, not truncated, counts
  `errors 4, highlights 3, hesitations 1, expressionsUsed 1 of 4`, nothing dropped,
  `sttDeleted true`, lease cleared, ledger `counted true`. The provider's record afterwards:
  `text "Deleted by user."`, `words null`. Cache: this call read the instruction's 2,037 tokens (cacheWriteTokens 0), written by an
  earlier run minutes before.
- **B, killed mid-way:** the server was killed while the row was `transcribing` with job
  `1fcc27e1…`; after a restart, status polls changed nothing for 152 s (the real 150 s lease),
  then `analysing` and `done` at 162.5 s. `sameJob true`, `sttDeleted true`.
- **C, paused:** send 200 `analysed true`; no analysis row; ledger `counted false`,
  `uncounted_reason paused`; take row and object stored; the server log names neither provider.
- **D, payloads:** nine outgoing requests captured in-process. The AssemblyAI create body is
  `{audio_url: https://cdn.assemblyai.com/upload/<hash>/<uuid>, speech_models, disfluencies,
  language_code, audio_end_at}`; the Anthropic body is the instruction and the
  tagged task prompt, expressions and transcript. Scan for the learner's id, email, local part,
  full name, the course id and the take id: all `false`; the control (the take's own object
  name contains the learner's id) `true`.
- Cleanup afterwards: 0 submissions, 0 ledger rows, 0 courses left.
- `supabase/verify/097`: `VOICE-012 PASS: 097 full protocol (59 asserted cells)`; re-applied
  once without error; `096` (100 cells) and `094` (83 cells) still PASS.
- `npm run check` exit 0; `npm test` 147 files, 1,719 tests.

## Not measured

- **The 180 s cap against the real API.** Both takes were 53 and 63 s. `audio_end_at` was
  accepted (the job completed), but nothing longer than 180 s ran, so the API's treatment of it
  is unverified; the code reads the take's length from the response and reports `truncated`.
- **The hosted staging path** (copy, sign, remove) has run only in unit tests, because
  AssemblyAI cannot reach a local stack. The first hosted run is OPS-027's.
- **`final` with a baseline** ran in unit tests only; the scenarios used a `before` task.
- **A hidden tab / a function the platform stops early**: not measurable here; the lease and
  the sweep are the answer, and scenario B shows the lease.

## Surprises

- Run 2 of the script failed after the restart in scenario B: the status route answered an HTML
  page, not JSON. Run 3, with the script changed only to print the body and the server log on
  that case, did not reproduce it. The cause is **unknown** (a request landing while the
  restarted dev server was still compiling is a guess, not a finding).
- The killed `next dev` processes corrupted two generated, git-ignored files under
  `.next/dev/types` (a `tsc` error each time). Removing `.next/dev` fixed both.
- `server-only` is a Next-internal alias with no package on disk, so a script that imports
  `lib/voice/analysis/server.ts` needs an empty stub on `NODE_PATH`.

## Proposed cards (not absorbed)

- **Withhold errors on low-confidence words** (0182 Decision 10): needs word confidences kept
  past the transcript step.
- **Sweep provider transcripts whose delete failed** on a finished analysis
  (`usage.sttDeleted false`). The daily sweep covers stuck rows only.
- VOICE-014 requirement: the status route returns `{status, result}` for the owner's visible
  row and `none` for a hidden one; "withdrawn" and "analysis limit reached" (0185) still need
  their own reads.

## Hosted

Applied 2026-10-21 through the hosted-apply gate, at the owner's instruction after the card
was committed (the card said "written, not applied").

- Print rule right before applying: latest migration 097 (the previous one 096), latest
  `delete_my_account` body 096 (re-emitted there from 090); 097 does not define it.
- Probe before (read-only, `db query --linked`): history `094,095,096` with 097 pending; the 2
  tables and 4 functions it requires present; `stt_job_id` and the four new functions absent;
  0 takes, 0 analyses, 0 ledger rows.
- Not destructive: `ADD COLUMN IF NOT EXISTS` and `CREATE OR REPLACE`. Applied by
  `db query --linked -f`, exit 0, then `migration repair --status applied 097`
  (`migration list --linked`: local and remote matched through 097).
- Probe after: `stt_job_id` present; `voice_analysis_advance`, `_claim`, `_pause`, `_sweep`
  present; service_role can execute `voice_analysis_claim`, authenticated and anon cannot;
  authenticated cannot SELECT `stt_job_id`.
- `supabase/verify/097` on hosted: the CLI does not print NOTICE, so the plain run exits 0
  with no output (every assertion RAISEs on failure). To print the PASS line, a scratch copy
  with only the final `RAISE NOTICE` turned into `RAISE EXCEPTION` was run:
  `VOICE-012 PASS: 097 full protocol (59 asserted cells)`.
- Afterwards, read-only: 0 seeded users and courses, and 0 rows in `voice_submissions`,
  `voice_analyses`, `voice_analysis_sends`, `voice_object_deletions`, and 0 objects in the
  voice bucket.

`VOICE_ANALYSIS_MODE` in production was not inspected (unset means `off` in code). With 097
applied the routes can run the pipeline on hosted; it still does nothing until the mode is `on`,
`ASSEMBLYAI_API_KEY` and `CRON_SECRET` are set on Vercel, and OPS-026 is published.

## Revisit when

- A real learner take disagrees with the figures in 0182 (0182 "Revisit when").
- The 150 s lease or the 30 s re-claim threshold produces a duplicate or a visibly slow
  recovery on real traffic.
- The SDK returns `parsed_output: null` instead of throwing (Decision 11): the stop reason
  could then be recorded.
