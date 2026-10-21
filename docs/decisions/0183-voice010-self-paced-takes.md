# 0183 — VOICE-010: signed-in learners send voice takes on self-paced courses

Status: written 2026-10-21 (VOICE-010, #232). Migration 094 is applied to the local
stack and, at the owner's instruction, to hosted on 2026-10-21 (see "Hosted").

## Context

0156 Decisions 2, 3 and 7 let any signed-in learner who can open a lesson send a
voice take. Before this, `submit_voice_recording` (supabase/migrations/060) required a
non-revoked enrolment, and the Storage INSERT policy required `has_course_entitlement`,
so a free-course learner could not upload at all.

## Decisions

1. **Migration number 094, not 084.** The card was written when 084 was next; 084
   through 093 were taken since (`ls supabase/migrations`). VOICE-011's "085" is stale
   the same way and gets re-derived when that card is worked.
2. **A self-paced take is a `voice_submissions` row with `enrolment_id` NULL.** The old
   `UNIQUE (enrolment_id, lesson_id, block_id)` never matches two NULLs, so a partial
   unique index on `(user_id, lesson_id, block_id) WHERE enrolment_id IS NULL` keeps one
   current take per learner per voice task. Verified: a second row is refused, a
   different block id is accepted, and the old constraint still refuses a duplicate
   enrolled row (supabase/verify/094).
3. **Narrower than the card's wording.** The card says a self-paced slot is used "when
   no enrolment opens the lesson". 094 uses it only when the caller has NO non-revoked
   enrolment in the course at all. An enrolled learner whose enrolment does not open the
   lesson yet (a comped cohort learner in a week that has not started) still gets
   `not_enrolled`, as before. Otherwise their take would land in a slot nobody reviews,
   while the cohort promise (0156 Decision 3) is that the partner reads it. The TS hint
   (`voiceSendSlot`) mirrors this. Verified: `en2` (granted, enrolled in a run that has
   not started) gets `not_enrolled` on the entitled lesson and `ok:enrolment` on the
   anyone lesson.
4. **A self-paced slot needs a published course.** A grantee or editor of a draft
   course gets `not_enrolled`, not a take. The Storage policy's old branch
   (`has_course_entitlement`) is kept, so an upload by a grantee of a draft is still
   possible (060's behaviour) but the RPC will not file it; the daily purge removes the
   orphan after 24 h.
5. **The Storage policy goes through a new `can_send_self_paced_voice(course)`.**
   `_lesson_access_at` has no grants (058), and a policy runs as the caller, so it
   cannot call it. The wrapper is SECURITY DEFINER, takes no user argument (always
   `auth.uid()`), and requires: published course, an unarchived lesson whose PUBLISHED
   version has a voice task, and that lesson `open` for the caller. Requiring a voice
   task is narrower than the card's "an open lesson" and shrinks what a signed-in user
   can upload to. The RPC remains the decision; the policy is a courtesy to the bucket.
6. **`save_voice_feedback` refuses a self-paced take** with `self_paced_take`, after the
   editor check (a non-editor still gets `forbidden`, so existence is not probed). The
   code is mapped in `lib/courseAuthoringErrors.ts` (409).
7. **Retention:** `voice_purge_due` lists a self-paced take 6 months after
   `submitted_at` (0156 Decision 7). Verified at fixed clocks: not due a day or a second
   before, due at exactly 6 months, and the cohort branch (run end + 6 months) unchanged.
8. **Never in the review queue or the inbox.** `review_queue` and `learner_recordings`
   join through `run_enrolments`, so a NULL-enrolment row cannot appear; nothing was
   changed there. Verified against a cohort course holding one enrolled and one
   self-paced take: the enrolled take is listed, the self-paced one is absent (the
   enrolled take is the positive control that the check is not vacuous). `learner_roster`
   and `course_stats` still count a self-paced taker as a learner who opened the lesson
   (their `takes` CTEs read `voice_submissions` by user), which is the existing meaning
   of "learner" (0116) and was left alone.
9. **Account deletion needs no change.** `delete_my_account` (090) deletes the caller's
   `voice_submissions` by `user_id` and queues every object under their segment.
   Verified for a learner with two self-paced takes.
10. **`VOICE_ANALYSIS_MODE` gates the UI, not the database.** `parseVoiceAnalysisMode`
    reads `on | paused | off`; unset or anything else is `off` (fails closed).
    `voiceSendSlot` gives a signed-in, non-enrolled learner on an open lesson Send mode
    unless the mode is `off`; an enrolled learner keeps Send in every mode (today's
    cohort behaviour). `paused` still uploads (0156 Decision 6). An environment variable
    is invisible to SQL, so once 094 is applied a hand-made client can upload whatever the
    flag says. That is the card's stated reason for not applying it to hosted yet.
11. **`getVoiceTasksContext` takes `lessonOpen`.** The lesson page passes
    `lesson.state === "ok"`, the state it already computes from `lesson_state`.

## Known gaps, deliberately left

- **No per-user upload cap.** Any signed-in user can now put objects of up to 10 MiB in
  the bucket under a published course that has an open voice lesson; unsent ones are
  purged after 24 h. The caps in 0156 Decision 6 count analyses (VOICE-011), not uploads.
  Proposed as a new card rather than absorbed here.
- **The recorder still says "Sent. Waiting for feedback."** for a self-paced take. The
  learner's feedback view is VOICE-014; with the mode `off` in production nobody sees
  the state before then.

## Hosted

Applied 2026-10-21 through the hosted-apply gate, after the owner said OPS-026 was
committed and pushed and asked for 094 and 095 to be applied (the card's note said not
before OPS-026 is published; the live /terms read Version 1.3 and /privacy Version 1.7
when checked). Hosted probe before: history matched through 093, the nine required
functions present, `can_send_self_paced_voice` and the index absent, `enrolment_id`
NOT NULL, 0 voice_submissions. After: `enrolment_id` nullable, the function and index
present, the same 0 rows, `submit_voice_recording` and `voice_purge_due` bodies changed.
`supabase/verify/094` on hosted: `VOICE-010 PASS: 094 full protocol, asserted cells = 83`;
afterwards 0 seeded courses, users, submissions, objects or deletion-queue rows.

`VOICE_ANALYSIS_MODE` in production was NOT inspected: with 094 applied a hand-made
client can upload whatever it says (Decision 10). In code, unset means `off`.

## Revisit when

- VOICE-011 adds the send ledger: it will want `slot` in the RPC's answer (already
  returned: `enrolment` or `self_paced`).
- A cohort learner's earlier self-paced take (made before enrolling) should be shown or
  moved: today it stays in its own slot and is not shown once an enrolment exists.
