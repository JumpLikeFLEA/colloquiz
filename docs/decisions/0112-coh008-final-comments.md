# 0112 — COH-008: final comment storage

Status: **decided unattended** (COH-008 ran `--no-approval`). Each decision
fills a gap the card or 0110 leaves open; none changes a rule they state.
Built in `supabase/migrations/061_run_final_comments.sql`. The protocol
output is in #181's closing comment (local stack; 061 applied locally only).

## Context

At the end of a cohort run the partner writes each learner a closing
comment. VOICE-006 is where she writes it; COH-005 shows it next to the
before/after recordings. 0110 ("Not in this card") found that no card
created its storage. privacy-policy.md already describes it: visible to the
learner and the author (:203), kept until the account is closed and then
deleted outright (:236), in the export (:252) and erased with the account
(:276).

## Decision 1 — one row per run enrolment, voice_feedback's lifecycle

`run_final_comments` is keyed by `enrolment_id`, as the card says. It has
the same body column, validator and lifecycle as `voice_feedback` (060):

- the body is checked by 060's `_feedback_content_valid`, called rather
  than copied, so the VOICE-002 shape and the 5,000-character cap
  (`FEEDBACK_CONTENT_MAX_CHARS`) stay in one function;
- a draft has `published_at` NULL; publishing is one-way; a later save
  edits the live text.

`user_id`, `course_id` and `run_id` are copied from the enrolment when the
row is written. Without them, the read policies would have to join through
`run_enrolments`, which an editor cannot read (058 gives it an owner-read
policy only). `voice_submissions` copies the same columns for the same
reason. They can't drift: an enrolment's run and user never change, since
`_run_enrolments_guard` blocks it (058:564, `enrolment_immutable`).

A learner enrolled in two runs of a course (a repeat) gets one comment per
run, because each run is its own enrolment.

## Decision 2 — no writes on a revoked enrolment

`save_final_comment` refuses a revoked enrolment with `enrolment_revoked`.
A revoked enrolment means a refund or a chargeback (docs/handoff.md,
"Payments"). That learner did not finish the run, so there is nothing to
close. A comment published before the revocation stays readable by the
learner: privacy-policy.md keeps it "until you close your account", and the
owner read policy does not look at `revoked_at`.

The check comes after the `can_edit_course` check, so only an editor of the
course learns that the enrolment is revoked. Everyone else gets
`forbidden`.

**Revisit** if the partner wants to comment on a learner who left the run
part-way through.

## Decision 3 — the export filters drafts itself

The learner's policy returns published rows only. But an editor of a course
reads every row of it, drafts included, so an editor enrolled in their own
course (a test account) would export a draft. The route therefore filters
`published_at IS NOT NULL`, and `buildExportPayload` drops unpublished rows
as well. `voice_feedback`'s export already relies on the same pure-function
filter. `EXPORT_FORMAT_VERSION` goes 7 → 8.

## Not in this card

- Writing UI: VOICE-006. Rendering: COH-005.
- Deleting a run or a course cascades its final comments, the same as
  `voice_feedback`. That is the editor's own action, and nothing in this
  card changes it.

## What would make us revisit this

- The partner wants to un-publish a comment (060 refuses the same thing
  for voice feedback).
- The partner wants a comment for a learner whose access was revoked
  (Decision 2).
- COH-005 needs the comment keyed by learner and course rather than by run.
